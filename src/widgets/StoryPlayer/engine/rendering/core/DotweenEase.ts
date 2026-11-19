/**
 * Native provenance: DOTween 1.2.760 compiled into 2.7.71 (build 2771)
 * `GameAssembly.dll` — `DG.Tweening.Core.Easing.EaseManager.Evaluate` @
 * 0x1841f1170 (Robert Penner equations), `Bounce` @ 0x1841f0180-0x1841f03a0
 * and `Flash` @ 0x1841f39e0-0x1841f3ed0. `Torappu.AVG` executors select one of
 * these via `SetEase` after `DotNetExtensionMethods.GetEnum<Ease>(param,
 * "ease", Ease.Linear, ignoreCase: false)`.
 *
 * The overshoot/period the curves receive are the library defaults, because
 * `TweenSettingsExtensions.SetEase<T>(t, Ease)` @ 0x1848859d0 only assigns
 * `easeType` (plus an int truncation for the flash eases) and never touches
 * them: `DOTween..cctor` @ 0x1841bb710 sets `defaultEaseOvershootOrAmplitude =
 * 1.70158` / `defaultEasePeriod = 0`, and `Tweener.Setup` @ 0x184896a60 copies
 * both into every tween. Every constant below is folded from those two values.
 *
 * Curves take normalized time in [0, 1]; Back/Elastic curves may legitimately
 * overshoot outside that range.
 */

import { tryParseEnum } from "../../commandParams";

export type EaseCurve = (time: number) => number;

export const linearEase: EaseCurve = (time) => time;

function outBounceEase(time: number): number {
  const d1 = 2.75;
  if (time < 1 / d1) {
    return 7.5625 * time * time;
  }
  if (time < 2 / d1) {
    const t = time - 1.5 / d1;
    return 7.5625 * t * t + 0.75;
  }
  if (time < 2.5 / d1) {
    const t = time - 2.25 / d1;
    return 7.5625 * t * t + 0.9375;
  }
  const t = time - 2.625 / d1;
  return 7.5625 * t * t + 0.984_375;
}

/** `DOTween.defaultEaseOvershootOrAmplitude` (cctor @ 0x1841bb710). */
const defaultOvershootOrAmplitude = 1.701_58;

const easeBackC1 = defaultOvershootOrAmplitude;
const easeBackC2 = easeBackC1 * 1.525;
const easeBackC3 = easeBackC1 + 1;

const twoPi = 2 * Math.PI;
/** `period == 0` sentinel in `Evaluate`: `duration * 0.3` (normalized to 1). */
const elasticPeriod = 0.3;
/** The In/Out variant uses `duration * (0.3 * 1.5)` instead. */
const elasticInOutPeriod = 0.45;

/**
 * `Evaluate`'s elastic branches only clamp the amplitude to 1 and shift by
 * `period / 4` when `overshootOrAmplitude < 1`. The library default is
 * 1.70158, so they take the other branch: the amplitude stays 1.70158 and the
 * phase shift is `period / 2pi * asin(1 / amplitude)`. (This is why the
 * textbook `2pi/3` / `2pi/4.5` easings.net constants do not apply here.)
 */
function elasticShift(period: number): number {
  return (period / twoPi) * Math.asin(1 / defaultOvershootOrAmplitude);
}

const elasticS = elasticShift(elasticPeriod);
const elasticInOutS = elasticShift(elasticInOutPeriod);

function inOutQuadEase(time: number): number {
  return time < 0.5 ? 2 * time * time : 1 - (-2 * time + 2) ** 2 / 2;
}

