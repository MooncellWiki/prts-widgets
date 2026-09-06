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

const dotweenEaseCurves = {
  Flash: flashEase(linearEase),
  InBack: (time) => easeBackC3 * time ** 3 - easeBackC1 * time ** 2,
  InBounce: (time) => 1 - outBounceEase(1 - time),
  InCirc: (time) => 1 - Math.sqrt(1 - time ** 2),
  InCubic: (time) => time ** 3,
  InElastic: (time) =>
    time === 0 || time === 1
      ? time
      : -(
          defaultOvershootOrAmplitude *
          2 ** (10 * (time - 1)) *
          Math.sin(((time - 1 - elasticS) * twoPi) / elasticPeriod)
        ),
  InExpo: (time) => (time === 0 ? 0 : 2 ** (10 * time - 10)),
  InFlash: flashEase((time) => time * time),
  InOutBack: (time) =>
    time < 0.5
      ? ((2 * time) ** 2 * ((easeBackC2 + 1) * 2 * time - easeBackC2)) / 2
      : ((2 * time - 2) ** 2 *
          ((easeBackC2 + 1) * (2 * time - 2) + easeBackC2) +
          2) /
        2,
  InOutBounce: (time) =>
    time < 0.5
      ? (1 - outBounceEase(1 - 2 * time)) / 2
      : (1 + outBounceEase(2 * time - 1)) / 2,
  InOutCirc: (time) =>
    time < 0.5
      ? (1 - Math.sqrt(1 - (2 * time) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * time + 2) ** 2) + 1) / 2,
  InOutCubic: (time) =>
    time < 0.5 ? 4 * time ** 3 : 1 - (-2 * time + 2) ** 3 / 2,
  InOutElastic: (time) => {
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
  InOutExpo: (time) => {
    if (time === 0) return 0;
    if (time === 1) return 1;
    if (time < 0.5) return 2 ** (20 * time - 10) / 2;
    return (2 - 2 ** (-20 * time + 10)) / 2;
  },
  InOutFlash: flashEase(inOutQuadEase),
  InOutQuad: inOutQuadEase,
  InOutQuart: (time) =>
    time < 0.5 ? 8 * time ** 4 : 1 - (-2 * time + 2) ** 4 / 2,
  InOutQuint: (time) =>
    time < 0.5 ? 16 * time ** 5 : 1 - (-2 * time + 2) ** 5 / 2,
  InOutSine: (time) => -(Math.cos(Math.PI * time) - 1) / 2,
  InQuad: (time) => time * time,
  InQuart: (time) => time ** 4,
  InQuint: (time) => time ** 5,
  InSine: (time) => 1 - Math.cos((time * Math.PI) / 2),
  Linear: linearEase,
  OutBack: (time) =>
    1 + easeBackC3 * (time - 1) ** 3 + easeBackC1 * (time - 1) ** 2,
  OutBounce: outBounceEase,
  OutCirc: (time) => Math.sqrt(1 - (time - 1) ** 2),
  OutCubic: (time) => 1 - (1 - time) ** 3,
  OutElastic: (time) =>
    time === 0 || time === 1
      ? time
      : defaultOvershootOrAmplitude *
          2 ** (-10 * time) *
          Math.sin(((time - elasticS) * twoPi) / elasticPeriod) +
        1,
  OutExpo: (time) => (time === 1 ? 1 : 1 - 2 ** (-10 * time)),
  OutFlash: flashEase((time) => -time * (time - 2)),
  OutQuad: (time) => 1 - (1 - time) * (1 - time),
  OutQuart: (time) => 1 - (1 - time) ** 4,
  OutQuint: (time) => 1 - (1 - time) ** 5,
  OutSine: (time) => Math.sin((time * Math.PI) / 2),
} satisfies Record<string, EaseCurve>;

