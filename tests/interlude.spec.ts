import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { InterludePanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/InterludePanel";

import type { InterludeInput } from "../src/widgets/StoryPlayer/engine/types";

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
    expect(loadTexture).toHaveBeenCalledOnce();

    await panel.run(input({ slot: "m", switchOn: false, type: 2 }));
    const state = (panel as any).channels.get(3);
    expect(state.elements.get("m").visible).toBe(false);
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
    expect(state.elements.get("m").visible).toBe(true);

    // A later command without the key must not change visibility either.
    await panel.run(
      input({ slot: "m", type: 2, switchSet: false, switchOn: false }),
    );
    expect(state.elements.get("m").visible).toBe(true);
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
    // 300) and the new channel additionally waits the 1s show floor.
    expect(durations).toEqual([1000, 500, 300, 1000]);

    const state = (panel as any).channels.get(3);
    const element = state.elements.get("m");
    expect(element.alpha).toBe(1);
    expect(element.position.x).toBe(10);
    expect(element.scale.x).toBe(2);
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

    await panel.run(
      input({ name: "cutin_char_1", slot: "", type: 1, switchSet: false }),
    );
    expect(
      warnings.some((detail) => detail.includes('falling back to "m"')),
    ).toBe(true);
    const state = (panel as any).channels.get(3);
    expect(state.elements.get("m")).toBeTruthy();

    // bg elements never use a slot natively, so no warning for type 2.
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
    expect(state.label).toBeTruthy();

    await panel.run(input({ slot: "m", switchOn: false, type: 2 }));
    expect(state.label.visible).toBe(false);
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