/**
 * Port of `DG.Tweening.Core.Easing.Flash` (`Ease` @ 0x1841f3db0, `EaseIn` @
 * 0x1841f3b50, `EaseOut` @ 0x1841f3c70, `EaseInOut` @ 0x1841f39e0,
 * `WeightedEase` @ 0x1841f3ed0).
 *
 * `SetEase<T>(t, Ease)` @ 0x1848859d0 runs `easeOvershootOrAmplitude =
 * (int)easeOvershootOrAmplitude` for the flash eases, so the 1.70158 library
 * default arrives as an amplitude of exactly 1 while `easePeriod` keeps its 0
 * default. Amplitude 1 makes `Flash.Ease` compute a single wave spanning the
 * whole duration (`stepIndex = 1`, `dir = 1`, wave progress = `time`), and
 * `WeightedEase` short-circuits its weighting on `period == 0` and returns
 * `Math.Min(1, res)`. So every flash ease is just its wave equation clamped at
 * 1 -- the multi-wave machinery is unreachable with the library defaults.
 */
function flashEase(wave: EaseCurve): EaseCurve {
  return (time) => Math.min(1, wave(time));
}

/** DG.Tweening.Ease in the 2791 metadata. */
enum Ease {
  Unset = 0,
  Linear = 1,
  InSine = 2,
  OutSine = 3,
  InOutSine = 4,
  InQuad = 5,
  OutQuad = 6,
  InOutQuad = 7,
  InCubic = 8,
  OutCubic = 9,
  InOutCubic = 10,
  InQuart = 11,
  OutQuart = 12,
  InOutQuart = 13,
  InQuint = 14,
  OutQuint = 15,
  InOutQuint = 16,
  InExpo = 17,
  OutExpo = 18,
  InOutExpo = 19,
  InCirc = 20,
  OutCirc = 21,
  InOutCirc = 22,
  InElastic = 23,
  OutElastic = 24,
  InOutElastic = 25,
  InBack = 26,
  OutBack = 27,
  InOutBack = 28,
  InBounce = 29,
  OutBounce = 30,
  InOutBounce = 31,
  Flash = 32,
  InFlash = 33,
  OutFlash = 34,
  InOutFlash = 35,
  INTERNAL_Zero = 36,
  INTERNAL_Custom = 37,
}

const outQuadEase: EaseCurve = (time) => 1 - (1 - time) * (1 - time);

