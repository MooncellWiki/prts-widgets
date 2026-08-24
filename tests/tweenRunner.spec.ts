import { describe, expect, it } from "vitest";

import {
  dotweenEaseCurve,
  TweenRunner,
} from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

describe('dotweenEaseCurve (GetEnum<Ease>("ease", Ease.Linear))', () => {
  it("resolves integer strings as DOTween ordinals", () => {
    // ease="1" is corpus-attested and is the GetEnum default: Linear.
    expect(dotweenEaseCurve("1")(0.25)).toBe(0.25);
    // ease="6" (act12d0_st02) is OutQuad, ease="7" (act12side_03_end) is
    // InOutQuad.
    expect(dotweenEaseCurve("6")(0.25)).toBe(0.4375);
    expect(dotweenEaseCurve("7")(0.25)).toBe(0.125);
  });

  it("resolves enum names case-sensitively like ignoreCase: false", () => {
    // Names used by production largebgtween scripts.
    expect(dotweenEaseCurve("InOutCubic")(0.25)).toBe(0.0625);
    expect(dotweenEaseCurve("InQuart")(0.5)).toBe(0.0625);
    expect(dotweenEaseCurve("InExpo")(0.5)).toBe(0.03125);
    // GetEnum falls back to Ease.Linear for anything it cannot parse.
    expect(dotweenEaseCurve("inoutcubic")(0.25)).toBe(0.25);
    expect(dotweenEaseCurve("NoSuchEase")(0.25)).toBe(0.25);
    expect(dotweenEaseCurve(undefined)(0.25)).toBe(0.25);
  });

  it("keeps EaseManager's edge-ordinal behaviour", () => {
    // Ease.Unset never appears in scripts; treated as Linear.
    expect(dotweenEaseCurve("0")(0.25)).toBe(0.25);
    // Out-of-table ordinals hit EaseManager.Evaluate's default branch, the
    // OutQuad parabola.
    expect(dotweenEaseCurve("99")(0.5)).toBe(0.75);
    // The Flash family is not ported (absent from the story corpus) and
    // resolves to Linear.
    expect(dotweenEaseCurve("OutFlash")(0.5)).toBe(0.5);
    expect(dotweenEaseCurve("34")(0.5)).toBe(0.5);
    // INTERNAL_Zero jumps straight to the end value.
    expect(dotweenEaseCurve("36")(0.25)).toBe(1);
  });
});

function manualClock() {
  let now = 0;
  const frames: Array<() => void> = [];
  return {
    advance(to: number): void {
      now = to;
      frames.shift()?.();
    },
    clock: {
      cancelFrame: () => {},
      now: () => now,
      requestFrame: (callback: () => void) => frames.push(callback),
    },
  };
}

describe("TweenRunner ease/loops (SetEase/SetLoops)", () => {
  it("eases the stepped progress", async () => {
    const { advance, clock } = manualClock();
    const stepped: number[] = [];
    const runner = new TweenRunner(() => true, clock);
    const run = runner.run(
      1000,
      (progress) => stepped.push(progress),
      undefined,
      { ease: dotweenEaseCurve("6") },
    );

    advance(250);
    advance(500);
    advance(1000);
    await run;

    expect(stepped).toEqual([0.4375, 0.75, 1]);
  });

  it("restarts from the From pose each loop cycle and never completes", async () => {
    const { advance, clock } = manualClock();
    const stepped: number[] = [];
    let settled = false;
    let completed = false;
    const runner = new TweenRunner(() => true, clock);
    const run = runner.run(
      1000,
      (progress) => stepped.push(progress),
      () => {
        completed = true;
      },
      { loops: -1 },
    );
    run.then(() => {
      settled = true;
    });

    advance(500);
    advance(1250);
    advance(2000);
    await Promise.resolve();

    // SetLoops(-1): cycle progress wraps at each duration boundary.
    expect(stepped).toEqual([0.5, 0.25, 0]);
    expect(completed).toBe(false);
    expect(settled).toBe(false);
  });

  it("settles a looping tween once the runner stops being alive", async () => {
    const { advance, clock } = manualClock();
    let alive = true;
    let completed = false;
    const runner = new TweenRunner(() => alive, clock);
    const run = runner.run(
      1000,
      () => {},
      () => {
        completed = true;
      },
      { loops: -1 },
    );

    advance(500);
    alive = false;
    advance(600);
    await run;

    expect(completed).toBe(true);
  });
});
