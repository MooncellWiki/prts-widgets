import { Container, Text, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { InterludePanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/InterludePanel";

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
    return { ...mod, loadInterludeTextures: async () => tex };
  },
);

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
    maskId: "square",
    name: "",
    offset: { x: 0, y: 0 },
    scaleDurationMs: 0,
    size: { x: 300, y: 300 },
    slot: "",
    style: 0,
    switchOn: true,
    switchSet: true,
    templateSizeDurationMs: 0,
    templateSizeFrom: { x: 1, y: 1 },
    templateSizeTo: { x: 1, y: 1 },
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

describe("InterludePanel", () => {
  it("reuses a channel, adds an element, toggles it, and clears the channel", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const tween = vi.fn(
      async (
        _duration: number,
        update: (progress: number) => void,
        complete?: () => void,
      ) => {
        update(1);
        complete?.();
      },
    );
    const panel = new InterludePanel(layer, loadTexture, tween);

    await panel.run(input());
    expect(layer.children).toHaveLength(1);

    await panel.run(input({ name: "avg_test", slot: "m", type: 2 }));
    expect(layer.children).toHaveLength(1);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(
      input({ name: "avg_test", slot: "m", type: 2 }),
    );

    await panel.run(input({ slot: "m", switchOn: false, type: 2 }));
    const state = (panel as any).channels.get(3);
    // type 2 恒挂通道 _imgBackground(native 不看 slot),槽位键独立。
    expect(state.elements.get("\u0000bg").visible).toBe(false);
    // switch toggles the content layers only; the mask root stays visible.
    expect(state.root.visible).toBe(true);

    await panel.run(input({ clear: true }));
    expect(layer.children).toHaveLength(0);
  });

  it("keeps everything visible when the switch key is absent (native: only the deco toggle consumes switch)", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );

    // Channel creation and element update without any switch key — these are
    // the corpus shapes of e.g. obt/main/level_main_13-05_beg.txt.
    await panel.run(input({ type: 0, switchSet: false, switchOn: false }));
    await panel.run(
      input({
        name: "bg_test",
        slot: "m",
        type: 2,
        switchSet: false,
        switchOn: false,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(state.root.visible).toBe(true);
    expect(state.elements.get("\u0000bg").visible).toBe(true);

    // A later command without the key must not change visibility either.
    await panel.run(
      input({ slot: "m", type: 2, switchSet: false, switchOn: false }),
    );
    expect(state.elements.get("\u0000bg").visible).toBe(true);
  });

  it("runs alpha/pos/scale tweens in parallel with their own durations", async () => {
    const layer = new Container();
    const durations: number[] = [];
    const tween = vi.fn(
      async (
        duration: number,
        update: (progress: number) => void,
        complete?: () => void,
      ) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );
    const panel = new InterludePanel(layer, async () => Texture.EMPTY, tween);

    // Channel must pre-exist: native OnCutinBegin never reaches
    // _ProcessElement, so element params ride an update command.
    await panel.run(input({ type: 0 }));
    durations.length = 0;

    await panel.run(
      input({
        alphaDurationMs: 300,
        durationMs: 1000,
        name: "bg_test",
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 0 },
        scaleDurationMs: 500,
        scaleFrom: { x: 1, y: 1 },
        scaleTo: { x: 2, y: 2 },
        slot: "m",
        type: 2,
      }),
    );
    // Element tweens keep their own durations (pos 1000 / scale 500 / alpha
    // 300); the show floor only applies to the creating command.
    expect(durations).toEqual([1000, 500, 300]);

    const state = (panel as any).channels.get(3);
    const element = state.elements.get("\u0000bg");
    expect(element.alpha).toBe(1);
    expect(element.position.x).toBe(10);
    expect(element.scale.x).toBe(2);
  });

  it("keeps a background tween running across a char command on the same channel (native DOKill is per element)", async () => {
    const layer = new Container();
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
    );

    await panel.run(input({ block: false, type: 0 }));
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_light",
        slot: "m",
        type: 2,
      }),
    );
    const state = (panel as any).channels.get(3);
    const bg = state.elements.get("\u0000bg");
    expect(bg.alpha).toBe(0);

    // A char element command on the same channel must not kill the bg fade
    // (native _ProcessElement DOKills only the target element).
    await panel.run(
      input({
        block: false,
        name: "cutin_char_4",
        slot: "m",
        switchSet: false,
        type: 1,
      }),
    );

    pending[0](1);
    expect(bg.alpha).toBe(1);
    expect(state.elements.get("m")).not.toBe(bg);
  });

  it("kills the previous tweens of the element a command targets", async () => {
    const layer = new Container();
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
    );

    await panel.run(input({ block: false, type: 0 }));
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_light",
        slot: "m",
        type: 2,
      }),
    );
    const state = (panel as any).channels.get(3);
    const bg = state.elements.get("\u0000bg");

    // Same-element update without a name: the old fade is DOKilled.
    await panel.run(
      input({
        block: false,
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 0 },
        slot: "m",
        switchSet: false,
        type: 2,
      }),
    );

    pending[0](1);
    expect(bg.alpha).toBe(0);
  });

  it("gates the blocking show wait on the native style floors (1s, fade/both 3s, animator 0)", async () => {
    for (const [style, expected] of [
      [0, 1000],
      [1, 3000],
      [2, 3000],
      [3, 0],
    ] as const) {
      const layer = new Container();
      const durations: number[] = [];
      const panel = new InterludePanel(
        layer,
        async () => Texture.EMPTY,
        async (duration, update, complete) => {
          durations.push(duration);
          update(1);
          complete?.();
        },
      );
      await panel.run(input({ style, type: 0 }));
      expect(durations).toEqual([expected]);
    }
  });

  it("applies size/offset only when the channel is created, not on updates", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );

    await panel.run(
      input({
        type: 0,
        offset: { x: 10, y: 20 },
        size: { x: 300, y: 400 },
        switchSet: false,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(state.root.position.x).toBe(640 + 10);
    expect(state.root.position.y).toBe(360 - 20);

    await panel.run(
      input({
        name: "bg_test",
        offset: { x: 999, y: 999 },
        size: { x: 5, y: 5 },
        slot: "m",
        switchSet: false,
        type: 2,
      }),
    );
    expect(state.root.position.x).toBe(640 + 10);
    expect(state.root.position.y).toBe(360 - 20);
    expect(state.size).toEqual({ x: 300, y: 400 });
  });

  it("starts the ts scale entry once at channel creation, never on updates", async () => {
    const layer = new Container();
    const durations: number[] = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (duration, update, complete) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );

    await panel.run(
      input({
        style: 0,
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
        type: 0,
      }),
    );
    // ts entry (500) + show floor (1000).
    expect(durations).toEqual([500, 1000]);

    await panel.run(
      input({
        name: "bg_test",
        slot: "m",
        style: 0,
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
        type: 2,
      }),
    );
    // Update command: only the element alpha tween (aDuration 0), no new ts
    // tween and no second show wait.
    expect(durations).toEqual([500, 1000, 0]);
  });

  it("clears by scaling from the current template ratio to tsto (tsfrom not reused)", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenHalfway,
    );

    await panel.run(
      input({
        block: false,
        style: 0,
        templateSizeDurationMs: 500,
        templateSizeFrom: { x: 0.2, y: 1 },
        templateSizeTo: { x: 1, y: 1 },
        type: 0,
      }),
    );
    const state = (panel as any).channels.get(3);
    // Half-way through the ts entry the ratio is 0.2 -> 1.0 at 50%.
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
    );
    // Clear interpolates from the current ratio (0.6), not tsfrom (9).
    expect(state.ratio.x).toBeCloseTo(0.3);
    expect(state.ratio.y).toBe(1);
  });

  it("warns when a char/uichar element command has no slot but keeps the fallback", async () => {
    const layer = new Container();
    const warnings: string[] = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
      (detail) => warnings.push(detail),
    );

    await panel.run(input({ type: 0, switchSet: false }));
    await panel.run(
      input({ name: "cutin_char_1", slot: "", type: 1, switchSet: false }),
    );
    expect(
      warnings.some((detail) => detail.includes('falling back to "m"')),
    ).toBe(true);
    const state = (panel as any).channels.get(3);
    expect(state.elements.get("m")).toBeInstanceOf(Container);

    // bg elements never use a slot natively, so no warning for type 2
    // (and its element lives on the independent \u0000bg slot).
    warnings.length = 0;
    await panel.run(
      input({ name: "bg_test", slot: "", type: 2, switchSet: false }),
    );
    expect(warnings).toEqual([]);
  });

  it("warns when a blocking clear-all aggregates several channels", async () => {
    const layer = new Container();
    const warnings: string[] = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
      (detail) => warnings.push(detail),
    );
    await panel.run(input({ channel: 3 }));
    await panel.run(input({ channel: 4 }));

    await panel.run(input({ channel: -1, clear: true }));
    expect(layer.children).toHaveLength(0);
    expect(warnings.some((detail) => detail.includes("aggregates 2"))).toBe(
      true,
    );
  });

  it("refreshes the deco label in place and toggles it with switch", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );

    await panel.run(input({ charName: "Amiya", type: 0, switchSet: false }));
    const state = (panel as any).channels.get(3);
    expect(state.label.text).toBe("Amiya");

    await panel.run(
      input({
        charName: "Kal'tsit",
        name: "bg_test",
        slot: "m",
        switchSet: false,
        type: 2,
      }),
    );
    expect(state.label.text).toBe("Kal'tsit");

    // An empty char name keeps the deco alive with empty text (native deco
    // Render just assigns the text every update).
    await panel.run(
      input({ charName: "", slot: "m", switchSet: false, type: 2 }),
    );
    expect(state.label.text).toBe("");
    expect(state.label).toBeInstanceOf(Text);

    await panel.run(input({ slot: "m", switchOn: false, type: 2 }));
    expect(state.label.visible).toBe(false);
    expect(state.elements.get("\u0000bg").visible).toBe(false);
    expect(state.root.visible).toBe(true);
  });

  it("clears every channel when channel is negative", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );
    await panel.run(input({ channel: 3 }));
    await panel.run(input({ channel: 4 }));

    await panel.run(input({ channel: -1, clear: true }));
    expect(layer.children).toHaveLength(0);
  });
});

