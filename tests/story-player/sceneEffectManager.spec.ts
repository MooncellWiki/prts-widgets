import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { SceneEffectManager } from "../../src/widgets/StoryPlayer/engine/rendering/SceneEffectManager";
import { LayerGraph } from "../../src/widgets/StoryPlayer/engine/rendering/core/LayerGraph";

import { focusAmount } from "./helpers/rendererFixtures";

import type { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import type { FocusOutInput } from "../../src/widgets/StoryPlayer/engine/types";

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

const fixedBindings = {
  bg: (effects, target) => effects.setImageFocusTargets("bg", target),
  cg: (effects, target) => effects.setImageFocusTargets("cg", target),
  char: (effects, target) => effects.setImageFocusTargets("m", target),
  lbg: (effects, target) => effects.setLargeBackgroundFocusTargets([target]),
} satisfies Record<
  string,
  (effects: SceneEffectManager, target: Container) => void
>;

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
    expect(focusAmount(effects, target)).toBe(0.156_25);

    step?.(0.5);
    expect(focusAmount(effects, target)).toBe(0.5);
  });

  it("keeps the amount and reuses blur once the material is initialized", () => {
    const target = new Container();
    const effects = createSceneEffects();
    effects.bindCgItem("x", target);

    effects.setFocusParam({ blur: false, color: "Colorinverse" });
    effects.setFocusOut(input({ id: "x", to: 0.5, type: "cgitem" }));
    expect(effects.focusFrame?.config).toEqual({
      blur: false,
      color: "Colorinverse",
    });
    expect(focusAmount(effects, target)).toBe(0.5);
    effects.setFocusParam({ blur: false, color: "None" });
    expect(effects.focusFrame).toBeUndefined();
    effects.setFocusParam({ blur: true, color: "Grayscale" });
    expect(effects.focusFrame?.config).toEqual({
      blur: true,
      color: "Grayscale",
    });
    effects.setFocusParam({ blur: false, color: "None" });
    expect(effects.focusFrame?.config).toEqual({ blur: true, color: "None" });
    expect(focusAmount(effects, target)).toBe(0.5);

    effects.setFocusParam({ blur: false, color: "Grayscale" });
    expect(effects.focusFrame?.config).toEqual({
      blur: false,
      color: "Grayscale",
    });

    effects.reset();
    effects.setFocusParam({ blur: false, color: "None" });
    effects.setFocusOut(input({ id: "x", to: 1, type: "cgitem" }));
    expect(effects.focusFrame).toBeUndefined();
  });

  it("initializes blur when a tween is queued before its first update", () => {
    const effects = createSceneEffects(async () => {});
    effects.setFocusOut(input({ durationMs: 1000, to: 1 }));
    expect(effects.focusFrame?.config).toEqual({ blur: true, color: "None" });

    effects.setFocusParam({ blur: false, color: "None" });
    effects.setFocusOut(input({ to: 1 }));
    expect(effects.focusFrame?.config).toEqual({ blur: true, color: "None" });
  });

  it("skips the camera pass when the amount reaches zero", () => {
    const target = new Container();
    const effects = createSceneEffects();
    effects.bindCgItem("x", target);

    void effects.setFocusOut(
      input({ durationMs: 0, id: "x", to: 1, type: "cgitem" }),
    );
    expect(focusAmount(effects, target)).toBe(1);

    void effects.setFocusOut(
      input({ durationMs: 0, id: "x", to: 0, type: "cgitem" }),
    );
    expect(effects.focusFrame).toBeUndefined();
  });

  it.each(Object.entries(fixedBindings))(
    "updates the same %s focus channel across asset IDs",
    (type, bind) => {
      const target = new Container();
      let step: ((progress: number) => void) | undefined;
      let finish: (() => void) | undefined;
      const effects = createSceneEffects(
        async (_duration, update, complete) => {
          step = update;
          finish = complete;
        },
      );
      bind(effects, target);
      const onComplete = vi.fn();
      const fade = effects.setFocusOut(
        input({ block: true, durationMs: 1000, id: "first", to: 1, type }),
        onComplete,
      );
      step?.(0.5);
      expect(focusAmount(effects, target)).toBe(0.5);

      effects.setFocusOut(input({ id: "second", type }));
      expect(fade?.endReason).toBe("force_end");
      expect(onComplete).toHaveBeenCalledTimes(1);
      expect(effects.focusFrame).toBeUndefined();

      step?.(1);
      finish?.();
      expect(effects.focusFrame).toBeUndefined();
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

    expect(focusAmount(effects, upper)).toBe(1);
    expect(focusAmount(effects, lower)).toBe(0);
  });

  it("continues a layer tween after one of its PostDisplay channels is replaced", () => {
    const layers = new LayerGraph();
    const first = new Container();
    const second = new Container();
    let step: ((progress: number) => void) | undefined;
    let finish: (() => void) | undefined;
    const effects = createSceneEffects(async (_duration, update, complete) => {
      step = update;
      finish = complete;
    }, layers);
    effects.setLargeBackgroundFocusTargets([first, second]);
    effects.setFocusParam({ blur: false, color: "Colorinverse" });

    const onComplete = vi.fn();
    const fade = effects.setFocusOut(
      input({ block: true, durationMs: 1000, to: 1, type: "lbg" }),
      onComplete,
    );
    step?.(0.25);
    effects.setFocusOut(input({ id: "ck_lbg_1", to: 0.25, type: "cgitem" }));
    expect(fade?.endReason).toBeUndefined();
    expect(onComplete).not.toHaveBeenCalled();

    step?.(0.5);
    expect(focusAmount(effects, first)).toBe(0.25);
    expect(focusAmount(effects, second)).toBe(0.5);

    finish?.();
    expect(fade?.endReason).toBe("complete");
    expect(onComplete).toHaveBeenCalledExactlyOnceWith();
    expect(focusAmount(effects, first)).toBe(0.25);
    expect(focusAmount(effects, second)).toBe(1);
  });

  it("replays a stored amount when the cgitem target binds", () => {
    const target = new Container();
    const effects = createSceneEffects();

    // `focusout` runs before the cgitem exists: the amount is stored, the
    // channel resolves to nothing (SetWhenBind semantics).
    void effects.setFocusOut(
      input({ durationMs: 0, id: "a", to: 1, type: "cgitem" }),
    );
    expect([...effects.focusFrame!.targets]).toEqual([]);

    // The cgitem registers afterwards and the stored amount replays.
    effects.bindCgItem("a", target);
    expect([...effects.focusFrame!.targets]).toEqual([
      { amount: 1, soft: true, target },
    ]);
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
    expect(focusAmount(effects, target)).toBe(1);

    // `BeforeItemDisposed` removes the stored amount; native `TweenAction`
    // ticks re-create it through `SetAmount`, so the tween still lands.
    effects.releaseCgItem("a", target);
    expect(focusAmount(effects, target)).toBe(0);
    finish?.();
    expect(focusAmount(effects, target)).toBe(0);
    const next = new Container();
    effects.bindCgItem("a", next);
    expect(focusAmount(effects, next)).toBe(1);

    // With no tween left, a release sticks and the next tween starts from 0
    // (`GetAmount` of a missing entry).
    effects.releaseCgItem("a", next);
    expect(focusAmount(effects, next)).toBe(0);
    effects.bindCgItem("a", next);
    effects.setFocusParam({ blur: false, color: "Grayscale" });
    void effects.setFocusOut(
      input({ durationMs: 1000, id: "a", to: 1, type: "cgitem" }),
    );
    step?.(0.5);
    expect(focusAmount(effects, next)).toBe(0.5);
  });
});
