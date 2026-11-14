import {
  Application,
  Assets,
  Container,
  type Graphics,
  NineSliceSprite,
  type Sprite,
  Texture,
  TextureSource,
  Ticker,
  TickerPlugin,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { collectContextAssetUrls } from "../../src/widgets/StoryPlayer/engine/preload";
import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import { createRenderer } from "../helpers/rendererFixtures";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { TweenRunOptions } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import type { StoryShowItemSlot } from "../../src/widgets/StoryPlayer/engine/types";

interface ManualTween {
  complete: () => void;
  durationMs: number;
  step: (progress: number) => void;
}

function createShowItemRenderer(ticker?: Ticker) {
  const renderer = createRenderer();
  const layer: Container = renderer.layers.showItems;
  const tweens: ManualTween[] = [];
  renderer.showItemFrameTextureFailed = true;
  renderer.dialogFrameTextureFailed = true;
  renderer.textureForImageKey = vi.fn(
    async () => new Texture({ label: "item" }),
  );
  if (ticker) {
    renderer.app = { ticker };
    ticker.lastTime = 0;
  } else {
    renderer.updatePhaseTweenRunner.run = (
      durationMs: number,
      step: (progress: number) => void,
      done?: () => void,
      options?: TweenRunOptions,
    ) =>
      new Promise<void>((resolve) => {
        tweens.push({
          complete: () => {
            if (options?.isAlive?.() !== false) step(1);
            done?.();
            resolve();
          },
          durationMs,
          step,
        });
      });
  }

  return {
    createSlot: (style: string): StoryShowItemSlot =>
      renderer.createShowItemSlot(style),
    createRuntime: (lines: string[]) => {
      const playback = new FakeRenderer();
      playback.createShowItemSlot = (style) =>
        renderer.createShowItemSlot(style);
      if (ticker)
        playback.onFrameUpdate = renderer.onFrameUpdate.bind(renderer);
      return new StoryRuntime(createContext(lines), playback, new FakeAudio());
    },
    layer,
    renderer,
    tweens,
  };
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("CG item rendering", () => {
  const hideLines = [
    '[cgitem(image="first")]',
    '[hidecgitem(image="first",duration=0.032,block=true)]',
  ];
  const hideDraws = [[["first", 0.5]], [["second", 0.25]], [["second", 0.625]]];

  it.each([
    {
      command: "cgitem",
      lines: [
        '[cgitem(image="first",afrom=0,ato=1,aduration=0.032,block=true)]',
      ],
      expectedDraws: [
        [["first", 0.5]],
        [
          ["first", 1],
          ["second", 0.25],
        ],
        [
          ["first", 1],
          ["second", 0.625],
        ],
      ],
    },
    {
      command: "hidecgitem",
      lines: hideLines,
      expectedDraws: hideDraws,
    },
    {
      command: "hidecgitem then focusout",
      lines: [
        ...hideLines,
        '[focusout(type="cgitem",id=" SECOND ",to=0.5,duration=0,block=false)]',
      ],
      expectedDraws: hideDraws,
    },
    {
      command: "cgitemshake",
      lines: [
        '[cgitem(image="first")]',
        // Let the static CG finish before the shake takes the panel's callback.
        "[delay(time=0)]",
        '[cgitemshake(image="first",duration=0.032,block=true)]',
      ],
      expectedDraws: [
        [["first", 1]],
        [["first", 1]],
        [
          ["first", 1],
          ["second", 0.25],
        ],
        [
          ["first", 1],
          ["second", 0.625],
        ],
      ],
    },
  ])(
    "draws the next cached CG in the completion frame ($command)",
    async ({ lines, expectedDraws }) => {
      const context = createContext([
        ...lines,
        '[cgitem(image=" SECOND ",afrom=0.25,ato=1,aduration=0.032)]',
        '[name="A"]after',
      ]);
      const urls = collectContextAssetUrls(context);
      for (const [index, url] of urls.entries()) {
        const source = new TextureSource({ height: 32, width: 32 });
        const label = index === 0 ? "first" : "second";
        Assets.cache.set(url, new Texture({ label, source }));
      }

      const renderer = createRenderer(context);
      const cgLayer: Container = renderer.layers.cgItems;
      const drawn: Array<Array<[string | undefined, number]>> = [];
      const app = new Application();
      app.render = () => {
        drawn.push(
          cgLayer.children.flatMap((root) => {
            const sprite = root.children[0]?.children[0] as Sprite | undefined;
            return sprite
              ? [[sprite.texture.label, sprite.alpha * root.alpha]]
              : [];
          }),
        );
      };
      TickerPlugin.init.call(app, { autoStart: false });
      renderer.app = app;
      renderer.layers.attach(app.stage);
      app.ticker.lastTime = 0;

      const runtime = new StoryRuntime(context, renderer, new FakeAudio());
      const started = runtime.start();
      try {
        for (const [index, expected] of expectedDraws.entries()) {
          app.ticker.update((index + 1) * 16);
          expect(drawn[index]).toEqual(expected);
        }
      } finally {
        runtime.destroy();
        renderer.resetCgItems();
        app.ticker.destroy();
        app.stage.destroy({ children: true });
        for (const url of urls) Assets.cache.remove(url);
        await started;
      }
    },
  );
});

describe("ShowItemSlot rendering", () => {
  it("replaces the slot by fading it out with the new command's fadetime", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const runtime = createRuntime([
      '[showitem(image="item_a")]',
      '[showitem(image="item_b",fadetime=0.3)]',
      '[name="A"]ok',
    ]);
    const started = runtime.start();
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    const firstRoot = layer.children[0]!;
    tweens[0]!.complete();
    await flushAsync();

    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300]);
    tweens[1]!.step(0.5);
    expect(firstRoot.alpha).toBeCloseTo(0.5);
    tweens[1]!.complete();
    await flushAsync();
    expect(firstRoot.parent).toBeNull();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300, 300]);
    expect(runtime.getState()).toBe("running");
    tweens[2]!.complete();
    await started;
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]).not.toBe(firstRoot);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("finishes zero-duration Show and Hide on separate tween updates", async () => {
    const ticker = new Ticker();
    const { createRuntime, layer } = createShowItemRenderer(ticker);
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      "[hideitem(fadetime=0)]",
      '[showitem(image="item_b",fadetime=0.3)]',
      '[name="A"]ok',
    ]);
    try {
      const started = runtime.start();
      await flushAsync();
      const first = layer.children[0]!;
      expect(first.alpha).toBe(0);
      expect(runtime.getState()).toBe("running");

      ticker.update(16);
      await flushAsync();
      expect(layer.children).toEqual([first]);
      expect(first.alpha).toBe(1);

      ticker.update(32);
      await flushAsync();
      const second = layer.children[0]!;
      expect(first.destroyed).toBe(true);
      expect(second.alpha).toBe(0);
      expect(runtime.getState()).toBe("running");

      ticker.update(332);
      await started;
      expect(layer.children).toEqual([second]);
      expect(second.alpha).toBe(1);
      expect(runtime.getState()).toBe("waiting_input");
    } finally {
      runtime.destroy();
      ticker.destroy();
    }
  });

  it("finishes the old show before a same-frame skip starts its destination hide", async () => {
    const ticker = new Ticker();
    const { createRuntime, layer } = createShowItemRenderer(ticker);
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      "[SkipToThis]",
      "[hideitem(fadetime=1)]",
      '[name="A"]ok',
    ]);

    try {
      const started = runtime.start();
      await flushAsync();
      const root = layer.children[0]!;
      expect(root.alpha).toBe(0);
      const skipped = runtime.skipNode();
      await flushAsync();

      // FinishCommand for the old Show can arrive on the same update as the
      // destination Hide. It must not settle the Hide's own wait.
      ticker.update(16);
      await flushAsync();
      expect(layer.children).toEqual([root]);
      expect(runtime.getState()).toBe("running");
      expect(root.alpha).toBe(1);

      ticker.update(516);
      expect(root.alpha).toBeCloseTo(0.25);
      ticker.update(1016);
      await Promise.all([started, skipped]);
      expect(root.destroyed).toBe(true);
      expect(runtime.getState()).toBe("waiting_input");
    } finally {
      runtime.destroy();
      ticker.destroy();
    }
  });

  it("renders item slots in the 2791 scene order and keeps animtext independent", async () => {
    const { createRuntime, layer, renderer, tweens } = createShowItemRenderer();
    const layers = renderer.layers;
    layers.attach(new Container());
    const { animTexts, scene, world } = layers;
    expect(scene.getChildIndex(layer)).toBeGreaterThan(
      scene.getChildIndex(layers.characters),
    );
    expect(scene.getChildIndex(layer)).toBeLessThan(
      scene.getChildIndex(layers.avgDisplayCg),
    );
    expect(scene.getChildIndex(layer)).toBeLessThan(
      scene.getChildIndex(layers.cutins),
    );

    const blocker = renderer.ensureBlocker();
    expect(world.getChildIndex(animTexts)).toBeGreaterThan(
      world.getChildIndex(blocker),
    );
    expect(world.getChildIndex(animTexts)).toBeLessThan(
      world.getChildIndex(layers.curtains),
    );
    const animTextRoot = animTexts.addChild(new Container());
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      '[showitem(image="item_b",fadetime=0)]',
      '[name="A"]before hide',
      "[hideitem(fadetime=0)]",
      '[name="A"]after hide',
    ]);

    const started = runtime.start();
    for (let i = 0; i < 3; i += 1) {
      await flushAsync();
      tweens[i]!.complete();
    }
    await started;
    expect(layer.children).toHaveLength(1);

    const advanced = runtime.advance();
    await flushAsync();
    tweens[3]!.complete();
    await advanced;
    expect(layer.children).toHaveLength(0);
    expect(animTexts.children).toEqual([animTextRoot]);
  });

  it("does not start a tween when hideitem has no slot", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    await createRuntime(["[hideitem]", '[name="A"]ok']).start();

    expect(layer.children).toHaveLength(0);
    expect(tweens).toHaveLength(0);
  });

  it("plays the placeholder fade when the item texture fails to load", async () => {
    const { createSlot, layer, renderer, tweens } = createShowItemRenderer();
    renderer.textureForImageKey = vi.fn(async () => null);
    const finished = vi.fn();
    await createSlot("photo").show({}, "item_a", finished);

    const root = layer.children[0]!;
    const placeholder = root.children[1]!.children[0] as Sprite;
    expect(placeholder.texture).toBe(Texture.WHITE);
    expect(placeholder.width).toBe(100);
    expect(placeholder.height).toBe(100);
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    expect(finished).not.toHaveBeenCalled();
    tweens[0]!.complete();
    expect(root.alpha).toBe(1);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("fits the nine-slice photo frame to the image's native size and offset", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.showItemFrameTexture = new Texture({ label: "frame" });
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({ source: new TextureSource({ height: 529, width: 941 }) }),
    );
    await createSlot("photo").show(
      { fadetime: 0, offsetx: 30, offsety: 20 },
      "item_a",
      vi.fn(),
    );

    const content = layer.children[0]!.children[1]!;
    const frame = content.children[0] as NineSliceSprite;
    expect(frame).toBeInstanceOf(NineSliceSprite);
    expect(frame.leftWidth).toBe(32);
    expect(frame.topHeight).toBe(32);
    expect(frame.rightWidth).toBe(32);
    expect(frame.bottomHeight).toBe(32);
    expect(frame.width).toBe(941 + 32 * 2);
    expect(frame.height).toBe(529 + 32 * 2);
    const sprite = content.children[1] as Sprite;
    expect(sprite.scale.x).toBe(1);
    expect(sprite.scale.y).toBe(1);
    expect(content.position.x).toBe(1280 / 2 + 30);
    expect(content.position.y).toBe(720 / 2 - 20);
  });

  it("snaps photo alpha to 1 and lets the first tween finish the current hide", async () => {
    const { createSlot, layer, tweens } = createShowItemRenderer();
    const slot = createSlot("photo");
    const shown = vi.fn();
    const hidden = vi.fn(() => slot.destroy());
    await slot.show({}, "item_a", shown);
    const root = layer.children[0]!;
    expect(root.alpha).toBe(0);

    slot.hide({ fadetime: 0.3 }, hidden);
    expect(root.alpha).toBe(1);
    tweens[1]!.step(0.5);
    expect(root.alpha).toBeCloseTo(0.5);
    tweens[0]!.complete();
    expect(root.parent).toBeNull();
    tweens[1]!.complete();

    expect(shown).not.toHaveBeenCalled();
    expect(hidden).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      style: "photo",
      fadestyle: 0,
      initialAlpha: 1,
      alpha: 0.4131,
      black: 0.4,
      width: 200,
    },
    {
      style: "cutin",
      fadestyle: 0,
      initialAlpha: 0.36,
      alpha: 0.4131,
      black: 0.4,
      width: 200,
    },
    {
      style: "cutin",
      fadestyle: 2,
      initialAlpha: 1,
      alpha: 1,
      black: 0.16524,
      width: 82.62,
    },
  ])(
    "samples the $style/$fadestyle Hide start on the first overlapping frame",
    async ({ style, fadestyle, initialAlpha, alpha, black, width }) => {
      const ticker = new Ticker();
      const { createRuntime, layer, renderer } = createShowItemRenderer(ticker);
      renderer.textureForImageKey = vi.fn(
        async () =>
          new Texture({
            source: new TextureSource({ height: 100, width: 200 }),
          }),
      );
      const runtime = createRuntime([
        `[showitem(image="item_a",style="${style}",fadestyle=${fadestyle},width=200,fadetime=1)]`,
        "[SkipToThis]",
        "[hideitem(fadetime=1)]",
        '[name="A"]ok',
      ]);
      const started = runtime.start();
      let skipped: Promise<void> | undefined;
      try {
        await flushAsync();
        const root = layer.children[0]!;
        ticker.update(100);

        skipped = runtime.skipNode();
        await flushAsync();
        ticker.update(200);
        expect(root.alpha).toBeCloseTo(initialAlpha);

        // The jump starts Hide after Show's 20% update. On the next frame
        // Show writes 0.51 first and Hide samples it before applying OutQuad.
        ticker.update(300);
        expect(root.alpha).toBeCloseTo(alpha);
        expect(root.children[0]!.alpha).toBeCloseTo(black);
        expect(root.children[1]!.width).toBeCloseTo(width);
        expect(runtime.getState()).toBe("running");
      } finally {
        runtime.destroy();
        ticker.destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it("plays cutin fade over the full-width mask and hides from current alpha", async () => {
    const { createSlot, layer, renderer, tweens } = createShowItemRenderer();
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({ source: new TextureSource({ height: 529, width: 941 }) }),
    );
    const slot = createSlot("cutin");
    await slot.show({ fadetime: 0.4 }, "item_a", vi.fn());

    const root = layer.children[0]!;
    const [backdrop, mask] = root.children as Graphics[];
    expect(mask!.width).toBe(941);
    expect(mask!.height).toBe(720);
    expect(backdrop!.alpha).toBeCloseTo(0.4);
    expect(root.alpha).toBe(0);
    tweens[0]!.complete();
    expect(root.alpha).toBe(1);

    root.alpha = 0.4;
    slot.hide({ fadetime: 0.3 }, () => slot.destroy());
    tweens[1]!.step(0.5);
    expect(root.alpha).toBeCloseTo(0.2);
    tweens[1]!.complete();
    expect(root.parent).toBeNull();
  });

  it.each([
    2,
    "2",
    " horiz_expand_left2right ",
    "fade, horiz_expand_left2right",
  ])(
    "expands and collapses the cutin window for fadestyle %s",
    async (fadestyle) => {
      const { createSlot, layer, tweens } = createShowItemRenderer();
      const slot = createSlot("cutin");
      await slot.show({ fadestyle, width: 200.5 }, "item_a", vi.fn());

      const root = layer.children[0]!;
      const [backdrop, mask] = root.children as Graphics[];
      expect(root.alpha).toBe(1);
      expect(mask!.width).toBe(0);
      expect(mask!.height).toBe(720);
      expect(backdrop!.alpha).toBe(0);
      tweens[0]!.step(0.5);
      // GetInt rounds 200.5 to the even integer 200.
      expect(mask!.width).toBeCloseTo(100);
      expect(mask!.getLocalBounds().minX).toBeCloseTo(1280 / 2 - 100);
      tweens[1]!.step(0.5);
      expect(backdrop!.alpha).toBeCloseTo(0.2);
      tweens[0]!.complete();
      tweens[1]!.complete();
      expect(mask!.width).toBe(200);

      slot.hide({ fadetime: 0.3 }, () => slot.destroy());
      tweens[2]!.step(0.5);
      expect(mask!.width).toBeCloseTo(100);
      tweens[3]!.step(0.5);
      expect(backdrop!.alpha).toBeCloseTo(0.2);
      expect(root.alpha).toBe(1);
      tweens[2]!.complete();
      expect(root.parent).toBeNull();
    },
  );

  it.each([7, -1])(
    "expands vertically for unnamed fadestyle %s",
    async (fadestyle) => {
      const { createSlot, layer, tweens } = createShowItemRenderer();
      await createSlot("cutin").show(
        { fadestyle, width: 200 },
        "item_a",
        vi.fn(),
      );
      const root = layer.children[0]!;
      const mask = root.children[1]!;
      expect(root.alpha).toBe(1);
      expect(mask.width).toBe(200);
      expect(mask.height).toBe(0);
      tweens[0]!.step(0.5);
      expect(mask.height).toBeCloseTo(360);
      expect(mask.getLocalBounds().minY).toBeCloseTo(180);
    },
  );

  it("clamps the cutin backdrop after interpolating its alpha", async () => {
    const { createSlot, layer, tweens } = createShowItemRenderer();
    const slot = createSlot("cutin");
    await slot.show({ black: 2, fadestyle: 2, width: 200 }, "item_a", vi.fn());
    const backdrop = layer.children[0]!.children[0]!;

    tweens[1]!.step(0.25);
    expect(backdrop.alpha).toBeCloseTo(0.5);
    tweens[0]!.complete();
    tweens[1]!.complete();
    expect(backdrop.alpha).toBe(1);

    slot.hide({}, () => slot.destroy());
    tweens[3]!.step(0.25);
    expect(backdrop.alpha).toBe(1);
    tweens[3]!.step(0.75);
    expect(backdrop.alpha).toBeCloseTo(0.5);
    tweens[2]!.complete();
  });

  it("uses capped frame time for cutin black fades and completes on the mask", async () => {
    const ticker = new Ticker();
    const { createSlot, layer } = createShowItemRenderer(ticker);
    const slot = createSlot("cutin");
    const shown = vi.fn();
    const hidden = vi.fn();

    try {
      await slot.show(
        { fadestyle: 2, fadetime: 1, width: 200 },
        "item_a",
        shown,
      );
      const [backdrop, mask] = layer.children[0]!.children as Graphics[];
      ticker.update(1000);
      expect(mask!.width).toBe(200);
      expect(backdrop!.alpha).toBeCloseTo(0.4 * (1 - (2 / 3) ** 2));
      expect(shown).toHaveBeenCalledTimes(1);

      ticker.update(1500);
      ticker.update(2000);
      expect(backdrop!.alpha).toBeCloseTo(0.4);
      slot.hide({ fadetime: 1 }, hidden);
      ticker.update(2500);
      expect(mask!.width).toBeCloseTo(50);
      expect(backdrop!.alpha).toBeCloseTo(0.4 * (2 / 3) ** 2);
      expect(hidden).not.toHaveBeenCalled();

      ticker.update(3000);
      expect(mask!.width).toBe(0);
      expect(backdrop!.alpha).toBeCloseTo(0.4 * (1 / 3) ** 2);
      expect(hidden).toHaveBeenCalledTimes(1);
    } finally {
      slot.destroy();
      ticker.destroy();
    }
  });

  it.each([
    { raw: "200.5", width: 200 },
    { raw: '" +201 "', width: 201 },
    { raw: "2e2", width: 200 },
    { raw: "0xC8", width: 200 },
    { raw: "0310", width: 200 },
    { raw: "null", width: 0 },
    { raw: "true", width: 1 },
  ])("uses the native Int32 width for $raw", async ({ raw, width }) => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const started = createRuntime([
      `[showitem(image="item_a",style="cutin",width=${raw},fadetime=0)]`,
      '[name="A"]ok',
    ]).start();
    await flushAsync();
    tweens[0]!.complete();
    await started;
    expect(layer.children[0]!.children[1]!.width).toBe(width);
  });

  it("culls a cutin window with negative width and keeps its backdrop", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const started = createRuntime([
      '[showitem(image="item_a",style="cutin",width=0xFFFFFFFFFFFFFF38,fadetime=0)]',
      '[name="A"]ok',
    ]).start();
    await flushAsync();
    tweens[0]!.complete();
    await started;

    const [backdrop, , content] = layer.children[0]!.children;
    expect(content!.renderable).toBe(false);
    expect(backdrop!.alpha).toBeCloseTo(0.4);
  });

  it.each(['"200.5"', '"2e2"', '"null"', "2147483648"])(
    "fails the cutin command when width %s cannot convert to Int32",
    async (raw) => {
      const { createRuntime, layer } = createShowItemRenderer();
      const runtime = createRuntime([
        `[showitem(image="item_a",style="cutin",width=${raw},fadetime=0)]`,
        '[name="A"]ok',
      ]);
      await runtime.start();
      expect(runtime.getState()).toBe("error");
      expect(layer.children).toHaveLength(0);
    },
  );

  it("clears a fading slot and discards its pending replacement on destroy", async () => {
    const { createRuntime, layer, renderer, tweens } = createShowItemRenderer();
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      '[showitem(image="item_b",fadetime=0.3)]',
    ]);
    const started = runtime.start();
    await flushAsync();
    tweens[0]!.complete();
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([0, 300]);

    runtime.destroy();
    await started;
    tweens[1]!.complete();
    expect(renderer.textureForImageKey).toHaveBeenCalledTimes(1);
    expect(layer.children).toHaveLength(0);
  });

  it("does not mount a slot after destroy during the texture load", async () => {
    const { createRuntime, layer, renderer } = createShowItemRenderer();
    const texture = Promise.withResolvers<Texture>();
    renderer.textureForImageKey = vi.fn(() => texture.promise);
    const runtime = createRuntime(['[showitem(image="item_a",fadetime=0)]']);
    const started = runtime.start();
    expect(layer.children).toHaveLength(1);
    expect(renderer.textureForImageKey).toHaveBeenCalledExactlyOnceWith(
      "item_a",
      "image",
    );

    runtime.destroy();
    await started;
    texture.resolve(new Texture({ label: "item" }));
    await flushAsync();
    expect(layer.children).toHaveLength(0);
  });

  const textureOutcomes = {
    resolves: () => new Texture({ label: "late texture" }),
    rejects: () => {
      throw new Error("late texture load failure");
    },
  };
  it.each([
    { style: "photo", outcome: "resolves" },
    { style: "cutin", outcome: "resolves" },
    { style: "photo", outcome: "rejects" },
  ] as const)(
    "fades out a pending $style slot after a skip when its load $outcome",
    async ({ style, outcome }) => {
      const { createRuntime, layer, renderer, tweens } =
        createShowItemRenderer();
      const texture = Promise.withResolvers<Texture>();
      renderer.textureForImageKey = vi.fn(() => texture.promise);
      const runtime = createRuntime([
        `[showitem(image="item_a",style="${style}",fadestyle=2,width=200)]`,
        "[SkipToThis]",
        "[hideitem(fadetime=0.25)]",
        '[name="A"]ok',
      ]);
      const started = runtime.start();
      const root = layer.children[0]!;
      const image = root.children.at(-1)!.children.at(-1) as Sprite;
      expect(image.texture).toBe(Texture.WHITE);
      const skipped = runtime.skipNode();
      await flushAsync();
      const durations = style === "cutin" ? [250, 250] : [250];
      expect(tweens.map((entry) => entry.durationMs)).toEqual(durations);
      expect(runtime.getState()).toBe("running");

      texture.resolve(Promise.resolve().then(textureOutcomes[outcome]));
      await flushAsync();
      expect(image.texture).toBe(Texture.WHITE);
      expect(tweens).toHaveLength(durations.length);
      expect(root.parent).toBe(layer);
      tweens[0]!.complete();
      await Promise.all([started, skipped]);
      expect(root.parent).toBeNull();
      expect(runtime.getState()).toBe("waiting_input");
    },
  );

  it("keeps a framed placeholder without looking up an empty image", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.showItemFrameTexture = new Texture({ label: "frame" });
    await createSlot("photo").show({ fadetime: 0 }, null, vi.fn());

    expect(renderer.textureForImageKey).not.toHaveBeenCalled();
    const content = layer.children[0]!.children[1]!;
    const [frame, image] = content.children as [NineSliceSprite, Sprite];
    expect(frame.width).toBe(100 + 32 * 2);
    expect(frame.height).toBe(100 + 32 * 2);
    expect(image.texture).toBe(Texture.WHITE);
  });

  it("hangs the cutin header 150px into the window top, rotated 180 degrees", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.dialogFrameTexture = new Texture({
      label: "header",
      source: new TextureSource({ height: 310, width: 4 }),
    });
    await createSlot("cutin").show(
      { fadetime: 0, width: 200 },
      "item_a",
      vi.fn(),
    );

    const header = layer.children[0]!.children[2]!.children[1] as Sprite;
    expect(header.rotation).toBeCloseTo(Math.PI);
    expect(header.anchor.x).toBe(0.5);
    expect(header.anchor.y).toBe(1);
    expect(header.width).toBeCloseTo(200);
    expect(header.height).toBeCloseTo(200);
    expect(header.position.x).toBeCloseTo(0);
    expect(header.position.y).toBeCloseTo(-360 - 50);
    const bounds = header.getBounds();
    expect(bounds.minY).toBeCloseTo(-50);
    expect(bounds.maxY).toBeCloseTo(150);
  });
});
