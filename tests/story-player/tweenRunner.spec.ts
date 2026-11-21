import { describe, expect, it, vi } from "vitest";

import type { AnimationClock } from "@/widgets/StoryPlayer/engine/execution";
import { dotweenEaseCurve } from "@/widgets/StoryPlayer/engine/rendering/core/DotweenEase";
import { TweenRunner } from "@/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

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
    manual.advance(0);
    manual.advance(1000);
    manual.advance(500);
    expect(progress).toEqual([0, 1, 0.5]);
    manual.advance(500);
    await run;
    // Second cycle boundary lands on the total end: eased final step, then
    // done fires exactly once after both loops.
    expect(progress).toEqual([0, 1, 0.5, 1]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("clamps the loop count like SetLoops", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const progress: number[] = [];
    // `SetLoops` @ 0x184885f00 rewrites 0 into a single pass.
    const run = runner.run(1000, (p) => progress.push(p), undefined, {
      loops: 0,
    });
    manual.advance(500);
    manual.advance(500);
    await run;
    expect(progress).toEqual([0.5, 1]);
  });

  it("never completes an infinite loop while alive", async () => {
    const manual = createManualClock();
    let alive = true;
    const runner = new TweenRunner(() => alive, manual.clock);
    const progress: number[] = [];
    const done = vi.fn();
    let settled = false;
    // `SetLoops` also rewrites anything below -1 into the -1 infinite loop.
    const run = runner.run(1000, (p) => progress.push(p), done, { loops: -4 });
    void run.then(() => {
      settled = true;
    });
    manual.advance(2000);
    manual.advance(500);
    expect(progress).toEqual([1, 0.5]);
    expect(done).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    alive = false;
    manual.advance(500);
    await run;
    expect(settled).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("samples a zero-duration infinite tween once per update until killed", () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const step = vi.fn();
    const onComplete = vi.fn();
    const tween = runner.start(0, step, { loops: -1, onComplete });
    expect(step).not.toHaveBeenCalled();
    manual.advance(16);
    manual.advance(16);
    expect(step.mock.calls).toEqual([[1], [1]]);
    expect(tween.endReason).toBeUndefined();
    tween.kill(true);
    expect(tween.endReason).toBe("cancelled");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("retires a run once its own isAlive turns false", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    let targetAlive = true;
    const progress: number[] = [];
    const done = vi.fn();
    let settled = false;
    const run = runner.run(1000, (p) => progress.push(p), done, {
      isAlive: () => targetAlive,
      loops: -1,
    });
    void run.then(() => {
      settled = true;
    });
    manual.advance(1500);
    expect(progress).toEqual([0.5]);
    // The runner itself stays alive; the per-run check alone retires the
    // infinite loop, settling it like a teardown without another step.
    targetAlive = false;
    manual.advance(500);
    await run;
    expect(settled).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
    expect(progress).toEqual([0.5]);
  });
});

describe("TweenRunner lifecycle", () => {
  it("cancels matching tweens before their turn in the current update", async () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const target = {};
    runner.start(16, () => {}, {
      onComplete: () => runner.killTarget(target),
    });
    const step = vi.fn();
    const onCancel = vi.fn();
    const onComplete = vi.fn();
    const targeted = runner.start(16, step, { onCancel, onComplete, target });
    const targetless = runner.start(16, () => {});

    manual.advance(16);
    await targeted.completion;
    expect(targeted.endReason).toBe("cancelled");
    expect(targetless.endReason).toBe("complete");
    expect(step).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledExactlyOnceWith();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("writes the final value on kill(true) for finite tweens", () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const target = {};
    const finiteStep = vi.fn();
    const infiniteStep = vi.fn();
    const onComplete = vi.fn();
    const finite = runner.start(100, finiteStep, { onComplete, target });
    const infinite = runner.start(100, infiniteStep, {
      loops: -1,
      onComplete,
      target,
    });

    runner.killTarget(target, true);
    runner.killTarget(target, true);
    manual.advance(100);
    expect(finite.endReason).toBe("complete");
    expect(finiteStep.mock.calls).toEqual([[1]]);
    expect(infinite.endReason).toBe("cancelled");
    expect(infiniteStep).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledExactlyOnceWith();
  });

  it("runs deferred work after the current batch and starts new tweens next frame", () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const calls: string[] = [];
    runner.start(16, () => {}, {
      onComplete: () => {
        runner.afterUpdate(() => calls.push("dispose"));
        runner.start(0, () => calls.push("new"), {
          deferZeroDuration: true,
        });
      },
    });
    runner.start(16, () => calls.push("existing"));

    manual.advance(16);
    expect(calls).toEqual(["existing", "dispose"]);
    manual.advance(16);
    expect(calls).toEqual(["existing", "dispose", "new"]);
  });
});

describe("TweenRunner OnKill", () => {
  it("dispatches OnKill in reverse order after both tweens write", () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const calls: string[] = [];
    for (const name of ["first", "second"]) {
      runner.start(16, () => calls.push(`write ${name}`), {
        onComplete: () => calls.push(`complete ${name}`),
        onKill: () => calls.push(`kill ${name}`),
      });
    }

    manual.advance(16);
    expect(calls).toEqual([
      "write first",
      "complete first",
      "write second",
      "complete second",
      "kill second",
      "kill first",
    ]);
  });

  it("calls OnKill without completing an explicitly killed tween", () => {
    const manual = createManualClock();
    const runner = new TweenRunner(() => true, manual.clock);
    const onKill = vi.fn();
    const onComplete = vi.fn();
    const step = vi.fn();
    const target = {};
    runner.start(16, step, { onComplete, onKill, target });

    runner.killTarget(target);
    expect(onKill).toHaveBeenCalledTimes(1);
    manual.advance(16);
    expect(step).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onKill).toHaveBeenCalledTimes(1);
  });
});
