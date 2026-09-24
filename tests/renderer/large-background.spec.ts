import { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { createContext, createRenderer } from "../helpers/rendererFixtures";

import type { GridBackgroundInput } from "../../src/widgets/StoryPlayer/engine/types";

function createGridBackgroundInput(): GridBackgroundInput {
  return {
    block: false,
    fadeMs: 0,
    imageKeys: ["l1", "r1", "l2", "r2"],
    scaleX: 0.5,
    scaleY: 0.75,
    solidHeights: [720, 720, 720, 720],
    solidWidths: [1280, 1280, 1280, 1280],
    x: -640,
    y: 320,
  };
}

describe("PixiStoryRenderer", () => {
  it("keeps the large background in front of the background regardless of update order", async () => {
    const renderer = createRenderer();
    const input = createGridBackgroundInput();

    renderer.app = {};
    // Mirror LayerGraph.attach's scene order: background first, grid layer next.
    renderer.sceneLayer.addChild(renderer.backgroundLayer);
    renderer.sceneLayer.addChild(renderer.gridBackgroundLayer);
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // panel_large_background is a permanent sibling in front of panel_background
    // in SceneCanvas (nested Canvas sortingOrder 2 vs 1), so it always renders
    // on top -- executing background after gridbg must not sink the puzzle
    // below it.
    const gridIndex = () =>
      renderer.sceneLayer.children.indexOf(renderer.gridBackgroundLayer) -
      renderer.sceneLayer.children.indexOf(renderer.backgroundLayer);

    await renderer.setGridBackground(input);
    expect(gridIndex()).toBe(1);

    await renderer.setBackground("bg_test");
    expect(gridIndex()).toBe(1);
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );

    await renderer.setGridBackground(input);
    expect(gridIndex()).toBe(1);
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );
  });

  it.each([
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["l1", "r1"],
        layout: "large" as const,
        solidHeights: [720],
        solidWidths: [100, 100],
      },
      name: "largebg",
    },
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout: "grid" as const,
      },
      name: "gridbg",
    },
    {
      input: {
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout: "vertical" as const,
      },
      name: "verticalbg",
    },
  ])(
    "removes the previous $name composition before fading in the new one",
    async ({ input }) => {
      // Native port: `_ExecuteImage` (largebg, 2.7.61 VA 0x183e77ee0),
      // `_ExecuteGridBG` (0x183e76290) and `_ExecuteVerticalBG` (0x183e79030)
      // all call `_ResetImages()` before `_LoadImage`, so a fadetime>0
      // replacement starts from an emptied panel — a blank gap while the new
      // puzzle fades in, never a cross-fade. The never-completing tween keeps
      // that fade mid-flight.
      const renderer = createRenderer();
      renderer.app = {};
      renderer.sceneLayer.addChild(renderer.gridBackgroundLayer);
      renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
      renderer.tween = vi.fn(() => new Promise<void>(() => {}));

      await renderer.setGridBackground({ ...input, fadeMs: 0 });
      const firstRoot = renderer.gridBackgroundLayer.children.at(0);
      expect(renderer.gridBackgroundLayer.children).toHaveLength(1);

      await renderer.setGridBackground({ ...input, fadeMs: 500 });

      expect(firstRoot.parent).toBeNull();
      expect(renderer.gridBackgroundLayer.children).toHaveLength(1);
      expect(renderer.gridBackgroundLayer.children.at(0).alpha).toBe(0);
      expect(renderer.largeBackgroundRoot).toBe(
        renderer.gridBackgroundLayer.children.at(0),
      );
    },
  );

  it.each([
    {
      input: {
        ...createGridBackgroundInput(),
        fadeMs: 0,
        imageKeys: ["l1", "r1"],
        layout: "large" as const,
        solidHeights: [720],
        solidWidths: [100, 100],
      },
      missingKey: "r1",
      name: "largebg",
    },
    {
      input: { ...createGridBackgroundInput(), fadeMs: 0 },
      missingKey: "r2",
      name: "gridbg",
    },
  ])(
    "warns and empties the panel when a $name tile fails to load",
    async ({ input, missingKey }) => {
      // Native port: a failed `_LoadImage` logs
      // "[AVG.LargeBG] An error occurred when load image {0}.", calls
      // `_ResetPanel()` and returns false without blocking. The branch is
      // shared on purpose: `_ExecuteGridBG` (2.7.71 VA 0x183f304c0) ends a
      // failed `_LoadImage` with the same `DLog.LogError` + `_ResetPanel()`
      // (VA 0x183f318aa) as `_ExecuteImage`, so gridbg must not keep the
      // previous composition either.
      const warnings: string[] = [];
      const renderer = createRenderer(createContext(), (warning) =>
        warnings.push(warning),
      );
      renderer.app = {};
      renderer.sceneLayer.addChild(renderer.gridBackgroundLayer);
      renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

      await renderer.setGridBackground(input);
      expect(renderer.gridBackgroundLayer.children).toHaveLength(1);

      renderer.textureForImageKey = vi
        .fn()
        .mockImplementation((key: string) =>
          key === missingKey
            ? Promise.resolve(null)
            : Promise.resolve(Texture.EMPTY),
        );
      await renderer.setGridBackground(input);

      expect(warnings).toEqual([`missing grid background: ${missingKey}`]);
      expect(renderer.gridBackgroundLayer.children).toHaveLength(0);
      expect(renderer.largeBackgroundRoot).toBeNull();
    },
  );

  it("applies the strict gridbg xScale and yScale transform", () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(createGridBackgroundInput(), [
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
    ]);

    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("places every verticalbg tile, pivots on the first two heights and applies x/y/scale", () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["v1", "v2", "v3"],
        layout: "vertical",
        solidHeights: [720, 720, 625],
        solidWidths: [1280],
        y: 540,
      },
      [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    );

    expect(root.children).toHaveLength(3);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBe(-180);
    expect(root.pivot.x).toBe(640);
    expect(root.pivot.y).toBe(720);
    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("stacks verticalbg tiles from top to bottom", () => {
    const renderer = createRenderer();
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
      new Texture({ label: "tile-2" }),
      new Texture({ label: "tile-3" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1", "tile-2", "tile-3"],
        layout: "vertical",
        solidHeights: [360, 360, 360, 360],
        solidWidths: [640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 0, y: 360 },
      { label: "tile-2", x: 0, y: 720 },
      { label: "tile-3", x: 0, y: 1080 },
    ]);
  });

  it("applies verticalbg initposmode offsets with the two-tile height sum", () => {
    const renderer = createRenderer();

    const build = (
      initPositionMode: GridBackgroundInput["initPositionMode"],
      solidHeights: number[],
      solidWidths: number[],
    ) =>
      renderer.buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          imageKeys: solidHeights.map((_, index) => `v${index}`),
          initPositionMode,
          layout: "vertical",
          scaleX: 1,
          scaleY: 1,
          solidHeights,
          solidWidths,
          x: 0,
          y: 0,
        },
        solidHeights.map(() => Texture.EMPTY),
      );

    // Native builds `widthList = [solidwidth, 0]` -- the family pads the
    // dimension it lacks with 0, it does not repeat it -- and passes the full
    // height list, of which `_InitPosition*` reads entries [0]+[1]. The
    // `_offset` rect (solidwidth x (h0+h1)) is center-pivoted and matches the
    // Pixi root exactly, so the native Vector2 needs no pivot compensation.
    // With solidwidth 1000 and heights 500/300 (h0+h1 = 800):
    const positionOf = (
      initPositionMode: GridBackgroundInput["initPositionMode"],
    ) => {
      const { x, y } = build(initPositionMode, [500, 300], [1000]).position;
      return { x, y };
    };

    // center: (0, 0) -> (640, 360).
    expect(positionOf("center")).toEqual({ x: 640, y: 360 });
    // default: (widthList[1] / 2, -height[1] / 2) = (0, -150) -> (640, 510).
    expect(positionOf("default")).toEqual({ x: 640, y: 510 });
    // upperleft: ((1000 - 1280) / 2, (720 - 800) / 2) = (-140, -40).
    expect(positionOf("upperleft")).toEqual({ x: 500, y: 400 });
    // lowercenter: (0, (800 - 720) / 2) = (0, 40) -> (640, 320).
    expect(positionOf("lowercenter")).toEqual({ x: 640, y: 320 });

    // Corpus shape (level_main_16-18_end.txt:356): N=4 full-screen tiles with
    // the implicit `default` mode. The offset (0, -h1/2) = (0, -360) centers
    // the 1280x1440 `_offset` rect at y=720, so the rect spans [0, 1440] and
    // the top tile lands exactly on the 1280x720 canvas.
    const corpusRoot = build("default", [720, 720, 720, 720], [1280]);
    expect(corpusRoot.position.x).toBe(640);
    expect(corpusRoot.position.y).toBe(720);
    expect(corpusRoot.pivot.y).toBe(720);
  });

  it("pans verticalbg compositions with largebgtween", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setGridBackground({
      ...createGridBackgroundInput(),
      imageKeys: ["v1", "v2"],
      layout: "vertical",
      solidHeights: [720, 720],
      solidWidths: [1280],
      x: 0,
      y: 0,
    });

    // The whole family shares one `_offset` container in native, so the
    // vertical composition must be registered for largebgtween as well.
    const root = renderer.gridBackgroundLayer.children[0];
    expect(renderer.largeBackgroundRoot).toBe(root);

    await renderer.setLargeBackgroundTween({
      block: false,
      durationMs: 0,
      yFrom: 0,
      yTo: 600,
    });

    // duration 0 snaps to the target: applyCenteredTransform maps y=600 to
    // position.y = 360 - 600.
    expect(root.position.y).toBe(-240);
  });

  it("lays out largebg as exactly two horizontal tiles", () => {
    const renderer = createRenderer();
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [360],
        solidWidths: [640, 640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 640, y: 0 },
    ]);
  });

  it("places every largebg initposmode at its native _initOffset", () => {
    // Native port: `_ExecuteImage` writes the selected `_InitPosition*`
    // result straight into `_initOffset.localPosition`, and the helpers get
    // `heights = [solidheight, 0]` (2.7.71 VA 0x183f33005-0x183f33025) --
    // largebg is a single row, so `height[1]` is 0 rather than a repeat of
    // `solidheight`. With two tiles of 400 + 600 and solidheight 500:
    //   center      `Vector2.zero`                          -> (0, 0)
    //   default     (width[1] / 2, -height[1] / 2)          -> (300, 0)
    //   upperleft   ((1000 - 1280) / 2, (720 - 500) / 2)    -> (-140, 110)
    //   lowercenter (0, (500 - 720) / 2)                    -> (0, -110)
    // The Pixi root pivots on the same rect as native's `_offset`, so the
    // only conversion is the flipped y axis: (640 + x, 360 - y).
    const renderer = createRenderer();
    const place = (initPositionMode: string) => {
      const root = renderer.buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          imageKeys: ["tile-0", "tile-1"],
          initPositionMode,
          layout: "large",
          scaleX: 1,
          scaleY: 1,
          solidHeights: [500],
          solidWidths: [400, 600],
          x: 0,
          y: 0,
        },
        [Texture.EMPTY, Texture.EMPTY],
      );
      return { x: root.position.x, y: root.position.y };
    };

    expect(place("center")).toEqual({ x: 640, y: 360 });
    expect(place("default")).toEqual({ x: 940, y: 360 });
    expect(place("upperleft")).toEqual({ x: 500, y: 250 });
    expect(place("lowercenter")).toEqual({ x: 640, y: 470 });
  });

  it("applies gridbg initposmode offsets in the centered pivot space", () => {
    const renderer = createRenderer();
    const build = (initPositionMode: string) =>
      renderer.buildGridBackgroundRoot(
        {
          ...createGridBackgroundInput(),
          initPositionMode,
          layout: "grid",
          scaleX: 1,
          scaleY: 1,
          solidHeights: [600, 640],
          solidWidths: [1000, 800],
          x: 0,
          y: 0,
        },
        [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
      );

    const positions = (mode: string) => {
      const { position } = build(mode);
      return { x: position.x, y: position.y };
    };

    // POSITION_INIT_FUNCTION ports (2.7.61: 0x183e77451): default =
    // (w1/2, -h1/2), center = (0,0), upperleft = ((w0+w1-1280)/2,
    // (720-(h0+h1))/2), lowercenter = (0, (h0+h1-720)/2). The `_offset` rect
    // wraps the 2×2 puzzle exactly, so the native Vector2 needs no extra
    // pivot compensation — only the y flip done by the position formula.
    expect(positions("default")).toEqual({ x: 1040, y: 680 });
    expect(positions("center")).toEqual({ x: 640, y: 360 });
    expect(positions("upperleft")).toEqual({ x: 900, y: 620 });
    expect(positions("lowercenter")).toEqual({ x: 640, y: 100 });

    // Corpus shape (level_main_16-01_beg.txt:112): 1280/1280 × 720/720 with
    // default mode anchors the view on the top row: the half-tile offset
    // (640, -360) puts the puzzle's top edge exactly on the canvas top.
    const corpusRoot = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        initPositionMode: "default",
        layout: "grid",
        scaleX: 1,
        scaleY: 1,
        x: -105,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    );
    expect(corpusRoot.position.x).toBe(1175);
    expect(corpusRoot.position.y).toBe(720);
  });

  it("registers every family layout as the largebgtween target", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    for (const layout of ["grid", "vertical", "large"] as const) {
      await renderer.setGridBackground({
        ...createGridBackgroundInput(),
        imageKeys: ["t1", "t2", "t3", "t4"],
        layout,
      });
      const root = renderer.gridBackgroundLayer.children.at(-1);
      // `LargeBackgroundPanel._ExecuteImageTween` drives the family-shared
      // `_offset`, so gridbg/verticalbg puzzles must be tweenable too.
      expect(renderer.largeBackgroundRoot).toBe(root);
      expect(root.parent).toBe(renderer.gridBackgroundLayer);
    }
  });

  it("moves a gridbg puzzle with largebgtween", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setGridBackground({
      ...createGridBackgroundInput(),
      scaleX: 1,
      scaleY: 1,
      imageKeys: ["l1", "r1", "l2", "r2"],
      initPositionMode: "default",
      layout: "grid",
      x: 0,
      y: 0,
    });

    // level_main_16-01_beg.txt:112-113 pans the skystarry grid with
    // [largebgtween(duration=40,yFrom=720,yTo=360)]. Native `_offset` is a
    // child of `_initOffset`, so the tween moves only the command-space
    // offset while the default half-tile init offset (640, -360) stays put:
    // y=720 puts the puzzle center on the canvas top edge, i.e. the visible
    // band becomes the bottom tile row.
    await renderer.setLargeBackgroundTween({ durationMs: 0, yTo: 720 });

    const root = renderer.largeBackgroundRoot;
    expect(root.position.x).toBe(1280);
    expect(root.position.y).toBe(0);
  });

  it("applies largebgtween in largebg transform space", async () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        initPositionMode: "default",
        layout: "large",
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    expect(root.position.y).toBe(360);
    renderer.app = {};
    renderer.gridBackgroundLayer.addChild(root);
    renderer.largeBackgroundRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push(renderer.readCenteredTransform(root));
        step(0.5);
        snapshots.push(renderer.readCenteredTransform(root));
        done?.();
        snapshots.push(renderer.readCenteredTransform(root));
      },
    );

    await renderer.setLargeBackgroundTween({
      block: true,
      durationMs: 1000,
      xFrom: -180,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -180, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -450, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
    // Native default initposmode keeps its +width[1]/2 parent offset while
    // largebgtween moves only the child offset transform.
    expect(root.position.x).toBe(380);
  });

  it("maps largebgtween ease and loop onto the tween engine", async () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        initPositionMode: "default",
        layout: "large",
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const tweenOptions: Array<{
      ease?: (t: number) => number;
      loops?: number;
    }> = [];
    const stepped: number[] = [];

    renderer.app = {};
    renderer.gridBackgroundLayer.addChild(root);
    renderer.largeBackgroundRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: { ease?: (t: number) => number; loops?: number },
      ) => {
        tweenOptions.push(options ?? {});
        step(0.5);
        stepped.push(renderer.readCenteredTransform(root).x);
        done?.();
      },
    );

    await renderer.setLargeBackgroundTween({
      block: true,
      durationMs: 1000,
      // ease="6" is corpus-attested (act12d0_st02): DOTween ordinal 6
      // resolves to OutQuad, so the raw 0.5 step lands at eased 0.75.
      ease: "6",
      xFrom: -180,
      xTo: -720,
    });
    await renderer.setLargeBackgroundTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xFrom: -180,
      xTo: -720,
    });

    // The mocked engine feeds raw progress to the step callback, so both
    // passes land on the linear midpoint; the eased curve itself is asserted
    // on the captured options below (and end-to-end in tweenRunner.spec).
    expect(stepped).toEqual([-450, -450]);
    expect(tweenOptions.map(({ loops }) => loops)).toEqual([1, -1]);
    expect(tweenOptions[0]?.ease?.(0.5)).toBe(0.75);
  });

  it("applies largeimgtween in largeimg transform space", async () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        step(0.5);
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        done?.();
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
      },
    );

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 1000,
      xFrom: -160,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -160, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -440, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
  });

  it("maps largeimgtween ease and loop onto the tween engine", async () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const tweenOptions: Array<{
      ease?: (t: number) => number;
      loops?: number;
    }> = [];

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: { ease?: (t: number) => number; loops?: number },
      ) => {
        tweenOptions.push(options ?? {});
        step(0.5);
        done?.();
      },
    );

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 1000,
      // ease="6" is the DOTween ordinal syntax: 6 resolves to OutQuad, so
      // the raw 0.5 step lands at eased 0.75.
      ease: "6",
      xFrom: -160,
      xTo: -720,
    });
    await renderer.setLargeImageTween({
      block: false,
      durationMs: 1000,
      loop: true,
      xFrom: -160,
      xTo: -720,
    });

    expect(tweenOptions.map(({ loops }) => loops)).toEqual([1, -1]);
    expect(tweenOptions[0]?.ease?.(0.5)).toBe(0.75);
    // No ease argument keeps Ease.Linear (= GetEnum<Ease>("ease", 1)).
    expect(tweenOptions[1]?.ease?.(0.5)).toBe(0.5);
  });

  it("applies zero-duration largeimgtween immediately and cancels stale tweens", async () => {
    const renderer = createRenderer();
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    let pendingStep: ((progress: number) => void) | null = null;
    let pendingDone: (() => void) | null = null;

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        pendingStep = step;
        pendingDone = done ?? null;
      },
    );

    await renderer.setLargeImageTween({
      block: false,
      durationMs: 1000,
      xFrom: -160,
      xTo: -720,
      yFrom: 0,
      yTo: 0,
    });

    const applySpy = vi.spyOn(renderer, "applyCenteredTransform");

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 0,
      xFrom: -320,
    });

    expect(applySpy.mock.calls).toEqual([
      [root, { scaleX: 0.5, scaleY: 0.75, x: -320, y: 0 }],
      [root, { scaleX: 0.5, scaleY: 0.75, x: -160, y: 0 }],
    ]);

    (pendingStep as ((progress: number) => void) | null)?.(1);
    (pendingDone as (() => void) | null)?.();

    expect(root.position.x - 640).toBe(-160);
    expect(360 - root.position.y).toBe(0);
  });
});
