/**
 * Native provenance: DOTween `Ease` curves compiled into 2.7.61 (build 2761)
 * `GameAssembly.dll` — `DG.Tweening.Core.Easing.EaseManager.Evaluate` @
 * 0x184140b40 (Robert Penner equations) plus the `Flash` helper class @
 * 0x1841433b0-0x1841438a0. `Torappu.AVG` executors select one of these via
 * `SetEase` after `DotNetExtensionMethods.GetEnum<Ease>(param, "ease",
 * Ease.Linear, ignoreCase: false)`.
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

const easeBackC1 = 1.701_58;
const easeBackC2 = easeBackC1 * 1.525;
const easeBackC3 = easeBackC1 + 1;
const easeElasticC4 = (2 * Math.PI) / 3;
const easeElasticC5 = (2 * Math.PI) / 4.5;

/**
 * Port of `DG.Tweening.Core.Easing.Flash` (2.7.61 `Flash.Ease` @ 0x184143780,
 * `EaseIn` @ 0x184143520, `EaseOut` @ 0x184143640, `EaseInOut` @ 0x1841433b0,
 * `WeightedEase` @ 0x1841438a0). Unlike the Elastic/Back curves, these flash
 * implementations apply no sentinel guards to `overshootOrAmplitude`/`period`,
 * so the library-wide `SetEase(Ease)` defaults (-1 / 0) flow through the math
 * verbatim; with them each wave collapses into the plain quadratic below.
 */
const FLASH_DEFAULT_AMPLITUDE = -1;
const FLASH_DEFAULT_PERIOD = 0;

function flashWeightedEase(
  amplitude: number,
  period: number,
  stepIndex: number,
  dir: number,
  res: number,
): number {
  if (
    (dir > 0 && (Math.trunc(amplitude) & 1) === 0) ||
    (dir < 0 && (Math.trunc(amplitude) & 1) !== 0)
  ) {
    stepIndex += 1;
  }
  let weighted: number;
  let lerp: number;
  if (period > 0) {
    let frac = amplitude - Math.trunc(amplitude);
    if (dir > 0) {
      frac = 1 - frac;
    }
    lerp = (stepIndex * frac) / amplitude;
    weighted = ((amplitude - stepIndex) * res) / amplitude;
  } else if (period < 0) {
    period = -period;
    lerp = 0;
    weighted = (stepIndex * res) / amplitude;
  } else {
    return Math.min(1, res);
  }
  return Math.min(1, (weighted - res) * period + lerp + res);
}

function flashEase(easeVal: (waveProgress: number) => number): EaseCurve {
  return (time) => {
    // `time` is normalized, so `duration` is 1 and each wave lasts
    // `1 / amplitude`.
    const amplitude = FLASH_DEFAULT_AMPLITUDE;
    const stepDuration = 1 / amplitude;
    const step = Math.ceil(time / stepDuration);
    let stepTime = time - (step - 1) * stepDuration;
    const dir = 2 * (Math.trunc(step) & 1) - 1;
    if (dir < 0) {
      stepTime -= stepDuration;
    }
    return flashWeightedEase(
      amplitude,
      FLASH_DEFAULT_PERIOD,
      step,
      dir,
      easeVal((dir * stepTime) / stepDuration),
    );
  };
}

function flashInOutVal(waveProgress: number): number {
  const doubled = waveProgress / 0.5;
  if (doubled >= 1) {
    return ((doubled - 1 - 2) * (doubled - 1) - 1) * -0.5;
  }
  return doubled * 0.5 * doubled;
}

const dotweenEaseCurves: Record<string, EaseCurve> = {
  Flash: flashEase((waveProgress) => waveProgress),
  InBack: (time) => easeBackC3 * time ** 3 - easeBackC1 * time ** 2,
  InBounce: (time) => 1 - outBounceEase(1 - time),
  InCirc: (time) => 1 - Math.sqrt(1 - time ** 2),
  InCubic: (time) => time ** 3,
  // Elastic applies its in-curve defaults (`overshootOrAmplitude < 1` → 1,
  // `period == 0` → duration * 0.3), which collapse to the constants folded
  // into the equations below.
  InElastic: (time) =>
    time === 0 || time === 1
      ? time
      : -(2 ** (10 * time - 10)) *
        Math.sin((10 * time - 10.75) * easeElasticC4),
  InExpo: (time) => (time === 0 ? 0 : 2 ** (10 * time - 10)),
  InFlash: flashEase((waveProgress) => waveProgress * waveProgress),
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
    if (time < 0.5) {
      return (
        -(
          2 ** (20 * time - 10) *
          Math.sin((20 * time - 11.125) * easeElasticC5)
        ) / 2
      );
    }
    return (
      (2 ** (-20 * time + 10) *
        Math.sin((20 * time - 11.125) * easeElasticC5)) /
        2 +
      1
    );
  },
  InOutExpo: (time) => {
    if (time === 0) return 0;
    if (time === 1) return 1;
    if (time < 0.5) return 2 ** (20 * time - 10) / 2;
    return (2 - 2 ** (-20 * time + 10)) / 2;
  },
  InOutFlash: flashEase(flashInOutVal),
  InOutQuad: (time) =>
    time < 0.5 ? 2 * time * time : 1 - (-2 * time + 2) ** 2 / 2,
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
      : 2 ** (-10 * time) * Math.sin((10 * time - 0.75) * easeElasticC4) + 1,
  OutExpo: (time) => (time === 1 ? 1 : 1 - 2 ** (-10 * time)),
  OutFlash: flashEase((waveProgress) => (waveProgress - 2) * -waveProgress),
  OutQuad: (time) => 1 - (1 - time) * (1 - time),
  OutQuart: (time) => 1 - (1 - time) ** 4,
  OutQuint: (time) => 1 - (1 - time) ** 5,
  OutSine: (time) => Math.sin((time * Math.PI) / 2),
};

/**
 * DOTween `Ease` ordinal table: `Unset` = 0 through `INTERNAL_Custom` = 37.
 * Out-of-table ordinals keep native's `EaseManager.Evaluate` default branch
 * (`-(t/d) * (t/d - 2)`, the OutQuad parabola); `INTERNAL_Custom` would throw
 * on a null custom ease in native and degrades to Linear here.
 */
const dotweenEaseByOrdinal: readonly EaseCurve[] = [
  linearEase, // 0: Ease.Unset — GetEnum's parse fallback value.
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

/**
 * Resolves the `ease` parameter the way `GetEnum<Ease>(param, "ease",
 * Ease.Linear, ignoreCase: false)` does: enum names match case-sensitively,
 * integer strings (including negatives) parse as ordinals (`"6"` is OutQuad),
 * and anything else falls back to the Ease.Linear default.
 */
export function dotweenEaseCurve(ease: string | undefined): EaseCurve {
  if (ease === undefined) {
    return linearEase;
  }
  if (/^-?\d+$/.test(ease)) {
    return (
      dotweenEaseByOrdinal[Number.parseInt(ease, 10)] ??
      dotweenEaseCurves.OutQuad
    );
  }
  return dotweenEaseCurves[ease] ?? linearEase;
}
