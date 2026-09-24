import { PixiStoryRenderer } from "../../src/widgets/StoryPlayer/engine/renderer";

import type { Context } from "../../src/widgets/StoryPlayer/context";
import type { AnimationClock } from "../../src/widgets/StoryPlayer/engine/execution";

export function createContext(): Context {
  return {
    linkMap: {},
    script: [],
  };
}

// The specs drive the renderer's private state and methods directly; keep
// that cast in this one place instead of repeating it in every test.
export function createRenderer(
  context: Context = createContext(),
  onWarning?: (detail: string) => void,
): any {
  return new PixiStoryRenderer(context, onWarning) as any;
}

export function createManualClock(): {
  advance: (ms: number) => void;
  clock: AnimationClock;
  drainFrame: () => void;
} {
  const frames: Array<() => void> = [];
  let now = 0;
  const clock: AnimationClock = {
    cancelFrame: () => {},
    now: () => now,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  };
  return {
    advance: (ms) => {
      now += ms;
    },
    clock,
    drainFrame: () => {
      const frame = frames.shift();
      if (frame) frame();
    },
  };
}
