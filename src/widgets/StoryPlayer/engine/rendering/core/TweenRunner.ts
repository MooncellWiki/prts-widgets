import { browserAnimationClock, type AnimationClock } from "../../execution";

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
  ): Promise<void> {
    if (durationMs <= 0) {
      step(1);
      done?.();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const start = this.clock.now();
      const tick = () => {
        if (!this.isAlive()) {
          done?.();
          resolve();
          return;
        }
        const progress = Math.min(1, (this.clock.now() - start) / durationMs);
        step(progress);
        if (progress >= 1) {
          done?.();
          resolve();
          return;
        }
        this.clock.requestFrame(tick);
      };
      this.clock.requestFrame(tick);
    });
  }
}
