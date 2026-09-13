import { browserAnimationClock, type AnimationClock } from "../../execution";

import { linearEase, type EaseCurve } from "./DotweenEase";

/** Optional DOTween `SetEase`/`SetLoops` behaviour for {@link TweenRunner.run}. */
export interface TweenRunOptions {
  /**
   * Curve applied to each loop cycle's raw progress, mirroring DOTween's
   * `SetEase(ease)`; defaults to Linear.
   */
  ease?: EaseCurve;
  /**
   * Per-run liveness checked alongside the runner's own `isAlive` on every
   * frame; once it returns false the run settles exactly like a runner
   * teardown (`done`, then resolve). Infinite loops need it to stop requesting
   * frames when their target is retired instead of living as long as the
   * whole renderer.
   */
  isAlive?: () => boolean;
  /**
   * DOTween `SetLoops` count: 1 = single pass (default), negative = infinite
   * Restart loop that replays from the start value every cycle and never
   * completes (so `run` only settles once `isAlive` turns false — callers
   * must not block on it). Clamped like `SetLoops` @ 0x184885f00: 0 becomes a
   * single pass and anything below -1 becomes -1.
   */
  loops?: number;
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
    const requestedLoops = options?.loops ?? 1;
    const loops =
      requestedLoops === 0 ? 1 : Math.max(-1, Math.trunc(requestedLoops));
    const totalMs = loops > 0 ? durationMs * loops : Number.POSITIVE_INFINITY;
    const isRunAlive = options?.isAlive;
    return new Promise((resolve) => {
      const start = this.clock.now();
      const tick = () => {
        if (!this.isAlive() || (isRunAlive && !isRunAlive())) {
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
        step(ease((elapsed % durationMs) / durationMs));
        this.clock.requestFrame(tick);
      };
      this.clock.requestFrame(tick);
    });
  }
}
