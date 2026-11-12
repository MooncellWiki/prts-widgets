import { setImmediate } from "node:timers/promises";

import type {
  PlaybackFrame,
  StoryRenderer,
} from "../../src/widgets/StoryPlayer/engine/types";

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
