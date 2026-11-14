import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { InterludePanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/InterludePanel";
import { CLIP_SECONDS } from "../src/widgets/StoryPlayer/engine/rendering/panels/interludeTemplates";

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

async function tweenImmediately(
  _duration: number,
  update: (progress: number) => void,
  complete?: () => void,
): Promise<void> {
  update(1);
  complete?.();
}

/** Tween stub that only advances half-way and never completes. */
async function tweenHalfway(
  _duration: number,
  update: (progress: number) => void,
): Promise<void> {
  update(0.5);
}

/** Records every tween duration and completes it at once. */
function recordingTween(durations: number[]) {
  return async (
    duration: number,
    update: (progress: number) => void,
    complete?: () => void,
  ) => {
    durations.push(duration);
    update(1);
    complete?.();
  };
}

function channel(panel: InterludePanel, id = 3): any {
  return (panel as any).channels.get(id);
}

describe("InterludePanel", () => {
  it("reuses a channel, adds an element, and clears the channel", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = new InterludePanel(layer, loadTexture, tweenImmediately);

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

  it("drives only the deco wave toggle with switch, never content visibility", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const avatar = state.elements.get("\u0000avatar");
    expect(avatar.node.visible).toBe(true);

    await panel.run(input({ maskId: VERTICAL, switchOn: false, type: 3 }))
      ?.completion;
    expect(waveActive.visible).toBe(false);
    expect(waveStop.visible).toBe(true);
    expect(avatar.node.visible).toBe(true);
    expect(state.root.visible).toBe(true);

    // The key defaults to false and is re-rendered on every update.
    await panel.run(input({ block: false, maskId: VERTICAL, switchOn: true }))
      ?.completion;
    await panel.run(input({ block: false, maskId: VERTICAL }))?.completion;
    expect(waveActive.visible).toBe(false);
    expect(waveStop.visible).toBe(true);
  });

  it("moves only the template and deco by offset, never the elements", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const avatar = state.elements.get("\u0000avatar");
    expect(avatar.node.position.x).toBe(-250);
    expect(state.charPoz.position.x).toBe(0);
  });

  it("runs alpha/pos/scale tweens in parallel with their own durations", async () => {
    const tweens: Array<{
      duration: number;
      update: (progress: number) => void;
      complete: () => void;
    }> = [];
    const panel = new InterludePanel(
      new Container(),
      () => Texture.EMPTY,
      async (duration, update, done) => {
        tweens.push({ complete: () => done?.(), duration, update });
      },
    );

    // Channel must pre-exist: native OnCutinBegin never reaches
    // _ProcessElement, so element params ride an update command.
    await panel.run(input({ block: false }))?.completion;
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
    expect(tweens.map(({ duration }) => duration)).toEqual([1000]);
    const [sequence] = tweens;

    const { node } = channel(panel).elements.get("\u0000bg");
    sequence.update(0.25);
    expect(node.alpha).toBeCloseTo(250 / 300);
    expect(node.position.x).toBe(2.5);
    expect(node.scale.x).toBe(1.5);
    sequence.update(0.75);
    expect(node.alpha).toBe(1);
    expect(node.position.x).toBe(7.5);
    expect(node.scale.x).toBe(2);
    expect(animation?.endReason).toBeUndefined();
    sequence.update(1);
    sequence.complete();
    expect(animation?.endReason).toBe("complete");
    expect(node.alpha).toBe(1);
    expect(node.position.x).toBe(10);
    expect(node.scale.x).toBe(2);
  });

  it("keeps a running fade when the next command on the same element only moves it", async () => {
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
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

    pending[0](1);
    expect(node.alpha).toBe(1);
    pending[1](1);
    expect(node.position.x).toBe(60);
  });

  it("lets a newer tween on the same property take over", async () => {
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
    );

    await panel.run(input({ block: false }))?.completion;
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_a",
        type: 2,
      }),
    )?.completion;
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 1,
        alphaTo: 0.5,
        block: false,
        name: "bg_b",
        type: 2,
      }),
    )?.completion;
    const { node } = channel(panel).elements.get("\u0000bg");
    pending[1](1);
    expect(node.alpha).toBe(0.5);
    // The superseded fade no longer writes.
    pending[0](1);
    expect(node.alpha).toBe(0.5);
  });

  it("keeps a background tween running across a char command on the same channel", async () => {
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
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
    pending[0](1);
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
      const panel = new InterludePanel(
        new Container(),
        async () => Texture.EMPTY,
        recordingTween(durations),
      );
      await panel.run(input({ maskId, style }))?.completion;
      expect(durations).toEqual(expected);
    }
  });

  it("applies size/offset only when the channel is created, not on updates", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTween(durations),
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

  it("clears by scaling from the current template ratio to tsto (tsfrom not reused)", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenHalfway,
    );

    await panel.run(
      input({
        block: false,
        maskId: VERTICAL,
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0.2, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
      }),
    )?.completion;
    const state = channel(panel);
    expect(state.ratio.x).toBeCloseTo(0.6);
    expect(state.ratio.y).toBe(1);

    await panel.run(
      input({
        block: false,
        clear: true,
        templateSizeDurationMs: 400,
        templateSizeFrom: { x: 9, y: 9 },
        templateSizeTo: { x: 0, y: 1 },
      }),
    )?.completion;
    expect(state.ratio.x).toBeCloseTo(0.3);
    expect(state.template.scaleNode.scale.x).toBeCloseTo(0.3);
    // deco.Hide fades the deco out over 0.5s.
    expect(state.deco.root.alpha).toBeCloseTo(0.5);
  });

  it("maps uichar slots like _GetImgElementByParam without warnings", async () => {
    const warnings: string[] = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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

  it("releases a blocking clear-all on the first recycled channel", async () => {
    const layer = new Container();
    const hides = new Map<number, () => void>();
    const panel = new InterludePanel(
      layer,
      () => Texture.EMPTY,
      async (duration, update, done) => {
        if (done)
          hides.set(duration, () => {
            update(1);
            done();
          });
      },
    );
    panel.run(input({ block: false, channel: 3, maskId: VERTICAL }));
    panel.run(input({ block: false, channel: 4, maskId: DIALOG }));
    const finish = vi.fn();
    const clear = panel.run(
      input({
        channel: -1,
        clear: true,
        templateSizeDurationMs: 250,
      }),
      finish,
    );

    expect(clear?.endReason).toBeUndefined();
    hides.get(250)!();
    expect(clear?.endReason).toBe("complete");
    expect(finish).toHaveBeenCalledTimes(1);
    expect(layer.children).toHaveLength(1);
    hides.get(500)!();
    expect(finish).toHaveBeenCalledTimes(2);
    expect(layer.children).toHaveLength(0);

    const emptyClear = panel.run(input({ channel: -1, clear: true }), finish);
    expect(emptyClear).toMatchObject({ blocking: true, endReason: undefined });
    panel.clearAll();
    expect(emptyClear?.endReason).toBe("reset");
    expect(finish).toHaveBeenCalledTimes(2);
  });

  it("keeps the deco name when a later command has no char", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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

  it("clears every channel when channel is negative", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );
    await panel.run(input({ channel: 3 }))?.completion;
    await panel.run(input({ channel: 4 }))?.completion;

    await panel.run(input({ channel: -1, clear: true }))?.completion;
    expect(layer.children).toHaveLength(0);
  });

  it("drops element params on a create command (native begin never reaches _ProcessElement)", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      recordingTween(durations),
    );

    await panel.run(
      input({ maskId: VERTICAL, name: "cutin_char_3", slot: "m", type: 1 }),
    )?.completion;
    expect(channel(panel).elements.size).toBe(0);
    expect(loadTexture).not.toHaveBeenCalled();
    expect(durations).toEqual([1000]);
  });

  it("lets element tweens run through the hide until the channel is recycled", async () => {
    const layer = new Container();
    const pending: Array<(progress: number) => void> = [];
    let finishHide: (() => void) | undefined;
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (_duration, update, complete) => {
        pending.push(update);
        if (complete) finishHide = complete;
      },
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
      input({ block: false, clear: true, templateSizeDurationMs: 500 }),
    )?.completion;
    // OnCutinEnd's DOKill cannot reach the nested fade: it keeps running.
    pending[0](0.5);
    expect(node.alpha).toBe(0.5);

    finishHide?.();
    expect(layer.children).toHaveLength(0);
    expect(node.destroyed).toBe(true);
    expect(() => pending[0](1)).not.toThrow();
  });
});