describe("InterludePanel mask templates", () => {
  it("builds the square template with deco label, placeholder and unknown-slot fallback semantics", async () => {
    const layer = new Container();
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      tweenImmediately,
    );

    await panel.run(
      input({
        maskId: "group_interclude_square_common",
        switchSet: false,
        type: 0,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(state.template).not.toBeNull();
    expect(state.fallbackMask).toBe(false);
    // 模板默认尺寸(命令 size≈0 沿用 prefab 300x300;mask 内缩 36 → 264)。
    const mask = state.template.maskNode.children[0];
    expect(mask.width).toBeCloseTo(300 - 36, 0);
    // name 为空 → img_unknown 占位可见;char 走 deco 文字(square deco 有 text_name)。
    expect(state.template.emptyImage.visible).toBe(true);
    expect(state.label).toBeInstanceOf(Text);

    await panel.run(
      input({
        maskId: "group_interclude_square_common",
        name: "cutin_char_3",
        slot: "m",
        switchSet: false,
        type: 1,
      }),
    );
    expect(state.template.emptyImage.visible).toBe(false);
    expect(state.label.text).toBe("");
  });

  it("resizes the template from the command size (native: sizeDelta written only when |size|² > ε)", async () => {
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      tweenImmediately,
    );
    await panel.run(
      input({
        maskId: "group_interclude_vertical_common",
        size: { x: 290, y: 760 },
        switchSet: false,
        type: 0,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(state.template.maskNode.children[0].width).toBeCloseTo(290 - 36, 0);
  });

  it("dialog template consumes avatar/background updates instead of mounting elements", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = new InterludePanel(layer, loadTexture, tweenImmediately);

    await panel.run(
      input({
        maskId: "interlude_dialog_left",
        switchSet: false,
        type: 0,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(state.template.isDialog).toBe(true);

    await panel.run(
      input({
        maskId: "interlude_dialog_left",
        name: "avg_npc_999_1",
        slot: "m",
        switchSet: false,
        type: 3,
      }),
    );
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(
      input({
        maskId: "interlude_dialog_left",
        name: "avg_npc_999_1",
        slot: "m",
        switchSet: false,
        type: 3,
      }),
    );
    // ConsumesAvatarUpdates:元素不挂 root_char_*,落在模板 img_char 上。
    expect(state.elements.size).toBe(0);
    expect(state.template.dialog.charImage.texture).toBe(Texture.EMPTY);
  });

  it("direction=rin plays the channel clip and mounts the element without tweens", async () => {
    const layer = new Container();
    const durations: number[] = [];
    const tween = vi.fn(
      async (
        duration: number,
        update: (progress: number) => void,
        complete?: () => void,
      ) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );
    const panel = new InterludePanel(layer, async () => Texture.EMPTY, tween);

    // 已有 channel 上的带 direction 元素命令:native _TryPlayAnimation 接管。
    await panel.run(
      input({ maskId: "ui_cutin_mask_horizon", switchSet: false, type: 0 }),
    );
    durations.length = 0;

    await panel.run(
      input({
        direction: "rin",
        maskId: "ui_cutin_mask_horizon",
        name: "cutin_char_3",
        positionFrom: { x: 100, y: 0 },
        positionTo: { x: 200, y: 0 },
        slot: "m",
        switchSet: false,
        type: 1,
      }),
    );
    const state = (panel as any).channels.get(3);
    // 元素按 SetCutinElement 的同步段挂上(pfrom 即时姿态),但不跑元素 tween。
    const element = state.elements.get("m");
    expect(element).toBeInstanceOf(Container);
    expect(element.position.x).toBe(100);
    // 只有一次 direction 动画(≈2.083s),没有 pos/scale/alpha 的独立 tween。
    expect(durations).toHaveLength(1);
    expect(durations[0]).toBeCloseTo(2083, 0);
    // alpha 包络末端归 0(native 动画尾帧即整体淡出)。
    expect(state.root.alpha).toBeCloseTo(0, 3);
  });

  it("drops element params on a create command (native begin never reaches _ProcessElement)", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const durations: number[] = [];
    const panel = new InterludePanel(
      layer,
      loadTexture,
      async (duration, update, complete) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );

    // Create + element in one command: native OnCutinBegin only shows the
    // mask, the type/name params are dropped (only the dialog override
    // consumes them).
    await panel.run(input({ name: "cutin_char_3", slot: "m", type: 1 }));
    const state = (panel as any).channels.get(3);
    expect(state.elements.size).toBe(0);
    expect(loadTexture).not.toHaveBeenCalled();
    // Blocking create waits only the 1s show floor, no element tweens.
    expect(durations).toEqual([1000]);
  });

  it("dialog create consumes the avatar and skips the intro at duration 0 (act54side shape)", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const durations: number[] = [];
    const panel = new InterludePanel(
      layer,
      loadTexture,
      async (duration, update, complete) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );

    // Real act54side command: maskid + style 3 + type 3 + name + icharpos,
    // no `duration` key. Native _PlayDialogIntro hits NeedSkipAnimation
    // (IsZero) → SampleClipAtEnd, no tween, immediate completion.
    await panel.run(
      input({
        dialogCharPos: { x: 0, y: 0 },
        durationMs: 0,
        maskId: "interlude_dialog_left",
        name: "avg_npc_2380_1#1$1",
        offset: { x: 0, y: 150 },
        style: 3,
        switchSet: false,
        type: 3,
      }),
    );
    const state = (panel as any).channels.get(3);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(
      input({
        dialogCharPos: { x: 0, y: 0 },
        durationMs: 0,
        maskId: "interlude_dialog_left",
        name: "avg_npc_2380_1#1$1",
        offset: { x: 0, y: 150 },
        style: 3,
        switchSet: false,
        type: 3,
      }),
    );
    expect(state.elements.size).toBe(0);
    expect(state.template.dialog.charImage.texture).toBe(Texture.EMPTY);
    // No intro tween and no 1s/3s show floor on the dialog path.
    expect(durations).toEqual([]);
  });

  it("remaps the dialog intro to the command duration for style 3", async () => {
    const layer = new Container();
    const durations: number[] = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (duration, update, complete) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );

    // Native speed = ClipLength / duration: the 0.7167s clip is squeezed into
    // the command's own duration (already animateRatio-scaled).
    await panel.run(
      input({
        durationMs: 700,
        maskId: "interlude_dialog_left",
        name: "avg_npc_1#1",
        style: 3,
        switchSet: false,
        type: 3,
      }),
    );
    // Intro clip tween (700) + the blocking wait on the same length.
    expect(durations).toEqual([700, 700]);
  });

  it("applies no show floor when a dialog channel is created without style 3", async () => {
    const durations: number[] = [];
    const panel = new InterludePanel(
      new Container(),
      async () => Texture.EMPTY,
      async (duration, update, complete) => {
        durations.push(duration);
        update(1);
        complete?.();
      },
    );
    // Native dialog ShowCutinMask has no AppendInterval floor and only
    // style 3 plays the intro → blocking create completes immediately.
    await panel.run(input({ maskId: "interlude_dialog_left", type: 0 }));
    expect(durations).toEqual([]);
  });

  it("feeds dialog type 1 updates into the portrait path (native _RefreshDialogChar takes type 3 and 1)", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(Texture.EMPTY);
    const panel = new InterludePanel(layer, loadTexture, tweenImmediately);

    await panel.run(input({ maskId: "interlude_dialog_left", type: 0 }));
    const update = input({
      maskId: "interlude_dialog_left",
      name: "avg_npc_1#1",
      slot: "m",
      switchSet: false,
      type: 1,
    });
    await panel.run(update);
    const state = (panel as any).channels.get(3);
    expect(loadTexture).toHaveBeenCalledExactlyOnceWith(update);
    expect(state.template.dialog.charImage.texture).toBe(Texture.EMPTY);
    expect(state.elements.size).toBe(0);
  });

  it("direction only kills the tweens of the element the param maps to", async () => {
    const layer = new Container();
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (_duration, update) => {
        pending.push(update);
      },
    );

    await panel.run(
      input({
        block: false,
        maskId: "ui_cutin_mask_horizon",
        switchSet: false,
        type: 0,
      }),
    );
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        maskId: "ui_cutin_mask_horizon",
        name: "bg_light",
        slot: "m",
        switchSet: false,
        type: 2,
      }),
    );
    const state = (panel as any).channels.get(3);
    const bg = state.elements.get("\u0000bg");

    // Direction on the char slot (m): native _TryPlayAnimation DOKills only
    // the param-mapped element, so the background fade keeps running.
    await panel.run(
      input({
        block: false,
        direction: "rin",
        maskId: "ui_cutin_mask_horizon",
        name: "cutin_char_3",
        slot: "m",
        switchSet: false,
        type: 1,
      }),
    );

    pending[0](1);
    expect(bg.alpha).toBe(1);
  });

  it("clear invalidates element tweens (native OnCutinEnd DOKills every element)", async () => {
    const layer = new Container();
    const pending: Array<(progress: number) => void> = [];
    const panel = new InterludePanel(
      layer,
      async () => Texture.EMPTY,
      async (_duration, update, complete) => {
        if (complete) {
          update(1);
          complete();
        } else {
          pending.push(update);
        }
      },
    );

    await panel.run(input({ block: false, type: 0, switchSet: false }));
    await panel.run(
      input({
        alphaDurationMs: 2000,
        alphaFrom: 0,
        alphaTo: 1,
        block: false,
        name: "bg_light",
        slot: "m",
        switchSet: false,
        type: 2,
      }),
    );
    const state = (panel as any).channels.get(3);
    const bg = state.elements.get("\u0000bg");
    expect(bg.alpha).toBe(0);

    await panel.run(input({ block: false, clear: true }));
    expect(layer.children).toHaveLength(0);
    expect(bg.destroyed).toBe(true);
    // The orphaned fade must be dead: the session guard makes further
    // callback invocations no-ops.
    pending[0](1);
    expect(bg.alpha).toBe(0);
  });
});
