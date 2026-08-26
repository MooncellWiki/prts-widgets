import { BlurFilter, ColorMatrixFilter, Container } from "pixi.js";
import { describe, expect, it } from "vitest";

import { FocusEffectPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/FocusEffectPanel";

import type { FocusOutInput } from "../src/widgets/StoryPlayer/engine/types";

function input(overrides: Partial<FocusOutInput> = {}): FocusOutInput {
  return {
    block: false,
    durationMs: 0,
    id: "",
    to: 0,
    type: "bg",
    ...overrides,
  };
}

function fullInverseMatrix(): number[] {
  return [
    -1,
    0,
    0,
    0,
    1, //
    0,
    -1,
    0,
    0,
    1, //
    0,
    0,
    -1,
    0,
    1, //
    0,
    0,
    0,
    1,
    0,
  ];
}

describe("FocusEffectPanel", () => {
  it("tweens the amount with SmoothStep easing, not linear time", () => {
    const target = new Container();
    let step: ((progress: number) => void) | undefined;
    const panel = new FocusEffectPanel(
      () => [target],
      async (_duration, update) => {
        step = update;
      },
    );
    panel.setParam({ blur: false, color: "Colorinverse" });

    void panel.setFocus(
      input({ durationMs: 1000, id: "x", to: 1, type: "cgitem" }),
    );

    // `_SetEffectAmount` uses TweenUtils.SmoothStep: at raw 0.25 the eased
    // value is 0.25^2 * (3 - 2*0.25) = 0.15625, not 0.25.
    step?.(0.25);
    const color = target.filters[0] as ColorMatrixFilter;
    expect(color.alpha).toBeCloseTo(0.156_25, 10);

    step?.(0.5);
    expect((target.filters[0] as ColorMatrixFilter).alpha).toBe(0.5);
  });

  it("mixes a full-strength inverse by amount instead of always inverting", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [target],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );

    panel.setParam({ blur: false, color: "Colorinverse" });
    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0.5, type: "cgitem" }),
    );

    // Native composites "clean x fully-processed" by the amount: at 0.5 the
    // inverse is half mixed, the matrix itself stays full strength.
    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual(fullInverseMatrix());
    expect(color.alpha).toBe(0.5);
  });

  it("keeps grayscale full strength and blends it by amount", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [target],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );

    panel.setParam({ blur: false, color: "Grayscale" });
    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0.25, type: "cgitem" }),
    );

    const reference = new ColorMatrixFilter();
    reference.grayscale(1, false);
    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual([...reference.matrix]);
    expect(color.alpha).toBe(0.25);
  });

  it("drops filters when the amount reaches zero", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [target],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );

    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 1, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(1);

    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(0);
  });

  it("replays a stored amount when refresh re-resolves targets", () => {
    const target = new Container();
    let visible = false;
    const panel = new FocusEffectPanel(
      (type, id) =>
        type === "cgitem" && id === "a" && visible ? [target] : [],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );

    // `focusout` runs before the cgitem exists: the amount is stored, the
    // channel resolves to nothing (SetWhenBind semantics).
    void panel.setFocus(
      input({ durationMs: 0, id: "a", to: 1, type: "cgitem" }),
    );
    expect(target.filters ?? []).toHaveLength(0);

    // The cgitem registers afterwards and the stored amount replays.
    visible = true;
    panel.refresh();
    expect(target.filters[0]).toBeInstanceOf(BlurFilter);
  });
});
