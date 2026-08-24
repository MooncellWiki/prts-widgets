import { browserAnimationClock, type AnimationClock } from "../../execution";

/** Normalized-time ([0, 1] input) interpolation curve. */
export type EaseCurve = (time: number) => number;

/** Optional DOTween `SetEase`/`SetLoops` behaviour for {@link TweenRunner.run}. */
export interface TweenRunOptions {
  /**
   * Curve applied to each loop cycle's raw progress, mirroring DOTween's
   * `SetEase(ease)`; defaults to Linear.
   */
  ease?: EaseCurve;
  /**
   * DOTween `SetLoops` count: 1 = single pass (default), negative = infinite
   * Restart loop that replays from the start value every cycle and never
   * completes (so `run` only settles once `isAlive` turns false — callers
   * must not block on it).
   */
  loops?: number;
}

const linearEase: EaseCurve = (time) => time;

// Native provenance: the DOTween `Ease` enum and its Robert Penner curves
// compiled into 2.7.61 (build 2761) GameAssembly.dll
// (`DG.Tweening.Core.Easing.EaseManager.Evaluate`). AVG executors select a
// curve with `DotNetExtensionMethods.GetEnum<Ease>(param, "ease", ...)`,
// which matches enum names case-sensitively and also accepts integer strings
// as ordinals (`ease="6"` is OutQuad). The Flash family is deliberately not
// ported — story scripts never pass it to these commands — and resolves to
// Linear, as does anything the name table cannot parse (GetEnum's Linear
// fallback).

function powerCurves(power: number): Record<"in" | "inOut" | "out", EaseCurve> {
  return {
    in: (time) => time ** power,
    inOut: (time) =>
      time < 0.5
        ? 2 ** (power - 1) * time ** power
        : 1 - (-2 * time + 2) ** power / 2,
    out: (time) => 1 - (1 - time) ** power,
  };
}

const quad = powerCurves(2);
const cubic = powerCurves(3);
const quart = powerCurves(4);
const quint = powerCurves(5);

