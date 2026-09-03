import { describe, expect, it } from "vitest";

import {
  dotweenEaseCurve,
  linearEase,
} from "../src/widgets/StoryPlayer/engine/rendering/core/DotweenEase";

describe("dotweenEaseCurve resolution (GetEnum<Ease> port)", () => {
  it("resolves enum names case-sensitively", () => {
    expect(dotweenEaseCurve("OutQuad")(0.5)).toBeCloseTo(0.75);
    expect(dotweenEaseCurve("InOutCubic")(0.25)).toBeCloseTo(0.0625);
    expect(dotweenEaseCurve("InQuart")(0.5)).toBeCloseTo(0.0625);
    expect(dotweenEaseCurve("InOutSine")(0.5)).toBeCloseTo(0.5);
    // `GetEnum` runs with ignoreCase: false, so a lowercase name misses the
    // enum and falls back to the Ease.Linear default.
    expect(dotweenEaseCurve("outquad")(0.5)).toBe(0.5);
    expect(dotweenEaseCurve("Nonsense")(0.25)).toBe(0.25);
    expect(dotweenEaseCurve(undefined)(0.7)).toBe(0.7);
  });

  it("resolves integer strings as Ease ordinals", () => {
    // `ease="6"` is OutQuad and `ease="1"` is Linear in the story corpus.
    expect(dotweenEaseCurve("6")(0.5)).toBeCloseTo(0.75);
    expect(dotweenEaseCurve("1")(0.5)).toBe(0.5);
    expect(dotweenEaseCurve("0")(0.5)).toBe(0.5);
    // `ease="34"` is OutFlash (story_mizuki_1_1).
    expect(dotweenEaseCurve("34")(0.4)).toBeCloseTo(0.64);
  });

  it("keeps the native default branch for out-of-enum ordinals", () => {
    // EaseManager.Evaluate's switch default computes the OutQuad parabola
    // (2.7.61 GameAssembly @ 0x184140b40), not Linear.
    expect(dotweenEaseCurve("38")(0.5)).toBeCloseTo(0.75);
    expect(dotweenEaseCurve("99")(0.25)).toBeCloseTo(0.4375);
    // Negative integer strings parse as (out-of-table) ordinals and land on
    // the same default branch rather than the Linear name fallback.
    expect(dotweenEaseCurve("-3")(0.5)).toBeCloseTo(0.75);
  });

  it("keeps curve endpoints anchored at 0 and 1", () => {
    for (const ease of [
      "Linear",
      "OutQuad",
      "InOutCubic",
      "OutQuart",
      "InOutQuint",
      "OutExpo",
      "InOutCirc",
      "OutBack",
      "OutBounce",
      "InFlash",
      "OutFlash",
      "InOutFlash",
    ]) {
      const curve = dotweenEaseCurve(ease);
      expect(curve(0)).toBeCloseTo(0);
      expect(curve(1)).toBeCloseTo(1);
    }
  });
});

describe("Flash ease curves (Flash class port, default amplitude/period)", () => {
  it("collapses each wave to the plain quadratic with DOTween's -1/0 defaults", () => {
    // The Flash implementation applies no sentinel guards to
    // overshootOrAmplitude/period, so the library-wide SetEase(Ease)
    // defaults (-1 / 0) make WeightedEase return the raw wave value.
    expect(dotweenEaseCurve("OutFlash")(0.4)).toBeCloseTo(2 * 0.4 - 0.4 ** 2);
    expect(dotweenEaseCurve("InFlash")(0.4)).toBeCloseTo(0.4 ** 2);
    expect(dotweenEaseCurve("Flash")(0.4)).toBeCloseTo(0.4);
    expect(dotweenEaseCurve("OutFlash")(0.75)).toBeCloseTo(2 * 0.75 - 0.5625);
  });
});

describe("linearEase", () => {
  it("maps progress unchanged", () => {
    expect(linearEase(0.5)).toBe(0.5);
  });
});
