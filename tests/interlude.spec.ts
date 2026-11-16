import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { InterludePanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/InterludePanel";
import { CLIP_SECONDS } from "../src/widgets/StoryPlayer/engine/rendering/panels/interludeTemplates";

import {
  createInstantTweenRunner,
  PlaybackTestFrames,
} from "./helpers/playbackFrames";

import type {
  CharacterArt,
  CharacterArtLoad,
} from "../src/widgets/StoryPlayer/engine/rendering/characters/CharacterArt";
import type { TextureLoad } from "../src/widgets/StoryPlayer/engine/rendering/core/TextureAsset";
import type { TweenRunner } from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import type { InterludeInput } from "../src/widgets/StoryPlayer/engine/types";

// 模板贴图走随包静态资源(Assets.load),测试里替换为空纹理保持离线。
vi.mock(
  "../src/widgets/StoryPlayer/engine/rendering/panels/interludeTemplates",
  async (importOriginal) => {
    const mod =
      await importOriginal<
        typeof import("../src/widgets/StoryPlayer/engine/rendering/panels/interludeTemplates")
      >();
    // Texture.EMPTY 的 orig 为 null,模板构建里设置 width 会炸;用 WHITE(1x1)。
    const white = () => Texture.WHITE;
    const tex = {
      iconBack: white(),
      unknownVertical: white(),
      unknownSquare: white(),
      commonFrame: white(),
      waveBase: white(),
      waveShadow: white(),
      dialogGrad: white(),
      dialogFrame: white(),
      gradientV: white(),
    };
    return { ...mod, loadInterludeTextures: () => tex };
  },
);

const VERTICAL = "group_interclude_vertical_common";
const SQUARE = "group_interclude_square_common";
const DIALOG = "interlude_dialog_left";
const SQUARE_SHOW_MS = CLIP_SECONDS.squareShow * 1000;

function input(overrides: Partial<InterludeInput> = {}): InterludeInput {
  return {
    alphaDurationMs: 0,
    alphaFrom: -1,
    alphaTo: -1,
    block: true,
    channel: 3,
    charName: "",
    clear: false,
    direction: "",
    durationMs: 0,
    // Unknown maskid: Web-only rectangle fallback (native has no template).
    maskId: "square",
    name: "",
    offset: { x: 0, y: 0 },
    scaleDurationMs: 0,
    size: { x: 300, y: 300 },
    slot: "",
    style: 0,
    switchOn: false,
    templateSizeDurationMs: 0,
    templateSizeFrom: { x: 0, y: 0 },
    templateSizeTo: { x: 0, y: 0 },
    type: 0,
    ...overrides,
  };
}

/** Records every tween duration and completes it at once. */
function recordingTweens(durations: number[]): TweenRunner {
  const runner = createInstantTweenRunner();
  const start = runner.start.bind(runner);
  vi.spyOn(runner, "start").mockImplementation((...args) => {
    durations.push(args[0]);
    return start(...args);
  });
  return runner;
}

function createPanel(
  layer: Container,
  loadTexture: (input: InterludeInput) => TextureLoad,
  tweens: TweenRunner,
  onWarning?: (detail: string) => void,
  loadAvatar = (input: InterludeInput): CharacterArtLoad => {
    const texture = loadTexture(input);
    const describe = (resolved: Texture | null): CharacterArt | null =>
      resolved && {
        acquire: () => ({ texture: resolved }),
        height: resolved.height,
        pos: { x: 0, y: 0 },
        width: resolved.width,
      };
    return texture instanceof Promise
      ? texture.then(describe)
      : describe(texture);
  },
): InterludePanel {
  return new InterludePanel(
    layer,
    loadTexture,
    (_key, texture) => [texture.width, texture.height],
    loadAvatar,
    tweens,
    onWarning,
  );
}

function channel(panel: InterludePanel, id = 3): any {
  return (panel as any).channels.get(id);
}

describe("InterludePanel", () => {
  it("reuses a channel, adds an element, and clears the channel", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = createPanel(layer, loadTexture, createInstantTweenRunner());

    await panel.run(input())?.completion;
    expect(layer.children).toHaveLength(1);

    await panel.run(input({ name: "avg_test", slot: "m", type: 2 }))
      ?.completion;
    expect(layer.children).toHaveLength(1);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(
      input({ name: "avg_test", slot: "m", type: 2 }),
    );
    // type 2 恒挂通道 _imgBackground(native 不看 slot)。
    const bg = channel(panel).elements.get("\u0000bg");
    expect(bg.node.visible).toBe(true);
    expect(bg.node.alpha).toBe(1);

    await panel.run(input({ clear: true }))?.completion;
    expect(layer.children).toHaveLength(0);
  });

  it("reuses the background scale across channel IDs until the panel resets", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = createPanel(
      new Container(),
      () => Texture.WHITE,
      frames.createTweenRunner(),
    );
    const show = { block: false, maskId: "ui_cutin_mask_vertical", style: 1 };
    const clear = { block: false, clear: true };

    // act33side_01_end: channel 2 scales the background, then channel 3
    // reuses the pooled channel with no sfrom or sto.
    panel.run(input({ ...show, channel: 2 }));
    panel.run(
      input({
        block: false,
        channel: 2,
        name: "27_g4_giantwall",
        scaleFrom: { x: 1.3, y: 1.3 },
        scaleTo: { x: 1.3, y: 1.3 },
        type: 2,
      }),
    );
    frames.step(16);
    panel.run(input({ ...clear, channel: 2 }));
    frames.step(16);

    const background = {
      block: false,
      name: "44_g3_ludwigsuniv_outside",
      type: 2,
    } as const;
    panel.run(input({ ...show, channel: 3 }));
    panel.run(input({ ...background, channel: 3 }));
    const inherited = channel(panel, 3).elements.get("\u0000bg").node.scale;
    expect([inherited.x, inherited.y]).toEqual([1.3, 1.3]);

    panel.run(input({ ...clear, channel: 3 }));
    frames.step(16);
    panel.clearAll();
    panel.run(input({ ...show, channel: 3 }));
    panel.run(input({ ...background, channel: 3 }));
    const reset = channel(panel, 3).elements.get("\u0000bg").node.scale;
    expect([reset.x, reset.y]).toEqual([1, 1]);
  });

  it.each([false, true])(
    "keeps older background tweens on the reused image when the last sequence has a move (%s)",
    (moves) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const panel = createPanel(
        new Container(),
        () => Texture.WHITE,
        frames.createTweenRunner(),
      );
      const show = { block: false, maskId: VERTICAL };
      const bg = { block: false, name: "bg_light", type: 2 } as const;
      panel.run(input(show));
      panel.run(
        input({
          ...bg,
          scaleDurationMs: 1000,
          scaleFrom: { x: 1, y: 1 },
          scaleTo: { x: 3, y: 3 },
        }),
      );
      frames.step(100);
      panel.run(
        input({
          block: false,
          durationMs: 1000,
          positionFrom: moves ? { x: 0, y: 0 } : undefined,
          positionTo: moves ? { x: 200, y: 0 } : undefined,
          type: 2,
        }),
      );
      panel.run(input({ block: false, clear: true }));
      frames.step(100);
      expect(channel(panel)).toBeUndefined();

      panel.run(input({ ...show, channel: 4 }));
      panel.run(input({ ...bg, channel: 4 }));
      const { node } = channel(panel, 4).elements.get("\u0000bg");
      expect(node.scale.x).toBeCloseTo(1.72);
      frames.step(800);
      expect(node.scale.x).toBe(3);
      expect(node.position.x).toBe(0);
    },
  );

  it("drives only the deco wave toggle with switch, never content visibility", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );

    // level_main_16-04_end shape: switch flips between speaking and silent.
    await panel.run(input({ block: false, maskId: VERTICAL, switchOn: true }))
      ?.completion;
    const state = channel(panel);
    const [, waveActive, waveStop] = state.deco.root.children;
    expect(waveActive.visible).toBe(true);
    expect(waveStop.visible).toBe(false);

    await panel.run(
      input({ maskId: VERTICAL, name: "avg_npc_1#1", switchOn: true, type: 3 }),
    )?.completion;
    const avatar = state.avatar;
    expect(
      avatar.offset.children.some((sprite: Container) => sprite.visible),
    ).toBe(true);

    await panel.run(input({ maskId: VERTICAL, switchOn: false, type: 3 }))
      ?.completion;
    expect(waveActive.visible).toBe(false);
    expect(waveStop.visible).toBe(true);
    expect(
      avatar.offset.children.some((sprite: Container) => sprite.visible),
    ).toBe(true);
    expect(state.root.visible).toBe(true);

    // The key defaults to false and is re-rendered on every update.
    await panel.run(input({ block: false, maskId: VERTICAL, switchOn: true }))
      ?.completion;
    await panel.run(input({ block: false, maskId: VERTICAL }))?.completion;
    expect(waveActive.visible).toBe(false);
    expect(waveStop.visible).toBe(true);
  });

  it("moves only the template and deco by offset, never the elements", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );

    // story_bobb_1_1 shape: the corpus bakes the offset into pfrom/pto.
    await panel.run(
      input({
        maskId: VERTICAL,
        offset: { x: -250, y: 0 },
        size: { x: 290, y: 760 },
      }),
    )?.completion;
    const state = channel(panel);
    expect(state.root.position.x).toBe(640);
    expect(state.root.position.y).toBe(360);
    expect(state.template.root.position.x).toBe(-250);
    expect(state.deco.root.position.x).toBe(-250);

    await panel.run(
      input({
        maskId: VERTICAL,
        name: "avg_npc_222",
        positionFrom: { x: -250, y: 0 },
        positionTo: { x: -250, y: 0 },
        type: 3,
      }),
    )?.completion;
    const avatar = state.avatar;
    expect(avatar.offset.position.x).toBe(-250);
    expect(state.charPoz.position.x).toBe(0);
  });

  it.each([
    { durationMs: 0, startX: -460, halfwayX: -460 },
    { durationMs: 0.01, startX: -460, halfwayX: -460 },
    { durationMs: 0.2, startX: -450, halfwayX: -458.75 },
  ])(
    "moves the avatar using SlotMoveChar with a $durationMs ms duration",
    ({ durationMs, startX, halfwayX }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const runner = frames.createTweenRunner();
      const panel = createPanel(new Container(), () => Texture.WHITE, runner);
      panel.run(input({ block: false, maskId: SQUARE }));
      const wait = panel.run(
        input({
          durationMs,
          name: "avg_1041_angel2_1#9$1",
          positionFrom: { x: -450, y: 0 },
          positionTo: { x: -460, y: 0 },
          type: 3,
        }),
      );
      const { offset: node } = channel(panel).avatar;
      expect(node.x).toBe(startX);
      expect(wait?.endReason).toBeUndefined();
      frames.step(durationMs / 2);
      expect(node.x).toBe(halfwayX);
      frames.step(durationMs / 2);
      expect(node.x).toBe(-460);
      expect(wait?.endReason).toBe("complete");
    },
  );

  it("runs OutQuad alpha, position and scale tracks with their own durations", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const start = vi.spyOn(runner, "start");
    const panel = createPanel(new Container(), () => Texture.EMPTY, runner);

    // Channel must pre-exist: native OnCutinBegin never reaches
    // _ProcessElement, so element params ride an update command.
    panel.run(input({ block: false }));
    const animation = panel.run(
      input({
        alphaDurationMs: 300,
        durationMs: 1000,
        name: "bg_test",
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 0 },
        scaleDurationMs: 500,
        scaleFrom: { x: 1, y: 1 },
        scaleTo: { x: 2, y: 2 },
        type: 2,
      }),
    );
    expect(start.mock.calls.map(([duration]) => duration)).toEqual([1000]);

    const { node } = channel(panel).elements.get("\u0000bg");
    frames.step(250);
    expect(node.alpha).toBeCloseTo(1 - (1 - 250 / 300) ** 2);
    expect(node.position.x).toBe(4.375);
    expect(node.scale.x).toBe(1.75);
    frames.step(500);
    expect(node.alpha).toBe(1);
    expect(node.position.x).toBe(9.375);
    expect(node.scale.x).toBe(2);
    expect(animation?.endReason).toBeUndefined();
    frames.step(250);
    expect(animation?.endReason).toBe("complete");
    expect(node.alpha).toBe(1);
    expect(node.position.x).toBe(10);
    expect(node.scale.x).toBe(2);
  });

  it("keeps a running fade when the next command on the same element only moves it", async () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      frames.createTweenRunner(),
    );

    // level_main_13-05_beg lines 13-14: a non-blocking 2s fade-in, then a
    // position-only command on the same uichar slot. Natively the first
    // sequence keeps running (DOKill cannot reach nested tweens).
    await panel.run(input({ block: false }))?.completion;
    await panel.run(
      input({
        alphaDurationMs: 2000,
        block: false,
        name: "cutin_char_9",
        slot: "m",
        type: 1,
      }),
    )?.completion;
    await panel.run(
      input({
        block: false,
        durationMs: 40_000,
        positionFrom: { x: 20, y: 50 },
        positionTo: { x: 60, y: 50 },
        slot: "m",
        type: 1,
      }),
    )?.completion;
    const { node } = channel(panel).elements.get("m");
    expect(node.alpha).toBe(0);

    frames.step(2000);
    expect(node.alpha).toBe(1);
    frames.step(18_000);
    expect(node.position.x).toBe(50);
    frames.step(20_000);
    expect(node.position.x).toBe(60);
  });

  it.each([
    { type: 1, key: "m" },
    { type: 2, key: "\u0000bg" },
  ] as const)(
    "clears the previous type $type image and still waits for a missing image's fade",
    ({ type, key }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const runner = frames.createTweenRunner();
      const warn = vi.fn();
      const panel = createPanel(
        new Container(),
        ({ name }) => (name === "missing" ? null : Texture.WHITE),
        runner,
        warn,
      );
      panel.run(input({ block: false, maskId: VERTICAL }));
      panel.run(input({ block: false, name: "old", type }));
      const { node, sprite } = channel(panel).elements.get(key);
      expect(sprite.texture).toBe(Texture.WHITE);

      const wait = panel.run(
        input({ alphaDurationMs: 100, name: "missing", type }),
      );
      expect(sprite.texture).toBe(Texture.EMPTY);
      expect(warn).toHaveBeenCalledWith(
        "interlude element asset is missing: missing",
      );
      frames.step(25);
      expect(node.alpha).toBeCloseTo(0.4375);
      expect(wait?.endReason).toBeUndefined();
      frames.step(75);
      expect(wait?.endReason).toBe("complete");
    },
  );

  it("keeps an older element sequence writing after a shorter one completes", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = createPanel(new Container(), () => Texture.WHITE, runner);

    panel.run(input({ block: false }));
    panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        durationMs: 2000,
        name: "bg_a",
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 16, y: 0 },
        scaleDurationMs: 2000,
        scaleFrom: { x: 1, y: 1 },
        scaleTo: { x: 2, y: 2 },
        type: 2,
      }),
    );
    frames.step(500);
    panel.run(
      input({
        alphaDurationMs: 500,
        alphaFrom: 1,
        alphaTo: 0.5,
        block: false,
        durationMs: 500,
        name: "bg_b",
        positionFrom: { x: 10, y: 0 },
        positionTo: { x: 20, y: 0 },
        scaleDurationMs: 500,
        scaleFrom: { x: 2, y: 2 },
        scaleTo: { x: 3, y: 3 },
        type: 2,
      }),
    );
    const { node } = channel(panel).elements.get("\u0000bg");
    frames.step(500);
    expect(node.alpha).toBe(0.5);
    expect(node.position.x).toBe(20);
    expect(node.scale.x).toBe(3);

    frames.step(500);
    expect(node.alpha).toBe(0.9375);
    expect(node.position.x).toBe(15);
    expect(node.scale.x).toBe(1.9375);
  });

  it("resets the offset and fades both avatar images on a named update", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = createPanel(new Container(), () => Texture.WHITE, runner);

    panel.run(input({ block: false }));
    const name = "avg_4213_skybx_1#1$1";
    const first = panel.run(input({ name, type: 3 }));
    const { offset: node } = channel(panel).avatar;
    const visibleAlphas = () =>
      node.children
        .filter((image: Container) => image.visible)
        .map((image: Container) => image.alpha);
    expect(visibleAlphas()).toEqual([0]);
    frames.step(16);
    expect(first?.endReason).toBe("complete");
    expect(visibleAlphas()).toEqual([1]);

    // level_act47side_07_beg lines 282–285 move the avatar, then fade it
    // with the same name while SlotMoveChar is still running.
    panel.run(
      input({
        block: false,
        durationMs: 5000,
        positionFrom: { x: -15, y: 0 },
        positionTo: { x: 15, y: 0 },
        type: 3,
      }),
    );
    frames.step(1500);
    expect(node.x).toBeCloseTo(4.71);
    const wait = panel.run(
      input({ alphaDurationMs: 1000, alphaFrom: 1, alphaTo: 0, name, type: 3 }),
    );
    expect(node.x).toBe(0);
    expect(visibleAlphas()).toEqual([1, 1]);
    frames.step(500);
    expect(node.x).toBeCloseTo(8.52);
    expect(visibleAlphas()).toEqual([0.5, 0.5]);
    expect(wait?.endReason).toBeUndefined();
    frames.step(500);
    expect(visibleAlphas()).toEqual([0]);
    expect(wait?.endReason).toBe("complete");
  });

  it("preserves the avatar's offset when replacing char_empty", async () => {
    const panel = createPanel(
      new Container(),
      () => Texture.WHITE,
      createInstantTweenRunner(),
    );
    panel.run(input({ block: false }));
    await panel.run(
      input({
        name: "CHAR_EMPTY",
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 15, y: 10 },
        type: 3,
      }),
    )?.completion;
    await panel.run(input({ name: "avg_npc_1", type: 3 }))?.completion;
    expect(channel(panel).avatar.offset.position).toMatchObject({
      x: 15,
      y: -10,
    });
  });

  it("keeps the reused front avatar visible after an interrupted back fade", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = createPanel(new Container(), () => Texture.WHITE, runner);

    panel.run(input({ block: false }));
    panel.run(input({ block: false, name: "first", type: 3 }));
    const { offset: node } = channel(panel).avatar;
    const firstFront = node.children[1];
    frames.step(16);
    panel.run(
      input({ alphaDurationMs: 1000, block: false, name: "second", type: 3 }),
    );
    frames.step(500);
    panel.run(input({ block: false, name: "third", type: 3 }));
    frames.step(500);

    expect(node.children[1]).toBe(firstFront);
    expect(firstFront.visible).toBe(true);
    expect(firstFront.alpha).toBe(1);
    expect(node.children[0].visible).toBe(false);
  });

  it("keeps a background tween running across a char command on the same channel", async () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      frames.createTweenRunner(),
    );

    await panel.run(input({ block: false }))?.completion;
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_light",
        type: 2,
      }),
    )?.completion;
    const state = channel(panel);
    const bg = state.elements.get("\u0000bg");
    expect(bg.node.alpha).toBe(0);

    await panel.run(
      input({ block: false, name: "cutin_char_4", slot: "m", type: 1 }),
    )?.completion;
    frames.step(2000);
    expect(bg.node.alpha).toBe(1);
    expect(state.elements.get("m")).not.toBe(bg);
  });

  it("gates the blocking show on the native floors per template", async () => {
    const cases: Array<[string, number, number[]]> = [
      [VERTICAL, 0, [1000]],
      [VERTICAL, 1, [3000]],
      [VERTICAL, 2, [3000]],
      // No _animWrapper on the vertical template: ANIMATOR keeps the 1s floor.
      [VERTICAL, 3, [1000]],
      // Horizon has an animWrapper: the clip plays, completion is immediate.
      ["ui_cutin_mask_horizon", 3, [CLIP_SECONDS.horiMaskOpen * 1000]],
      // Unknown maskid: the native template load fails and completes at once.
      ["square", 0, []],
    ];
    for (const [maskId, style, expected] of cases) {
      const durations: number[] = [];
      const panel = createPanel(
        new Container(),
        async () => Texture.EMPTY,
        recordingTweens(durations),
      );
      await panel.run(input({ maskId, style }))?.completion;
      expect(durations).toEqual(expected);
    }
  });

  it("applies size/offset only when the channel is created, not on updates", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );

    await panel.run(
      input({
        maskId: "ui_cutin_mask_horizon",
        offset: { x: 10, y: 20 },
        size: { x: 1280, y: 100 },
      }),
    )?.completion;
    const state = channel(panel);
    expect(state.template.root.position.x).toBe(10);
    expect(state.template.root.position.y).toBe(-20);
    expect(state.template.maskGraphics.width).toBeCloseTo(1280, 0);

    await panel.run(
      input({
        maskId: "ui_cutin_mask_horizon",
        name: "bg_test",
        offset: { x: 999, y: 999 },
        size: { x: 5, y: 5 },
        type: 2,
      }),
    )?.completion;
    expect(state.template.root.position.x).toBe(10);
    expect(state.template.root.position.y).toBe(-20);
    expect(state.template.maskGraphics.width).toBeCloseTo(1280, 0);
  });

  it("starts the ts scale entry on _scaleTrans once at creation, never on updates", async () => {
    const durations: number[] = [];
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTweens(durations),
    );

    await panel.run(
      input({
        maskId: VERTICAL,
        size: { x: 290, y: 760 },
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
      }),
    )?.completion;
    // ts entry (500) + show floor (1000).
    expect(durations).toEqual([500, 1000]);
    const state = channel(panel);
    // vertical `_scaleTrans` is back_shadow; img_unknown is not scaled.
    expect(state.template.scaleNode).not.toBe(state.template.root);
    expect(state.template.scaleNode.scale.x).toBe(1);

    await panel.run(
      input({
        maskId: VERTICAL,
        name: "bg_test",
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
        type: 2,
      }),
    )?.completion;
    expect(durations).toEqual([500, 1000, 0]);
  });

  it.each([0, 2])("reads live scale on style %i clear", (style) => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = createPanel(new Container(), () => Texture.EMPTY, runner);

    panel.run(
      input({
        block: false,
        maskId: VERTICAL,
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0.2, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
      }),
    );
    frames.step(250);
    const state = channel(panel);
    const scale = state.template.scaleNode.scale;
    expect(scale.x).toBeCloseTo(0.8);
    expect(scale.y).toBe(1);

    panel.run(
      input({
        alphaDurationMs: 400,
        block: false,
        clear: true,
        style,
        templateSizeDurationMs: 400,
        templateSizeFrom: { x: 9, y: 9 },
        templateSizeTo: { x: 0, y: 1 },
      }),
    );
    frames.step(200);
    // Entry reaches 0.992 on this update. Hide first reads that scale and
    // then applies its own halfway OutQuad (0.75) toward 0.
    expect(scale.x).toBeCloseTo(0.248);
    // deco.Hide fades the deco out over 0.5s.
    expect(state.deco.root.alpha).toBeCloseTo(0.36);
  });

  it("maps uichar slots like _GetImgElementByParam without warnings", async () => {
    const warnings: string[] = [];
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
      (detail) => warnings.push(detail),
    );

    await panel.run(input())?.completion;
    await panel.run(input({ name: "cutin_char_1", slot: "right", type: 1 }))
      ?.completion;
    await panel.run(input({ name: "cutin_char_2", slot: "r", type: 1 }))
      ?.completion;
    await panel.run(input({ name: "cutin_char_3", slot: "", type: 1 }))
      ?.completion;
    await panel.run(input({ name: "cutin_char_4", slot: "middle", type: 1 }))
      ?.completion;
    await panel.run(input({ name: "cutin_char_5", slot: "x", type: 1 }))
      ?.completion;
    const state = channel(panel);
    expect([...state.elements.keys()].sort()).toEqual(["m", "r"]);
    expect(warnings).toEqual([]);
  });

  it.each([true, false])(
    "hides without recycling on clear-all with block=%s",
    (block) => {
      const layer = new Container();
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const warn = vi.fn();
      const panel = createPanel(
        layer,
        () => Texture.EMPTY,
        frames.createTweenRunner(),
        warn,
      );
      panel.run(input({ block: false, channel: 3, maskId: SQUARE }));
      panel.run(input({ block: false, channel: 4, maskId: DIALOG }));
      const square = channel(panel, 3);
      const dialog = channel(panel, 4);
      const deco = square.deco.root;
      const finish = vi.fn();
      const clear = panel.run(
        input({
          block,
          channel: -1,
          clear: true,
          templateSizeDurationMs: 250,
          templateSizeTo: { x: 0, y: 1 },
        }),
        block ? finish : undefined,
      );

      expect(Boolean(clear)).toBe(block);
      expect(clear?.endReason).toBeUndefined();
      frames.step(250);
      expect(square.template.scaleNode.scale).toMatchObject({ x: 0, y: 1 });
      expect(deco.destroyed).toBe(true);
      expect(warn).toHaveBeenCalledTimes(1);
      frames.step(250);
      expect(dialog.template.dialog.group.alpha).toBe(0);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(channel(panel, 3)).toBe(square);
      expect(channel(panel, 4)).toBe(dialog);
      expect(layer.children).toEqual([square.root, dialog.root]);
      expect(clear?.endReason).toBeUndefined();
      expect(finish).not.toHaveBeenCalled();

      panel.clearAll();
      expect(clear?.endReason).toBe(block ? "reset" : undefined);
      expect(layer.children).toHaveLength(0);
    },
  );

  it("keeps an empty blocking clear-all pending until reset", () => {
    const panel = createPanel(
      new Container(),
      () => Texture.EMPTY,
      createInstantTweenRunner(),
    );
    const finish = vi.fn();

    const emptyClear = panel.run(input({ channel: -1, clear: true }), finish);
    expect(emptyClear).toMatchObject({ blocking: true, endReason: undefined });
    panel.clearAll();
    expect(emptyClear?.endReason).toBe("reset");
    expect(finish).not.toHaveBeenCalled();
  });

  it.each([
    { maskId: VERTICAL, recycleAtMs: 100 },
    { maskId: DIALOG, recycleAtMs: 1000 },
    { maskId: "square", recycleAtMs: 1000 },
  ])(
    "recycles $maskId at $recycleAtMs ms when two clears overlap",
    ({ maskId, recycleAtMs }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const layer = new Container();
      const panel = createPanel(
        layer,
        () => Texture.WHITE,
        frames.createTweenRunner(),
      );
      const show = input({ block: false, maskId });
      panel.run(show);
      const [original] = layer.children;

      for (const duration of [100, 1000]) {
        panel.run(
          input({
            alphaDurationMs: duration,
            block: false,
            clear: true,
            templateSizeDurationMs: duration,
          }),
        );
      }

      frames.step(recycleAtMs - 1);
      expect(layer.children).toEqual([original]);
      frames.step(1);
      expect(layer.children).toHaveLength(0);

      panel.run(show);
      expect(layer.children).toHaveLength(1);
      const [replacement] = layer.children;
      frames.step(1000);
      expect(layer.children).toEqual([replacement]);
    },
  );

  it.each([
    { style: 0, tween: "scale" },
    { style: 1, tween: "mask fade" },
  ])(
    "cancels a longer $tween clear after the first update destroys the template",
    ({ style }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const layer = new Container();
      const panel = createPanel(
        layer,
        () => Texture.WHITE,
        frames.createTweenRunner(),
      );
      panel.run(input({ block: false, maskId: VERTICAL }));
      const [root] = layer.children;
      const clear = { clear: true, style };
      panel.run(
        input({
          ...clear,
          alphaDurationMs: 100,
          block: false,
          templateSizeDurationMs: 100,
        }),
      );
      const finish = vi.fn();
      const wait = panel.run(
        input({
          ...clear,
          alphaDurationMs: 1000,
          templateSizeDurationMs: 1000,
        }),
        finish,
      );

      frames.step(100);
      expect(layer.children).toHaveLength(0);
      expect(root.destroyed).toBe(true);
      frames.step(900);
      expect(finish).not.toHaveBeenCalled();
      // The cancelled tween supplies no command completion. A reset settles
      // the remaining wait.
      expect(wait?.endReason).toBeUndefined();
      panel.clearAll();
      expect(wait?.endReason).toBe("reset");
    },
  );

  it("lets both template clears finish within the update that recycles the channel", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const layer = new Container();
    const panel = createPanel(
      layer,
      () => Texture.WHITE,
      frames.createTweenRunner(),
    );
    panel.run(input({ block: false, maskId: VERTICAL }));
    const [root] = layer.children;
    panel.run(
      input({ block: false, clear: true, templateSizeDurationMs: 100 }),
    );
    const finish = vi.fn();
    const wait = panel.run(
      input({ clear: true, templateSizeDurationMs: 120 }),
      finish,
    );

    frames.step(120);
    expect(wait?.endReason).toBe("complete");
    expect(finish).toHaveBeenCalledExactlyOnceWith();
    expect(root.destroyed).toBe(true);
    expect(layer.children).toHaveLength(0);
  });

  it("replaces the previous dialog hide", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const layer = new Container();
    const panel = createPanel(
      layer,
      () => Texture.WHITE,
      frames.createTweenRunner(),
    );
    panel.run(input({ block: false, maskId: DIALOG }));
    panel.run(input({ alphaDurationMs: 100, block: false, clear: true }));
    const wait = panel.run(input({ alphaDurationMs: 1000, clear: true }));

    frames.step(100);
    expect(layer.children).toHaveLength(1);
    expect(wait?.endReason).toBeUndefined();
    frames.step(900);
    expect(layer.children).toHaveLength(0);
    expect(wait?.endReason).toBe("complete");
  });

  it("keeps the deco name when a later command has no char", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );

    // sandbox_2_ending_2 shape: char only on the creating command.
    await panel.run(input({ charName: "拜松", maskId: SQUARE, style: 1 }))
      ?.completion;
    const state = channel(panel);
    expect(state.deco.label.text).toBe("拜松");

    await panel.run(input({ block: false, maskId: SQUARE, switchOn: true }))
      ?.completion;
    expect(state.deco.label.text).toBe("拜松");

    await panel.run(
      input({ block: false, charName: "Kal'tsit", maskId: SQUARE }),
    )?.completion;
    expect(state.deco.label.text).toBe("Kal'tsit");
  });

  it("re-checks _emptyImg only when a non-empty name changes", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );

    await panel.run(input({ maskId: SQUARE, style: 1 }))?.completion;
    const unknown = channel(panel).template.emptyImage;
    expect(unknown.visible).toBe(true);

    await panel.run(
      input({ maskId: SQUARE, name: "avg_npc_990_1#10$1", type: 3 }),
    )?.completion;
    expect(unknown.visible).toBe(false);

    // Name-less updates (switch flips, moves) keep the placeholder hidden.
    await panel.run(input({ block: false, maskId: SQUARE, switchOn: true }))
      ?.completion;
    expect(unknown.visible).toBe(false);

    await panel.run(input({ maskId: SQUARE, name: "CHAR_EMPTY", type: 3 }))
      ?.completion;
    expect(unknown.visible).toBe(true);
  });

  it.each([true, false])(
    "fails inline on clear-all without a template with block=%s",
    (block) => {
      const layer = new Container();
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const panel = createPanel(
        layer,
        () => Texture.EMPTY,
        frames.createTweenRunner(),
      );
      panel.run(input({ block: false, channel: 3 }));
      panel.run(input({ block: false, channel: 4, maskId: DIALOG }));
      const group = channel(panel, 4).template.dialog.group;

      const clear = panel.run(input({ block, channel: -1, clear: true }));
      expect(clear?.endReason).toBe("error");
      expect(clear?.failure?.error).toBeInstanceOf(Error);
      frames.step(500);
      expect(group.alpha).toBe(1);
      expect(layer.children).toHaveLength(2);
    },
  );

  it("drops element params on a create command (native begin never reaches _ProcessElement)", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const durations: number[] = [];
    const panel = createPanel(
      new Container(),
      loadTexture,
      recordingTweens(durations),
    );

    await panel.run(
      input({ maskId: VERTICAL, name: "cutin_char_3", slot: "m", type: 1 }),
    )?.completion;
    expect(channel(panel).elements.size).toBe(0);
    expect(loadTexture).not.toHaveBeenCalled();
    expect(durations).toEqual([1000]);
  });

  it("lets the latest element tween run through the hide and kills it on recycle", async () => {
    const layer = new Container();
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = createPanel(
      layer,
      async () => Texture.EMPTY,
      frames.createTweenRunner(),
    );

    await panel.run(input({ block: false }))?.completion;
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_light",
        type: 2,
      }),
    )?.completion;
    const { node } = channel(panel).elements.get("\u0000bg");

    await panel.run(
      input({ block: false, clear: true, templateSizeDurationMs: 1500 }),
    )?.completion;
    // OnCutinEnd's DOKill cannot reach the nested fade: it keeps running.
    frames.step(1000);
    expect(node.alpha).toBe(0.75);

    frames.step(500);
    expect(layer.children).toHaveLength(0);
    expect(node.parent).toBeNull();
    const alphaAtRecycle = node.alpha;
    frames.step(500);
    expect(node.alpha).toBe(alphaAtRecycle);
    panel.clearAll();
    expect(node.destroyed).toBe(true);
  });
});