function outBounce(time: number): number {
  const d1 = 2.75;
  if (time < 1 / d1) return 7.5625 * time * time;
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

const backC1 = 1.701_58;
const backC2 = backC1 * 1.525;
const backC3 = backC1 + 1;
const elasticC4 = (2 * Math.PI) / 3;
const elasticC5 = (2 * Math.PI) / 4.5;

const dotweenEaseCurves: Record<string, EaseCurve> = {
  InBack: (time) => backC3 * time ** 3 - backC1 * time ** 2,
  InBounce: (time) => 1 - outBounce(1 - time),
  InCirc: (time) => 1 - Math.sqrt(1 - time ** 2),
  InCubic: cubic.in,
  InElastic: (time) =>
    time === 0 || time === 1
      ? time
      : -(2 ** (10 * time - 10)) * Math.sin((10 * time - 10.75) * elasticC4),
  InExpo: (time) => (time === 0 ? 0 : 2 ** (10 * time - 10)),
  InOutBack: (time) =>
    time < 0.5
      ? ((2 * time) ** 2 * ((backC2 + 1) * 2 * time - backC2)) / 2
      : ((2 * time - 2) ** 2 * ((backC2 + 1) * (2 * time - 2) + backC2) + 2) /
        2,
  InOutBounce: (time) =>
    time < 0.5
      ? (1 - outBounce(1 - 2 * time)) / 2
      : (1 + outBounce(2 * time - 1)) / 2,
  InOutCirc: (time) =>
    time < 0.5
      ? (1 - Math.sqrt(1 - (2 * time) ** 2)) / 2
      : (Math.sqrt(1 - (-2 * time + 2) ** 2) + 1) / 2,
  InOutCubic: cubic.inOut,
  InOutElastic: (time) => {
    if (time === 0 || time === 1) return time;
    return time < 0.5
      ? -(2 ** (20 * time - 10) * Math.sin((20 * time - 11.125) * elasticC5)) /
          2
      : (2 ** (-20 * time + 10) * Math.sin((20 * time - 11.125) * elasticC5)) /
          2 +
          1;
  },
  InOutExpo: (time) => {
    if (time === 0) return 0;
    if (time === 1) return 1;
    return time < 0.5
      ? 2 ** (20 * time - 10) / 2
      : (2 - 2 ** (-20 * time + 10)) / 2;
  },
  InOutQuad: quad.inOut,
  InOutQuart: quart.inOut,
  InOutQuint: quint.inOut,
  InOutSine: (time) => -(Math.cos(Math.PI * time) - 1) / 2,
  InQuad: quad.in,
  InQuart: quart.in,
  InQuint: quint.in,
  InSine: (time) => 1 - Math.cos((time * Math.PI) / 2),
  Linear: linearEase,
  OutBack: (time) => 1 + backC3 * (time - 1) ** 3 + backC1 * (time - 1) ** 2,
  OutBounce: outBounce,
  OutCirc: (time) => Math.sqrt(1 - (time - 1) ** 2),
  OutCubic: cubic.out,
  OutElastic: (time) =>
    time === 0 || time === 1
      ? time
      : 2 ** (-10 * time) * Math.sin((10 * time - 0.75) * elasticC4) + 1,
  OutExpo: (time) => (time === 1 ? 1 : 1 - 2 ** (-10 * time)),
  OutQuad: quad.out,
  OutQuart: quart.out,
  OutQuint: quint.out,
  OutSine: (time) => Math.sin((time * Math.PI) / 2),
};

/** DOTween `Ease` enum names in ordinal order (`Unset` = 0 … 37). */
const dotweenEaseOrdinalNames = [
  "Unset",
  "Linear",
  "InSine",
  "OutSine",
  "InOutSine",
  "InQuad",
  "OutQuad",
  "InOutQuad",
  "InCubic",
  "OutCubic",
  "InOutCubic",
  "InQuart",
  "OutQuart",
  "InOutQuart",
  "InQuint",
  "OutQuint",
  "InOutQuint",
  "InExpo",
  "OutExpo",
  "InOutExpo",
  "InCirc",
  "OutCirc",
  "InOutCirc",
  "InElastic",
  "OutElastic",
  "InOutElastic",
  "InBack",
  "OutBack",
  "InOutBack",
  "InBounce",
  "OutBounce",
  "InOutBounce",
  "Flash",
  "InFlash",
  "OutFlash",
  "InOutFlash",
  "INTERNAL_Zero",
  "INTERNAL_Custom",
] as const;

const dotweenEaseByOrdinal: readonly EaseCurve[] = dotweenEaseOrdinalNames.map(
  (name) => {
    switch (name) {
      case "Unset": {
        // Never scripted; Ease.Linear keeps the fallback curve.
        return linearEase;
      }
      case "INTERNAL_Zero": {
        // Jumps straight to the end value.
        return () => 1;
      }
      case "INTERNAL_Custom": {
        // Native throws on the missing custom curve; Linear is the safe shape.
        return linearEase;
      }
      default: {
        // Includes the unported Flash family, which lands on Linear.
        return dotweenEaseCurves[name] ?? linearEase;
      }
    }
  },
);

/**
 * Resolves a command's `ease` argument the way the AVG executors'
 * `GetEnum<Ease>(param, "ease", Ease.Linear, ignoreCase: false)` does:
 * case-sensitive enum names, integer strings as ordinals (`ease="6"` is
 * OutQuad), and the Linear fallback for anything unparseable. Out-of-table
 * ordinals land on EaseManager.Evaluate's default branch, the OutQuad
 * parabola.
 */
export function dotweenEaseCurve(ease: string | undefined): EaseCurve {
  if (ease === undefined) return linearEase;
  if (/^-?\d+$/.test(ease)) {
    return dotweenEaseByOrdinal[Number.parseInt(ease, 10)] ?? quad.out;
  }
  return dotweenEaseCurves[ease] ?? linearEase;
}

/**
 * Web-only animation adapter. AVG executors create DOTween sequences; callers
 * preserve their documented command timing while this class uses browser frames
 * instead of claiming a one-to-one native port.
 */
export class TweenRunner {
  constructor(
    private readonly isAlive: () => boolean,
    private readonly clock: AnimationClock = browserAnimationClock,
  ) {}

  run(
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
    options?: TweenRunOptions,
  ): Promise<void> {
    if (durationMs <= 0) {
      step(1);
      done?.();
      return Promise.resolve();
    }
    const ease = options?.ease ?? linearEase;
    const loops = options?.loops ?? 1;
    const totalMs = loops > 0 ? durationMs * loops : Number.POSITIVE_INFINITY;
    return new Promise((resolve) => {
      const start = this.clock.now();
      const tick = () => {
        if (!this.isAlive()) {
          done?.();
          resolve();
          return;
        }
        const elapsed = this.clock.now() - start;
        if (elapsed >= totalMs) {
          step(ease(1));
          done?.();
          resolve();
          return;
        }
        // DOTween's default Restart loop type replays from the start value
        // at every cycle boundary.
        const cycleProgress =
          loops === 1
            ? elapsed / durationMs
            : (elapsed % durationMs) / durationMs;
        step(ease(cycleProgress));
        this.clock.requestFrame(tick);
      };
      this.clock.requestFrame(tick);
    });
  }
}
