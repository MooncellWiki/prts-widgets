import { describe, expect, it, vi } from "vitest";

import { dotweenEaseCurve } from "../src/widgets/StoryPlayer/engine/rendering/core/DotweenEase";
import { TweenRunner } from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

import type { AnimationClock } from "../src/widgets/StoryPlayer/engine/execution";

/** Synchronous AnimationClock whose frames flush only when time advances. */
function createManualClock() {
  let now = 0;
  const frames: Array<() => void> = [];
  const clock: AnimationClock = {
    cancelFrame: () => {},
    now: () => now,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  };
  return {
    advance(ms: number) {
      now += ms;
      const pending = frames.slice();
      frames.length = 0;
      for (const callback of pending) callback();
    },
    clock,
  };
}

describe("TweenRunner ease and loops (DOTween SetEase/SetLoops port)", () => {
  it("keeps linear progress without options", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const progress: number[] = [];
    const done = vi.fn();
    const run = runner.run(1000, (p) => progress.push(p), done);
    manual.advance(500);
    manual.advance(1000);
    expect(await run).toBeUndefined();
    expect(progress).toEqual([0.5, 1]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("applies the ease curve to each step", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const progress: number[] = [];
    const run = runner.run(1000, (p) => progress.push(p), undefined, {
      ease: dotweenEaseCurve("OutQuad"),
    });
    // Raw 0.5 becomes 0.75 under OutQuad.
    manual.advance(500);
    manual.advance(500);
    await run;
    expect(progress).toEqual([0.75, 1]);
  });

  it("replays from the start on every Restart loop cycle", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const progress: number[] = [];
    const done = vi.fn();
    const run = runner.run(1000, (p) => progress.push(p), done, { loops: 2 });
    manual.advance(1500);
    expect(progress).toEqual([0.5]);
    manual.advance(500);
    await run;
    // Second cycle boundary lands on the total end: eased final step, then
    // done fires exactly once after both loops.
    expect(progress).toEqual([0.5, 1]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("never completes an infinite loop while alive", async () => {
    const manual = createManualClock();
    let alive = true;
    const runner = new TweenRunner(() => alive, manual.clock);
    const progress: number[] = [];
    const done = vi.fn();
    let settled = false;
    const run = runner.run(1000, (p) => progress.push(p), done, { loops: -1 });
    void run.then(() => {
      settled = true;
    });
    manual.advance(2500);
    expect(progress).toEqual([0.5]);
    expect(done).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    alive = false;
    manual.advance(500);
    await run;
    expect(settled).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
