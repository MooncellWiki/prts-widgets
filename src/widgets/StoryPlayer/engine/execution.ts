export type ExecutionEndReason = "complete" | "force_end" | "reset";
/** The view's end Promise settles even if the animation is retired. */
export type AnimationCompletion = Promise<ExecutionEndReason | void> | void;

/** Result of preparing a view, with any running animation reported separately. */
export interface PreparedAnimation {
  animation: AnimationCompletion;
}

export interface ExecutionHandle {
  readonly blocking: boolean;
  readonly completion: Promise<ExecutionEndReason>;
  readonly endReason: ExecutionEndReason | undefined;
  end: (reason?: ExecutionEndReason) => void;
}

/**
 * Native provenance: `Torappu.AVG.CommandExecutorWrapper` completion and
 * force-end lifecycle.
 *
 * Ports one-shot completion. The frame loop reads endReason synchronously.
 * The Promise lets callers observe the same completion.
 *
 */
export function createExecutionHandle(
  blocking: boolean,
  onEnd?: (reason: ExecutionEndReason) => void,
): ExecutionHandle {
  let endReason: ExecutionEndReason | undefined;
  let resolve!: (reason: ExecutionEndReason) => void;
  const completion = new Promise<ExecutionEndReason>((done) => {
    resolve = done;
  });
  return {
    blocking,
    completion,
    get endReason() {
      return endReason;
    },
    end(reason = "complete") {
      if (endReason !== undefined) return;
      endReason = reason;
      try {
        onEnd?.(reason);
      } finally {
        resolve(reason);
      }
    },
  };
}

export interface AnimationClock {
  now: () => number;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
}

export const browserAnimationClock: AnimationClock = {
  cancelFrame: (id) => cancelAnimationFrame(id),
  now: () =>
    typeof performance === "undefined" ? Date.now() : performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
};
