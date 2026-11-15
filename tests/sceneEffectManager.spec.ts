import { BlurFilter, type ColorMatrixFilter, Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { SceneEffectManager } from "../src/widgets/StoryPlayer/engine/rendering/SceneEffectManager";
import { buildColorEffectMatrix } from "../src/widgets/StoryPlayer/engine/rendering/core/ColorEffectMatrix";
import { LayerGraph } from "../src/widgets/StoryPlayer/engine/rendering/core/LayerGraph";

import type { TweenRunner } from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
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

function createSceneEffects(
  tween: TweenRunner["run"] = async (_duration, update, complete) => {
    update(1);
    complete?.();
  },
  layers = new LayerGraph(),
): SceneEffectManager {
  return new SceneEffectManager(layers, tween);
}

describe("SceneEffectManager", () => {
  it("tweens the amount with SmoothStep easing, not linear time", () => {
    const target = new Container();
    let step: ((progress: number) => void) | undefined;
    const effects = createSceneEffects(async (_duration, update) => {
      step = update;
    });
    effects.bindCgItem("x", target);
    effects.setFocusParam({ blur: false, color: "Colorinverse" });

    void effects.setFocusOut(
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
    const effects = createSceneEffects();
    effects.bindCgItem("x", target);

    effects.setFocusParam({ blur: false, color: "Colorinverse" });
    void effects.setFocusOut(
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
    const effects = createSceneEffects();
    effects.bindCgItem("x", target);

    effects.setFocusParam({ blur: false, color: "Grayscale" });
    void effects.setFocusOut(
      input({ durationMs: 0, id: "x", to: 0.25, type: "cgitem" }),
    );

    const color = target.filters[0] as ColorMatrixFilter;
    expect([...color.matrix]).toEqual(buildColorEffectMatrix(0.25, 0));
  });

  it("drops filters when the amount reaches zero", () => {
    const target = new Container();
    const effects = createSceneEffects();
    effects.bindCgItem("x", target);

    void effects.setFocusOut(
      input({ durationMs: 0, id: "x", to: 1, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(1);

    void effects.setFocusOut(
      input({ durationMs: 0, id: "x", to: 0, type: "cgitem" }),
    );
    expect(target.filters).toHaveLength(0);
  });

  it.each([
    ["bg", "background"],
    ["cg", "images"],
    ["char", "characters"],
    ["lbg", "gridBackground"],
  ] as const)(
    "updates the same %s focus channel across asset IDs",
    (type, layer) => {
      const layers = new LayerGraph();
      const target = layers[layer];
      let step: ((progress: number) => void) | undefined;
      let finish: (() => void) | undefined;
      const effects = createSceneEffects(
        async (_duration, update, complete) => {
          step = update;
          finish = complete;
        },
        layers,
      );
      const onComplete = vi.fn();
      const fade = effects.setFocusOut(
        input({ block: true, durationMs: 1000, id: "first", to: 1, type }),
        onComplete,
      );
      step?.(0.5);
      expect(target.filters).toHaveLength(1);

      effects.setFocusOut(input({ id: "second", type }));
      expect(fade?.endReason).toBe("force_end");
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(target.filters).toHaveLength(0);

      step?.(1);
      finish?.();
      expect(target.filters).toHaveLength(0);
      expect(onComplete).toHaveBeenCalledTimes(1);
    },
  );

  it("matches cgitem focus channels by exact ID", () => {
    const effects = createSceneEffects();
    const upper = new Container();
    const lower = new Container();
    effects.bindCgItem("A", upper);
    effects.bindCgItem("a", lower);
    effects.setFocusOut(input({ id: "A", to: 1, type: "cgitem" }));
    effects.setFocusOut(input({ id: "a", type: "cgitem" }));

    expect(upper.filters).toHaveLength(1);
    expect(lower.filters).toHaveLength(0);
  });

  it("replays a stored amount when the cgitem target binds", () => {
    const target = new Container();
    const effects = createSceneEffects();

    // `focusout` runs before the cgitem exists: the amount is stored, the
    // channel resolves to nothing (SetWhenBind semantics).
    void effects.setFocusOut(
      input({ durationMs: 0, id: "a", to: 1, type: "cgitem" }),
    );
    expect(target.filters ?? []).toHaveLength(0);

    // The cgitem registers afterwards and the stored amount replays.
    effects.bindCgItem("a", target);
    expect(target.filters[0]).toBeInstanceOf(BlurFilter);
  });

  it("keeps storing tween updates after disposal for the next bind", () => {
    const target = new Container();
    let step: ((progress: number) => void) | undefined;
    let finish: (() => void) | undefined;
    const effects = createSceneEffects(async (_duration, update, complete) => {
      step = update;
      finish = complete;
    });
    effects.bindCgItem("a", target);

    void effects.setFocusOut(
      input({ durationMs: 1000, id: "a", to: 1, type: "cgitem" }),
    );
    step?.(1);
    expect(target.filters).toHaveLength(1);

    // `BeforeItemDisposed` removes the stored amount; native `TweenAction`
    // ticks re-create it through `SetAmount`, so the tween still lands.
    effects.releaseCgItem("a", target);
    expect(target.filters).toHaveLength(0);
    finish?.();
    expect(target.filters).toHaveLength(0);
    const next = new Container();
    effects.bindCgItem("a", next);
    expect(next.filters).toHaveLength(1);

    // With no tween left, a release sticks and the next tween starts from 0
    // (`GetAmount` of a missing entry).
    effects.releaseCgItem("a", next);
    expect(next.filters).toHaveLength(0);
    effects.bindCgItem("a", next);
    effects.setFocusParam({ blur: false, color: "Grayscale" });
    void effects.setFocusOut(
      input({ durationMs: 1000, id: "a", to: 1, type: "cgitem" }),
    );
    step?.(0.5);
    expect([...(next.filters[0] as ColorMatrixFilter).matrix]).toEqual(
      buildColorEffectMatrix(0.5, 0),
    );
  });
});
