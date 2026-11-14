import { BlurFilter, type ColorMatrixFilter, Container } from "pixi.js";
import { describe, expect, it } from "vitest";

import { buildColorEffectMatrix } from "../src/widgets/StoryPlayer/engine/rendering/core/ColorEffectMatrix";
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

describe("FocusEffectPanel", () => {
  it("tweens the amount with SmoothStep easing, not linear time", () => {
    const target = new Container();
    let step: ((progress: number) => void) | undefined;
    const panel = new FocusEffectPanel(
      () => [],
      async (_duration, update) => {
        step = update;
      },
    );
    panel.bindCgItem("x", target);
    panel.setParam({ blur: false, color: "Colorinverse" });

    void panel.setFocus(
      input({ durationMs: 1000, id: "x", to: 1, type: "cgitem" }),
    );

    // `_SetEffectAmount` uses TweenUtils.SmoothStep: at raw 0.25 the eased
    // value is 0.25^2 * (3 - 2*0.25) = 0.15625, not 0.25.
    step?.(0.25);
    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual(buildColorEffectMatrix(0, 0.156_25));

    step?.(0.5);
    expect([...(target.filters[0] as ColorMatrixFilter).matrix]).toEqual(
      buildColorEffectMatrix(0, 0.5),
    );
  });

  it("grades the inverse matrix by the amount instead of always fully inverting", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );
    panel.bindCgItem("x", target);

    panel.setParam({ blur: false, color: "Colorinverse" });
    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0.5, type: "cgitem" }),
    );

    // Native keeps `_Inverse` binary and blends the processed target back
    // through mat_blit_ghost; folding the amount into the matrix models that
    // same lerp, so a half-focused target is half inverted.
    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual(buildColorEffectMatrix(0, 0.5));
  });

  it("grades the grayscale matrix by the amount", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );
    panel.bindCgItem("x", target);

    panel.setParam({ blur: false, color: "Grayscale" });
    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0.25, type: "cgitem" }),
    );

    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual(buildColorEffectMatrix(0.25, 0));
  });

  it("drops filters when the amount reaches zero", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [],
      async (_duration, update, complete) => {
        update(1);
        complete?.();
      },
    );
    panel.bindCgItem("x", target);

    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 1, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(1);

    void panel.setFocus(
      input({ durationMs: 0, id: "x", to: 0, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(0);
  });

  it("replays a stored amount when the cgitem target binds", () => {
    const target = new Container();
    const panel = new FocusEffectPanel(
      () => [],
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
    panel.bindCgItem("a", target);
    expect(target.filters[0]).toBeInstanceOf(BlurFilter);
  });

  it("keeps storing tween updates after disposal for the next bind", () => {
    const target = new Container();
    let step: ((progress: number) => void) | undefined;
    let finish: (() => void) | undefined;
    const panel = new FocusEffectPanel(
      () => [],
      async (_duration, update, complete) => {
        step = update;
        finish = complete;
      },
    );
    panel.bindCgItem("a", target);

    void panel.setFocus(
      input({ durationMs: 1000, id: "a", to: 1, type: "cgitem" }),
    );
    step?.(1);
    expect(target.filters).toHaveLength(1);

    // `BeforeItemDisposed` removes the stored amount; native `TweenAction`
    // ticks re-create it through `SetAmount`, so the tween still lands.
    panel.releaseCgItem("a", target);
    expect(target.filters).toHaveLength(0);
    finish?.();
    expect(target.filters).toHaveLength(0);
    const next = new Container();
    panel.bindCgItem("a", next);
    expect(next.filters).toHaveLength(1);

    // With no tween left, a release sticks and the next tween starts from 0
    // (`GetAmount` of a missing entry).
    panel.releaseCgItem("a", next);
    expect(next.filters).toHaveLength(0);
    panel.bindCgItem("a", next);
    panel.setParam({ blur: false, color: "Grayscale" });
    void panel.setFocus(
      input({ durationMs: 1000, id: "a", to: 1, type: "cgitem" }),
    );
    step?.(0.5);
    expect([...(next.filters[0] as ColorMatrixFilter).matrix]).toEqual(
      buildColorEffectMatrix(0.5, 0),
    );
  });
});
