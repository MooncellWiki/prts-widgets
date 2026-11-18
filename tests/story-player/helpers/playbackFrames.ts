import { setImmediate } from "node:timers/promises";

import { TweenRunner } from "../../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

import type {
  PlaybackFrame,
  StoryRenderer,
} from "../../../src/widgets/StoryPlayer/engine/types";

/** Frame adapter for tests without a mounted Pixi ticker. */
export class PlaybackTestFrames {
  manual = false;
  private nowMs = 0;
  private frameQueued = false;
  private readonly updates = {
    afterUpdate: new Set<(frame: PlaybackFrame) => void>(),
    update: new Set<(frame: PlaybackFrame) => void>(),
  };
  private readonly frameEnds = new Set<() => void>();

  now = (): number => this.nowMs;

  createTweenRunner(): TweenRunner {
    return new TweenRunner(
      () => true,
      (advance) => this.onFrameUpdate(({ deltaMs }) => advance(deltaMs)),
    );
  }

  onFrameUpdate: StoryRenderer["onFrameUpdate"] = (
    callback,
    phase = "update",
  ) => {
    const listeners = this.updates[phase];
    listeners.add(callback);
    this.queueFrame();
    return () => listeners.delete(callback);
  };

  onFrameEnd: StoryRenderer["onFrameEnd"] = (callback) => {
    this.frameEnds.add(callback);
    this.queueFrame();
    return () => this.frameEnds.delete(callback);
  };

  step(deltaMs = 1): void {
    this.nowMs += deltaMs;
    const frame = { deltaMs, nowMs: this.nowMs };
    for (const listeners of [this.updates.update, this.updates.afterUpdate]) {
      for (const callback of [...listeners])
        if (listeners.has(callback)) callback(frame);
    }
    const ends = [...this.frameEnds];
    for (const callback of ends)
      if (this.frameEnds.delete(callback)) callback();
    if (ends.length) this.queueFrame();
  }

  /** Advance wall time over several ordinary frames. step() injects one frame. */
  elapse(durationMs: number): void {
    for (let remaining = durationMs; remaining > 0; remaining -= 100)
      this.step(Math.min(remaining, 100));
  }

  async advance(...deltas: number[]): Promise<void> {
    for (const delta of deltas) {
      this.step(delta);
      await setImmediate();
    }
  }

  private queueFrame(): void {
    if (this.manual || this.frameQueued) return;
    this.frameQueued = true;
    queueMicrotask(() => {
      this.frameQueued = false;
      if (!this.manual) this.step();
    });
  }
}

/** Force finite tweens to their end pose regardless of their clock. */
export function createInstantTweenRunner(): TweenRunner {
  const runner = new TweenRunner(
    () => true,
    () => () => {},
  );
  const start = runner.start.bind(runner);
  runner.start = (...args) => {
    const tween = start(...args);
    tween.kill(true);
    return tween;
  };
  return runner;
}