/**
 * DOTween `Ease` ordinal table: `Unset` = 0 through `INTERNAL_Custom` = 37.
 * `EaseManager.Evaluate` gates its switch on `(uint)(easeType - 1) > 0x24`, so
 * only 1..37 get a case of their own and everything else — `Unset` included —
 * falls through to the default branch (`-(t/d) * (t/d - 2)`, the OutQuad
 * parabola). `INTERNAL_Custom` would throw on a null custom ease in native and
 * degrades to Linear here.
 */
const dotweenEaseByOrdinal: readonly EaseCurve[] = [
  // 0: Ease.Unset — not a switch case, so it lands on the OutQuad default
  // branch just like any out-of-table ordinal. (`GetEnum`'s own parse fallback
  // is Ease.Linear = ordinal 1, which the executors pass as the default.)
  dotweenEaseCurves.OutQuad,
  dotweenEaseCurves.Linear,
  dotweenEaseCurves.InSine,
  dotweenEaseCurves.OutSine,
  dotweenEaseCurves.InOutSine,
  dotweenEaseCurves.InQuad,
  dotweenEaseCurves.OutQuad,
  dotweenEaseCurves.InOutQuad,
  dotweenEaseCurves.InCubic,
  dotweenEaseCurves.OutCubic,
  dotweenEaseCurves.InOutCubic,
  dotweenEaseCurves.InQuart,
  dotweenEaseCurves.OutQuart,
  dotweenEaseCurves.InOutQuart,
  dotweenEaseCurves.InQuint,
  dotweenEaseCurves.OutQuint,
  dotweenEaseCurves.InOutQuint,
  dotweenEaseCurves.InExpo,
  dotweenEaseCurves.OutExpo,
  dotweenEaseCurves.InOutExpo,
  dotweenEaseCurves.InCirc,
  dotweenEaseCurves.OutCirc,
  dotweenEaseCurves.InOutCirc,
  dotweenEaseCurves.InElastic,
  dotweenEaseCurves.OutElastic,
  dotweenEaseCurves.InOutElastic,
  dotweenEaseCurves.InBack,
  dotweenEaseCurves.OutBack,
  dotweenEaseCurves.InOutBack,
  dotweenEaseCurves.InBounce,
  dotweenEaseCurves.OutBounce,
  dotweenEaseCurves.InOutBounce,
  dotweenEaseCurves.Flash,
  dotweenEaseCurves.InFlash,
  dotweenEaseCurves.OutFlash,
  dotweenEaseCurves.InOutFlash,
  () => 1, // 36: Ease.INTERNAL_Zero — completes instantly.
  linearEase, // 37: Ease.INTERNAL_Custom — no custom ease available.
];

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

/**
 * Own-property lookup only: `dotweenEaseCurves` is an object literal, so a bare
 * index would resolve inherited `Object.prototype` members (`"toString"`,
 * `"valueOf"`, `"__proto__"`, ...) into non-curve values that slip past a
 * nullish fallback and then throw or poison the progress with NaN.
 */
function easeCurveByName(name: string): EaseCurve | undefined {
  return Object.hasOwn(dotweenEaseCurves, name)
    ? (dotweenEaseCurves as Record<string, EaseCurve>)[name]
    : undefined;
}

/**
 * Resolves the `ease` parameter the way `GetEnum<Ease>(param, "ease",
 * Ease.Linear, ignoreCase: false)` does: enum names match case-sensitively and
 * integer strings (including negatives) parse as ordinals (`"6"` is OutQuad).
 * Anything `Enum.Parse` would reject — an unknown name, or an integer outside
 * int32 — throws in native, and `GetEnum` swallows that into a
 * `DLog.LogError("Can not parse enum ...")` plus the Ease.Linear default.
 */
export function dotweenEaseCurve(ease: string | undefined): EaseCurve {
  if (ease === undefined) {
    return linearEase;
  }
  if (/^-?\d+$/.test(ease)) {
    const ordinal = Number.parseInt(ease, 10);
    if (ordinal < INT32_MIN || ordinal > INT32_MAX) {
      return linearEase;
    }
    return dotweenEaseByOrdinal[ordinal] ?? dotweenEaseCurves.OutQuad;
  }
  return easeCurveByName(ease) ?? linearEase;
}