describe("InterludePanel mask templates", () => {
  it("builds the square template and plays its show clip for every style", async () => {
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTween(durations),
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
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
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
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      tweenImmediately,
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
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      recordingTween(durations),
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
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      tweenImmediately,
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

  it("remaps the dialog intro to the command duration for style 3", async () => {
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTween(durations),
    );

    await panel.run(
      input({
        durationMs: 700,
        maskId: DIALOG,
        name: "avg_npc_1#1",
        style: 3,
        type: 3,
      }),
    )?.completion;
    expect(durations).toEqual([700]);
  });

  it("applies no show floor when a dialog channel is created without style 3", async () => {
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      recordingTween(durations),
    );
    await panel.run(input({ maskId: DIALOG }))?.completion;
    expect(durations).toEqual([]);
  });

  it("feeds dialog type 1 updates into img_char", async () => {
    const loadTexture = vi.fn().mockResolvedValue(Texture.WHITE);
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      tweenImmediately,
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

  it("fades the dialog group out on clear (0.5s default)", async () => {
    const layer = new Container();
    const durations: number[] = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      recordingTween(durations),
    );
    await panel.run(input({ maskId: DIALOG }))?.completion;
    const group = channel(panel).template.dialog.group;

    await panel.run(input({ clear: true }))?.completion;
    expect(durations).toEqual([500]);
    expect(group.alpha).toBe(0);
    expect(layer.children).toHaveLength(0);
  });

  it("runs only the direction clip and waits for a reset when the update blocks", async () => {
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      () => Texture.EMPTY,
      recordingTween(durations),
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
    expect(node.position.x).toBe(0);
    expect(node.position.y).toBe(-180);
    expect(durations).toEqual([CLIP_SECONDS.direction * 1000]);
    expect(wait).toMatchObject({ blocking: true, endReason: undefined });
    panel.clearAll();
    expect(wait?.endReason).toBe("reset");
    // The clip's alpha envelope ends at 0.
    expect(state.root.alpha).toBeCloseTo(0, 3);
  });

  it("direction on a create plays the clip without mounting the element", async () => {
    const durations: number[] = [];
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = new InterludePanel(
      new Container(),
      loadTexture,
      recordingTween(durations),
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
