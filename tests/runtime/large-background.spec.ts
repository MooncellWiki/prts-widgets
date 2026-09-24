import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("maps gridbg into a tiled background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[gridbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1/47_g14_skyovercast_L2/47_g14_skyovercast_R2",solidwidth="1280/1280",solidheight="720/720",x=-640,y=320,xScale=0.5,yScale=0.75,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: [
          "47_g14_skyovercast_l1",
          "47_g14_skyovercast_r1",
          "47_g14_skyovercast_l2",
          "47_g14_skyovercast_r2",
        ],
        initPositionMode: "default",
        layout: "grid",
        scaleX: 0.5,
        scaleY: 0.75,
        solidHeights: [720, 720],
        solidWidths: [1280, 1280],
        x: -640,
        y: 320,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  // Native port: POSITION_INIT_FUNCTION only knows
  // default/center/lowercenter/upperleft. On a key miss `_ExecuteImage` still
  // writes `_initOffset.localPosition = (0,0,0)` (VA 0x183e78d10) — the same
  // offset as `center`, not `default`.
  it.each([
    {
      name: "gridbg",
      args: 'imagegroup="a/b/c/d",solidwidth="1280/1280",solidheight="720/720"',
    },
    {
      name: "verticalbg",
      args: 'imagegroup="66_i15_4/66_i15_3",solidwidth=1280,solidheight="720/720"',
    },
    {
      name: "largebg",
      args: 'imagegroup="a/b",solidwidth="1/1",solidheight=720',
    },
  ])(
    "maps $name initposmode and treats unknown modes as the center offset",
    async ({ name, args }) => {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          `[${name}(${args},initposmode="upperleft")]`,
          `[${name}(${args},initposmode="diagonal")]`,
          '[name="A"]ok',
        ]),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();

      expect(
        renderer.gridBackgroundCalls.map((input) => input.initPositionMode),
      ).toEqual(["upperleft", "center"]);
    },
  );

  it("clears the grid panel when gridbg validation fails", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[gridbg(imagegroup="a/b/c",solidwidth="1280/1280",solidheight="720/720")]',
        '[gridbg(imagegroup="a/b/c/d",solidwidth="1280",solidheight="720/720")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // Native `_ResetPanel()` (2.7.61: 0x183e77675) drops the current picture
    // on every malformed grid instead of keeping the previous puzzle.
    expect(renderer.gridBackgroundCalls).toEqual([]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      { block: false, fadeMs: 0 },
      { block: false, fadeMs: 0 },
    ]);
  });

  it.each([
    {
      name: "gridbg",
      command: "[gridbg(fadetime=2,block=true)]",
      fadeMs: 2000,
    },
    {
      name: "verticalbg",
      command: "[verticalbg(fadetime=3,block=true)]",
      fadeMs: 3000,
    },
    {
      name: "largeimg via the legacy blok typo",
      command: "[largeimg(fadetime=0.2,blok=true)]",
      fadeMs: 200,
    },
  ])(
    "clears $name with fadetime and block when no image group is provided",
    async ({ command, fadeMs }) => {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([command, '[name="A"]ok']),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();

      expect(renderer.gridBackgroundCalls).toEqual([]);
      expect(renderer.gridBackgroundClearCalls).toEqual([
        { block: true, fadeMs },
      ]);
      expect(runtime.getState()).toBe("waiting_input");
    },
  );

  it("maps verticalbg into a vertically tiled composed background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(imagegroup="66_i15_4/66_i15_3/66_i15_2/66_i15_1",solidwidth=1280,solidheight="720/720/720/625",y=540,xScale=0.9,yScale=0.9,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: ["66_i15_4", "66_i15_3", "66_i15_2", "66_i15_1"],
        initPositionMode: "default",
        layout: "vertical",
        scaleX: 0.9,
        scaleY: 0.9,
        solidHeights: [720, 720, 720, 625],
        solidWidths: [1280],
        x: 0,
        y: 540,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("supports verticalbg cggroup assets and comma-separated solid heights", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(cggroup="69_i12_1/69_i12_2",solidwidth="1600",solidheight="1,454/1,454",y=200,fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["69_i12_1", "69_i12_2"],
        initPositionMode: "default",
        layout: "vertical",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [1454, 1454],
        solidWidths: [1600],
        x: 0,
        y: 200,
      },
    ]);
  });

  it("prefers imagegroup assets when verticalbg also includes cggroup", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(imagegroup="47_g14_skyovercast_L1/47_g14_skyovercast_R1",cggroup="69_i12_1/69_i12_2",solidwidth=1280,solidheight="720/720",fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 0,
        imageKeys: ["47_g14_skyovercast_l1", "47_g14_skyovercast_r1"],
        initPositionMode: "default",
        layout: "vertical",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [720, 720],
        solidWidths: [1280],
        x: 0,
        y: 0,
      },
    ]);
  });

  it("clears the layer when verticalbg validation fails", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        // Five tiles exceed native's SafeCount > 4 check; _ResetPanel() wipes
        // the previous composition without any fade.
        '[verticalbg(imagegroup="a/b/c/d/e",solidwidth=1280,solidheight="720/720/720/720/720")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      { block: false, fadeMs: 0 },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "verticalbg",
        detail:
          "verticalbg expects width_count * height_count === image_count, got 1 * 5 !== 5",
        type: "parse",
      }),
    ]);
  });

  it("warns but still renders a single-tile verticalbg", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[verticalbg(imagegroup="solo",solidwidth=1280,solidheight="720")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // Native crashes on heightList[1] (raw get_Item in the sizeDelta quirk);
    // the web port keeps rendering and only reports the divergence.
    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 0,
        imageKeys: ["solo"],
        initPositionMode: "default",
        layout: "vertical",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [720],
        solidWidths: [1280],
        x: 0,
        y: 0,
      },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "verticalbg",
        detail: "verticalbg with a single tile would crash the native client",
        type: "parse",
      }),
    ]);
  });

  it("maps largebg into a legacy large tiled background layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="bg_beach_1/bg_beach_2",solidwidth="920/920",solidheight="720",x=-180,fadetime=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "background",
        block: false,
        fadeMs: 1000,
        imageKeys: ["bg_beach_1", "bg_beach_2"],
        initPositionMode: "default",
        layout: "large",
        scaleX: 1,
        scaleY: 1,
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("supports largebg cggroup assets and clear commands", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(cggroup="61_i12/61_i11",solidwidth="1600/1600",solidheight=900,x=-160,yScale=0.8,fadetime=0)]',
        "[largebg(fadetime=0.2,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["61_i12", "61_i11"],
        initPositionMode: "default",
        layout: "large",
        scaleX: 1,
        scaleY: 0.8,
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      {
        block: true,
        fadeMs: 200,
      },
    ]);
  });

  it("keeps largebg running with a zero or missing solidheight", async () => {
    // Native port: `solidheight` (float, default 0.0) has no validation in
    // `_ExecuteImage`; a zero-height invisible composition still fades in and
    // still blocks for the full fadetime.
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="a/b",solidwidth="1/1",solidheight=0,fadetime=1,block=true)]',
        '[largebg(imagegroup="a/b",solidwidth="1/1",fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(
      renderer.gridBackgroundCalls.map((call) => call.solidHeights),
    ).toEqual([[0], [0]]);
    expect(renderer.gridBackgroundCalls.map((call) => call.block)).toEqual([
      true,
      false,
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
  });

  it("empties the large background panel when largebg validation fails", async () => {
    // Native port: Count!=2 / empty-tile / bad-width failures make
    // `_ExecuteImage` log an error, `_ResetPanel()` and return false without
    // blocking — the previous composition must not survive the failed command.
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="a/b",solidwidth="1/1",solidheight=720,fadetime=0)]',
        '[largebg(imagegroup="a/b/c",solidwidth="1/1",solidheight=720,fadetime=0)]',
        '[largebg(imagegroup="a",solidwidth="1/1",solidheight=720,fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toHaveLength(1);
    expect(renderer.gridBackgroundClearCalls).toEqual([
      { block: false, fadeMs: 0 },
      { block: false, fadeMs: 0 },
    ]);
  });

  it("maps largeimg into a legacy large tiled image layer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900",x=-160,yscale=0.8,fadetime=0)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.gridBackgroundCalls).toEqual([
      {
        assetKind: "image",
        block: false,
        fadeMs: 0,
        imageKeys: ["61_i12", "61_i11"],
        layout: "large",
        scaleX: 1,
        scaleY: 0.8,
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
        y: 0,
      },
    ]);
    expect(renderer.gridBackgroundClearCalls).toEqual([]);
  });

  it("maps largebgtween with strict CamelCase keys", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largebg(imagegroup="bg_beach_1/bg_beach_2",solidwidth="920/920",solidheight="720",x=-180,fadetime=0)]',
        '[largebgtween(xFrom=0,xTo=-720,duration=25,ease="1",block=false)]',
        "[largebgtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[largebgtween(y=360,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.largeBackgroundTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        ease: "1",
        loop: false,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 0,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it.each([
    {
      name: "largebgtween",
      script: [
        '[largebg(imagegroup="bg_beach_1/bg_beach_2",solidwidth="920/920",solidheight="720",x=-180,fadetime=0)]',
        "[largebgtween(xFrom=0,xTo=-720,duration=1,block=true,loop=true)]",
      ],
      tweenCalls: (renderer: FakeRenderer) =>
        renderer.largeBackgroundTweenCalls,
      ease: "Linear",
    },
    {
      name: "largeimgtween",
      script: [
        '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900",x=-160,fadetime=0)]',
        '[largeimgtween(xFrom=0,xTo=-720,duration=1,block=true,loop=true,ease="OutQuad")]',
      ],
      tweenCalls: (renderer: FakeRenderer) => renderer.largeImageTweenCalls,
      ease: "OutQuad",
    },
  ])(
    "keeps playing when $name combines loop with block",
    async ({ script, tweenCalls, ease }) => {
      const renderer = new FakeRenderer();
      const warnings: RuntimeWarning[] = [];
      const runtime = new StoryRuntime(
        createContext([...script, '[name="A"]ok']),
        renderer,
        new FakeAudio(),
        { onWarning: (warning) => warnings.push(warning) },
      );

      await runtime.start();

      // Native logs the DLog.LogError text verbatim (typos included) and then
      // hangs waiting for a looping tween's OnComplete; the port keeps the
      // error but drops block so playback reaches the next line.
      expect(warnings).toEqual([
        expect.objectContaining({
          detail:
            "Loop and block both true when tween background! Will cause intinity lop!",
          type: "invalid_parameter",
        }),
      ]);
      expect(tweenCalls(renderer)).toEqual([
        {
          block: false,
          durationMs: 1000,
          ease,
          loop: true,
          xFrom: 0,
          xScaleFrom: undefined,
          xScaleTo: undefined,
          xTo: -720,
          yFrom: undefined,
          yScaleFrom: undefined,
          yScaleTo: undefined,
          yTo: undefined,
        },
      ]);
      expect(runtime.getState()).toBe("waiting_input");
    },
  );

  it("maps largeimgtween with legacy aliases and current-transform fallbacks", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[largeimg(imagegroup="61_i12/61_i11",solidwidth="1600/1600",solidheight="900",x=-160,yscale=0.8,fadetime=0)]',
        "[largeimgtween(xFrom=0,xTo=-720,duration=25,block=false)]",
        "[largeimgtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[largeimgtween(y=360,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.largeImageTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        ease: "Linear",
        loop: false,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      {
        // Omitted `duration` keeps the native-referenced default 0
        // (GetOrDefault<float>("duration", 0.0)): the command snaps
        // instantly and never blocks, even with block=true.
        block: false,
        durationMs: 0,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: 360,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: 360,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });
});