describe("InterludePanel mask templates", () => {
  it("builds the square template and plays its show clip for every style", async () => {
    const durations: number[] = [];
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTweens(durations),
    );

    // Corpus square channels are all style 1 with an offset.
    await panel.run(
      input({
        charName: "Amiya",
        maskId: SQUARE,
        offset: { x: -450, y: 125 },
        style: 1,
      }),
    )?.completion;
    const state = channel(panel);
    expect(durations).toEqual([SQUARE_SHOW_MS, 3000]);
    // back_shadow ends at 250; content_mask insets 36 → 214.
    expect(state.template.maskGraphics.width).toBeCloseTo(214, 0);
    expect(state.template.backShadowGroup.alpha).toBe(1);
    // Template and deco share the offset (deco prefab position is overridden).
    expect(state.template.root.position.x).toBe(-450);
    expect(state.template.root.position.y).toBe(-125);
    expect(state.deco.root.position.x).toBe(-450);
    expect(state.deco.root.position.y).toBe(-125);
    expect(state.deco.frameGroup.width).toBeCloseTo(236, 0);
  });

  it("resizes the template from the command size (native: sizeDelta written only when |size|² > ε)", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );
    await panel.run(input({ maskId: VERTICAL, size: { x: 290, y: 760 } }))
      ?.completion;
    expect(channel(panel).template.maskGraphics.width).toBeCloseTo(290 - 36, 0);

    await panel.run(
      input({ channel: 4, maskId: VERTICAL, size: { x: 0, y: 0 } }),
    )?.completion;
    expect(channel(panel, 4).template.maskGraphics.width).toBeCloseTo(
      320 - 36,
      0,
    );
  });

  it("keeps ui_cutin_mask_vertical collapsed until style 1 resets its scale", async () => {
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      createInstantTweenRunner(),
    );
    await panel.run(input({ maskId: "ui_cutin_mask_vertical", style: 0 }))
      ?.completion;
    expect(channel(panel).template.scaleNode.scale.x).toBe(0);

    await panel.run(
      input({ channel: 4, maskId: "ui_cutin_mask_vertical", style: 1 }),
    )?.completion;
    expect(channel(panel, 4).template.scaleNode.scale.x).toBe(1);
  });

  it("dialog template consumes avatar/background updates instead of mounting elements", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.WHITE);
    const panel = createPanel(
      new Container(),
      loadTexture,
      createInstantTweenRunner(),
    );

    await panel.run(input({ maskId: DIALOG, offset: { x: 0, y: 150 } }))
      ?.completion;
    const state = channel(panel);
    const dialog = state.template.dialog;
    // anchoredPosition = offset with anchor/pivot at the left middle.
    expect(state.template.root.position.x).toBe(-640);
    expect(state.template.root.position.y).toBe(-150);

    await panel.run(input({ maskId: DIALOG, name: "avg_npc_999_1", type: 3 }))
      ?.completion;
    expect(state.elements.size).toBe(0);
    expect(dialog.charImage.texture).toBe(Texture.WHITE);
    expect(dialog.charImage.visible).toBe(true);
    // img_char keeps its 1380 rect.
    expect(dialog.charImage.width).toBeCloseTo(1380, 0);

    await panel.run(input({ maskId: DIALOG, name: "77_g4_classroom", type: 2 }))
      ?.completion;
    expect(dialog.bgImage.texture).toBe(Texture.WHITE);
    expect(dialog.bgImage.width).toBeCloseTo(550, 0);
    expect(state.elements.size).toBe(0);
  });

  it("dialog create consumes the avatar and skips the intro at duration 0 (act54side shape)", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const durations: number[] = [];
    const panel = createPanel(
      new Container(),
      loadTexture,
      recordingTweens(durations),
    );

    const command = input({
      dialogCharPos: { x: 0, y: 0 },
      durationMs: 0,
      maskId: DIALOG,
      name: "avg_npc_2380_1#1$1",
      offset: { x: 0, y: 150 },
      style: 3,
      type: 3,
    });
    await panel.run(command)?.completion;
    const state = channel(panel);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(command);
    expect(state.elements.size).toBe(0);
    expect(state.template.dialog.charImage.position.y).toBe(520);
    // End pose sampled, no intro tween and no 1s/3s floor on the dialog path.
    expect(state.template.dialog.group.position.x).toBe(10);
    expect(durations).toEqual([]);
  });

  it("applies icharpos/icharscale on top of the prefab layout and reloads only on name change", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.WHITE);
    const panel = createPanel(
      new Container(),
      loadTexture,
      createInstantTweenRunner(),
    );

    await panel.run(input({ maskId: DIALOG, name: "avg_npc_1#1", type: 3 }))
      ?.completion;
    const dialog = channel(panel).template.dialog;
    expect(loadTexture).toHaveBeenCalledTimes(1);

    await panel.run(
      input({
        dialogCharPos: { x: 30, y: 40 },
        dialogCharScale: { x: 1.5, y: 2 },
        maskId: DIALOG,
        name: "AVG_NPC_1#1",
        type: 3,
      }),
    )?.completion;
    expect(loadTexture).toHaveBeenCalledTimes(1);
    expect(dialog.charImage.position.x).toBe(30);
    expect(dialog.charImage.position.y).toBe(520 - 40);
    expect(dialog.charImage.width).toBeCloseTo(1380 * 1.5, 0);
    expect(dialog.charImage.height).toBeCloseTo(1380 * 2, 0);
  });

  it("holds the dialog at its first pose until the portrait loads, then plays the requested duration", async () => {
    const durations: number[] = [];
    const portrait = Promise.withResolvers<Texture>();
    const panel = createPanel(
      new Container(),
      () => portrait.promise,
      recordingTweens(durations),
    );

    const intro = panel.run(
      input({
        durationMs: 700,
        maskId: DIALOG,
        name: "avg_npc_1#1",
        style: 3,
        type: 3,
      }),
    );
    const { charImage, group } = channel(panel).template.dialog;
    expect(group.alpha).toBe(0);
    expect(durations).toEqual([]);

    portrait.resolve(Texture.WHITE);
    await intro?.completion;
    expect(charImage.texture).toBe(Texture.WHITE);
    expect(group.alpha).toBe(1);
    expect(durations).toEqual([700]);
  });

  it("releases the dialog portrait on replacement, char_empty and recycle", () => {
    const releaseFirst = vi.fn();
    const releaseSecond = vi.fn();
    const releaseThird = vi.fn();
    const loadAvatar = vi.fn<(input: InterludeInput) => CharacterArtLoad>();
    for (const release of [releaseFirst, releaseSecond, releaseThird]) {
      loadAvatar.mockReturnValueOnce({
        acquire: () => ({ texture: Texture.WHITE, release }),
        width: 1,
        height: 1,
        pos: { x: 0, y: 0 },
      });
    }
    const panel = createPanel(
      new Container(),
      () => Texture.EMPTY,
      createInstantTweenRunner(),
      undefined,
      loadAvatar,
    );
    const show = input({ maskId: DIALOG, name: "avg_npc_1#1", type: 3 });
    panel.run(show);
    panel.run({ ...show, name: "avg_npc_1#2" });
    expect(releaseFirst).toHaveBeenCalledTimes(1);
    expect(releaseSecond).not.toHaveBeenCalled();
    panel.run({ ...show, name: "char_empty" });
    expect(releaseSecond).toHaveBeenCalledTimes(1);
    panel.run(show);
    expect(loadAvatar).toHaveBeenCalledTimes(3);
    panel.run(input({ clear: true }));
    expect(releaseThird).toHaveBeenCalledTimes(1);
  });

  it("releases the texture wait on recycling a dialog that completes the update inline", async () => {
    const layer = new Container();
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const texture = Promise.withResolvers<Texture>();
    const panel = createPanel(
      layer,
      () => texture.promise,
      frames.createTweenRunner(),
    );
    panel.run(input({ block: false, maskId: DIALOG }));
    panel.run(input({ alphaDurationMs: 16, block: false, clear: true }));
    const wait = panel.run(input({ name: "bg_light", type: 2 }));

    expect(wait?.endReason).toBeUndefined();
    frames.step(16);
    expect(wait?.endReason).toBe("reset");
    expect(layer.children).toHaveLength(0);

    texture.resolve(Texture.WHITE);
    await texture.promise;
    expect(layer.children).toHaveLength(0);
  });

  it("applies no show floor when a dialog channel is created without style 3", async () => {
    const durations: number[] = [];
    const panel = createPanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTweens(durations),
    );
    await panel.run(input({ maskId: DIALOG }))?.completion;
    expect(durations).toEqual([]);
  });

  it("feeds dialog type 1 updates into img_char", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.WHITE);
    const panel = createPanel(
      new Container(),
      loadTexture,
      createInstantTweenRunner(),
    );

    await panel.run(input({ maskId: DIALOG }))?.completion;
    const update = input({ maskId: DIALOG, name: "cutin_char_1", type: 1 });
    await panel.run(update)?.completion;
    const state = channel(panel);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(update);
    expect(state.template.dialog.charImage.texture).toBe(Texture.WHITE);
    expect(state.elements.size).toBe(1);
    expect(state.content.visible).toBe(false);
  });

  it("fades the dialog group out with OutQuad on clear (0.5s default)", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const layer = new Container();
    const panel = createPanel(layer, () => Texture.EMPTY, runner);
    panel.run(input({ maskId: DIALOG }));
    const group = channel(panel).template.dialog.group;

    const wait = panel.run(input({ clear: true }));
    frames.step(250);
    expect(group.alpha).toBe(0.25);
    expect(wait?.endReason).toBeUndefined();
    frames.step(250);
    expect(wait?.endReason).toBe("complete");
    expect(group.alpha).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it.each([false, true])(
    "runs the element sequence alongside the direction clip with block=%s",
    async (block) => {
      const durations: number[] = [];
      const panel = createPanel(
        new Container(),
        () => Texture.EMPTY,
        recordingTweens(durations),
      );

      // act44side_08_end shape: horizon channel, then a direction uichar.
      await panel.run(
        input({
          maskId: "ui_cutin_mask_horizon",
          offset: { x: 0, y: 180 },
          size: { x: 1300, y: 360 },
          style: 3,
        }),
      )?.completion;
      durations.length = 0;

      const wait = panel.run(
        input({
          block,
          direction: "rin",
          durationMs: 1000,
          maskId: "ui_cutin_mask_horizon",
          name: "cutin_char_21",
          positionFrom: { x: 0, y: 180 },
          positionTo: { x: -200, y: 180 },
          scaleDurationMs: 300,
          scaleFrom: { x: 1.5, y: 1.5 },
          scaleTo: { x: 1, y: 1 },
          slot: "m",
          type: 1,
        }),
      );
      const state = channel(panel);
      const { node } = state.elements.get("m");
      // aDuration 0: SetCutinElement sets alpha straight to aTo (1).
      expect(node.alpha).toBe(1);
      expect(node.position.x).toBe(-200);
      expect(node.position.y).toBe(-180);
      expect(node.scale.x).toBe(1);
      expect(durations).toEqual([CLIP_SECONDS.direction * 1000, 1000]);
      expect(wait?.blocking ?? false).toBe(block);
      expect(wait?.endReason).toBeUndefined();
      panel.clearAll();
      expect(wait?.endReason).toBe(block ? "reset" : undefined);
      // The clip's alpha envelope ends at 0.
      expect(state.root.alpha).toBeCloseTo(0, 3);
    },
  );

  it("direction on a create plays the clip without mounting the element", async () => {
    const durations: number[] = [];
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = createPanel(
      new Container(),
      loadTexture,
      recordingTweens(durations),
    );

    await panel.run(
      input({
        direction: "lin",
        maskId: VERTICAL,
        name: "cutin_char_22",
        type: 1,
      }),
    )?.completion;
    expect(loadTexture).not.toHaveBeenCalled();
    expect(channel(panel).elements.size).toBe(0);
    // Clip (not gating) + the 1s show floor.
    expect(durations).toEqual([CLIP_SECONDS.direction * 1000, 1000]);
  });
});
