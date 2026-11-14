export type ExecutionEndReason = "complete" | "force_end" | "reset";
type ExecutionOutcome = ExecutionEndReason | "error";
/** A cache miss may have to load art before it can start the animation. */
export type AnimationPreparation =
  ExecutionHandle | void | Promise<ExecutionHandle | void>;

export interface ExecutionHandle {
  readonly blocking: boolean;
  readonly completion: Promise<ExecutionOutcome>;
  readonly endReason: ExecutionOutcome | undefined;
  readonly failure: { readonly error: unknown } | undefined;
  end: (reason?: ExecutionEndReason) => void;
  fail: (error: unknown) => void;
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
  onEnd?: (reason: ExecutionOutcome) => void,
): ExecutionHandle {
  let endReason: ExecutionOutcome | undefined;
  let failure: ExecutionHandle["failure"];
  let completion: Promise<ExecutionOutcome> | undefined;
  let resolve: ((reason: ExecutionOutcome) => void) | undefined;
  const settle = (
    reason: ExecutionOutcome,
    result?: ExecutionHandle["failure"],
  ) => {
    if (endReason !== undefined) return;
    endReason = reason;
    failure = result;
    try {
      onEnd?.(reason);
    } finally {
      resolve?.(reason);
    }
  };
  return {
    blocking,
    get completion() {
      return (completion ??=
        endReason === undefined
          ? new Promise((done) => {
              resolve = done;
            })
          : Promise.resolve(endReason));
    },
    get endReason() {
      return endReason;
    },
    get failure() {
      return failure;
    },
    end(reason = "complete") {
      settle(reason);
    },
    fail(error) {
      settle("error", { error });
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
