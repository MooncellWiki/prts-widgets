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
    // `ease="34"` is OutFlash; the corpus spells that one by name
    // (story_mizuki_1_1), but the ordinal has to resolve the same way.
    expect(dotweenEaseCurve("34")(0.4)).toBeCloseTo(0.64);
    expect(dotweenEaseCurve("OutFlash")(0.4)).toBeCloseTo(0.64);
  });

  it("keeps the native default branch for out-of-enum ordinals", () => {
    // EaseManager.Evaluate gates its switch on `(uint)(easeType - 1) > 0x24`;
    // everything else computes the OutQuad parabola (@ 0x1841f1170), not
    // Linear.
    expect(dotweenEaseCurve("38")(0.5)).toBeCloseTo(0.75);
    expect(dotweenEaseCurve("99")(0.25)).toBeCloseTo(0.4375);
    // Negative integer strings parse as (out-of-table) ordinals and land on
    // the same default branch rather than the Linear name fallback.
    expect(dotweenEaseCurve("-3")(0.5)).toBeCloseTo(0.75);
    // Ordinal 0 is Ease.Unset. `SetEase` assigns it verbatim, so it misses the
    // switch too and takes that same OutQuad default branch.
    expect(dotweenEaseCurve("0")(0.5)).toBeCloseTo(0.75);
    expect(dotweenEaseCurve("0")(0.25)).toBeCloseTo(0.4375);
    // Int32.Parse overflows before Enum.Parse can look at the value, and
    // GetEnum swallows that into the Ease.Linear default.
    expect(dotweenEaseCurve("99999999999")(0.5)).toBe(0.5);
  });

  it("ignores inherited Object.prototype keys", () => {
    // The curve table is an object literal; a bare index would hand back
    // `Object.prototype.toString` & co. and blow up mid-tween.
    for (const name of [
      "toString",
      "valueOf",
      "constructor",
      "hasOwnProperty",
      "__proto__",
    ]) {
      expect(dotweenEaseCurve(name)(0.25)).toBe(0.25);
    }
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
  it("collapses each wave to the plain quadratic with SetEase's 1/0 defaults", () => {
    // SetEase truncates overshootOrAmplitude to an int for the flash eases, so
    // the 1.70158 default arrives as 1 -- a single wave -- and WeightedEase
    // short-circuits on period == 0 and returns min(1, wave).
    expect(dotweenEaseCurve("OutFlash")(0.4)).toBeCloseTo(2 * 0.4 - 0.4 ** 2);
    expect(dotweenEaseCurve("InFlash")(0.4)).toBeCloseTo(0.4 ** 2);
    expect(dotweenEaseCurve("Flash")(0.4)).toBeCloseTo(0.4);
    expect(dotweenEaseCurve("OutFlash")(0.75)).toBeCloseTo(2 * 0.75 - 0.5625);
  });
});

describe("Elastic ease curves (library overshoot/period defaults)", () => {
  it("keeps native's 1.70158 amplitude instead of the easings.net amplitude 1", () => {
    // `SetEase(Ease)` never resets easeOvershootOrAmplitude, so Evaluate's
    // elastic branches see 1.70158 (>= 1): the amplitude stays 1.70158 and the
    // phase shift is period / 2pi * asin(1 / amplitude), not period / 4.
    // Reference values computed from EaseManager.Evaluate @ 0x1841f1170 with
    // duration = 1, overshootOrAmplitude = 1.70158, period = 0.
    expect(dotweenEaseCurve("OutElastic")(0.1)).toBeCloseTo(1.846_14, 4);
    expect(dotweenEaseCurve("OutElastic")(0.25)).toBeCloseTo(0.700_84, 4);
    expect(dotweenEaseCurve("OutElastic")(0.4)).toBeCloseTo(1.105_77, 4);
    expect(dotweenEaseCurve("InElastic")(0.5)).toBeCloseTo(-0.052_88, 4);
    // The easings.net form has the wrong sign here (-0.25).
    expect(dotweenEaseCurve("InElastic")(0.9)).toBeCloseTo(0.346_14, 4);
    expect(dotweenEaseCurve("InOutElastic")(0.4)).toBeCloseTo(-0.058_6, 4);
    expect(dotweenEaseCurve("InOutElastic")(0.6)).toBeCloseTo(1.176_32, 4);
  });

  it("anchors the elastic endpoints native short-circuits", () => {
    for (const name of ["InElastic", "OutElastic", "InOutElastic"]) {
      expect(dotweenEaseCurve(name)(0)).toBe(0);
      expect(dotweenEaseCurve(name)(1)).toBe(1);
    }
    expect(dotweenEaseCurve("InOutElastic")(0.5)).toBeCloseTo(0.5, 5);
  });
});

describe("linearEase", () => {
  it("maps progress unchanged", () => {
    expect(linearEase(0.5)).toBe(0.5);
  });
});
