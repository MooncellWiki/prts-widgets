export type ExecutionEndReason = "complete" | "force_end" | "reset";

export interface ExecutionHandle {
  readonly blocking: boolean;
  readonly completion: Promise<ExecutionEndReason>;
  end: (reason?: ExecutionEndReason) => void;
}

/**
 * Native provenance: `Torappu.AVG.CommandExecutorWrapper` completion and
 * force-end lifecycle.
 *
 * Ports one-shot command completion with an explicit blocking flag. A Promise
 * is the web adaptation of native finish callbacks and coroutine resumption.
 *
 */
export function createExecutionHandle(
  blocking: boolean,
  onEnd?: (reason: ExecutionEndReason) => void,
): ExecutionHandle {
  let settled = false;
  let resolve!: (reason: ExecutionEndReason) => void;
  const completion = new Promise<ExecutionEndReason>((done) => {
    resolve = done;
  });
  return {
    blocking,
    completion,
    end(reason = "complete") {
      if (settled) return;
      settled = true;
      onEnd?.(reason);
      resolve(reason);
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