const dotweenEaseCurves: Readonly<Partial<Record<number, EaseCurve>>> = {
  [Ease.Unset]: outQuadEase,
  [Ease.INTERNAL_Zero]: () => 1,
  // The story script cannot supply a custom ease delegate.
  [Ease.INTERNAL_Custom]: linearEase,
  [Ease.Flash]: flashEase(linearEase),
  [Ease.InBack]: (time) => easeBackC3 * time ** 3 - easeBackC1 * time ** 2,
  [Ease.InBounce]: (time) => 1 - outBounceEase(1 - time),
  [Ease.InCirc]: (time) => 1 - Math.sqrt(1 - time ** 2),
  [Ease.InCubic]: (time) => time ** 3,
  [Ease.InElastic]: (time) =>
    time === 0 || time === 1
      ? time
      : -(
          defaultOvershootOrAmplitude *
          2 ** (10 * (time - 1)) *
          Math.sin(((time - 1 - elasticS) * twoPi) / elasticPeriod)
        ),
  [Ease.InExpo]: (time) => (time === 0 ? 0 : 2 ** (10 * time - 10)),
  [Ease.InFlash]: flashEase((time) => time * time),
  [Ease.InOutBack]: (time) =>
    time < 0.5
      ? ((2 * time) ** 2 * ((easeBackC2 + 1) * 2 * time - easeBackC2)) / 2
      : ((2 * time - 2) ** 2 *
          ((easeBackC2 + 1) * (2 * time - 2) + easeBackC2) +
          2) /
        2,
  [Ease.InOutBounce]: (time) =>
    time < 0.5
      ? (1 - outBounceEase(1 - 2 * time)) / 2
      : (1 + outBounceEase(2 * time - 1)) / 2,
  [Ease.InOutCirc]: (time) =>
    time < 0.5
      ? (1 - Math.sqrt(1 - (2 * time) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * time + 2) ** 2) + 1) / 2,
  [Ease.InOutCubic]: (time) =>
    time < 0.5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2,
  [Ease.InOutElastic]: (time) => {
    if (time === 0 || time === 1) return time;
    // `Evaluate` doubles the time first, so the wave argument is `2 * time - 1`.
    const doubled = 2 * time - 1;
    const wave =
      defaultOvershootOrAmplitude *
      Math.sin(((doubled - elasticInOutS) * twoPi) / elasticInOutPeriod);
    if (time < 0.5) {
      return -0.5 * (2 ** (10 * doubled) * wave);
    }
    return 2 ** (-10 * doubled) * wave * 0.5 + 1;
  },
  [Ease.InOutExpo]: (time) => {
    if (time === 0) return 0;
    if (time === 1) return 1;
    if (time < 0.5) return 2 ** (20 * time - 10) / 2;
    return (2 - 2 ** (-20 * time + 10)) / 2;
  },
  [Ease.InOutFlash]: flashEase(inOutQuadEase),
  [Ease.InOutQuad]: inOutQuadEase,
  [Ease.InOutQuart]: (time) =>
    time < 0.5 ? 8 * time ** 4 : 1 - (-2 * time + 2) ** 4 / 2,
  [Ease.InOutQuint]: (time) =>
    time < 0.5 ? 16 * time ** 5 : 1 - (-2 * time + 2) ** 5 / 2,
  [Ease.InOutSine]: (time) => -(Math.cos(Math.PI * time) - 1) / 2,
  [Ease.InQuad]: (time) => time * time,
  [Ease.InQuart]: (time) => time ** 4,
  [Ease.InQuint]: (time) => time ** 5,
  [Ease.InSine]: (time) => 1 - Math.cos((time * Math.PI) / 2),
  [Ease.Linear]: linearEase,
  [Ease.OutBack]: (time) =>
    1 + easeBackC3 * (time - 1) ** 3 + easeBackC1 * (time - 1) ** 2,
  [Ease.OutBounce]: outBounceEase,
  [Ease.OutCirc]: (time) => Math.sqrt(1 - (time - 1) ** 2),
  [Ease.OutCubic]: (time) => 1 - (1 - time) ** 3,
  [Ease.OutElastic]: (time) =>
    time === 0 || time === 1
      ? time
      : defaultOvershootOrAmplitude *
          2 ** (-10 * time) *
          Math.sin(((time - elasticS) * twoPi) / elasticPeriod) +
        1,
  [Ease.OutExpo]: (time) => (time === 1 ? 1 : 1 - 2 ** (-10 * time)),
  [Ease.OutFlash]: flashEase((time) => -time * (time - 2)),
  [Ease.OutQuad]: outQuadEase,
  [Ease.OutQuart]: (time) => 1 - (1 - time) ** 4,
  [Ease.OutQuint]: (time) => 1 - (1 - time) ** 5,
  [Ease.OutSine]: (time) => Math.sin((time * Math.PI) / 2),
} satisfies Record<Ease, EaseCurve>;

/**
 * `DOTween.defaultEaseType` — the curve a tween runs on when its creator never
 * calls `SetEase`. `DOTween..cctor` assigns the literal `6` (2.7.71 @
 * 0x1841bb710, re-verified on 2.7.81 @ 0x184250040), which is `Ease.OutQuad`
 * in the Ease enum. `DOTween.Init(DOTweenSettings, ...)`
 * (2.7.81 @ 0x18424c480, reached via InitCheck/AutoInit) then copies the
 * `Resources/DOTweenSettings` asset's `defaultEaseType` over it; the 2.7.81
 * asset serializes `6` as well, so the effective default stays OutQuad. Distinct from `dotweenEaseCurve`'s
 * `undefined` fallback, which models the `Ease.Linear` default that
 * `GetEnum<Ease>(param, "ease", Ease.Linear, ...)` hands to executors that
 * read an `ease` story parameter.
 */
export const dotweenDefaultEase: EaseCurve = outQuadEase;

/** GetEnum<Ease> supplies Linear on failure. EaseManager.Evaluate runs OutQuad for unnamed values. */
export function dotweenEaseCurve(ease: string | undefined): EaseCurve {
  const ordinal = tryParseEnum(ease, Ease) ?? Ease.Linear;
  return dotweenEaseCurves[ordinal] ?? dotweenDefaultEase;
}
