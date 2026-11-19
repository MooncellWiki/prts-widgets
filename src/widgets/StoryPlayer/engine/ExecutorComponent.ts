import type {
  CommandExecutor,
  CommandRegistry,
  CommandResult,
  WaitForClick,
  WaitForDecision,
  WaitForFrame,
} from "./commandRegistry";
import type { ExecutionHandle } from "./execution";

export type ExecutorResult =
  | "continue"
  | WaitForClick
  | WaitForDecision
  | WaitForFrame
  | {
      animation: ExecutionHandle | void;
      block: boolean;
    };

export type PanelExecutors = Readonly<
  Record<string, CommandExecutor<ExecutorResult>>
>;

interface Execution {
  isCurrent: () => boolean;
}

/**
 * Torappu.AVG.ExecutorComponent.Execute / FinishCommand
 * (2791 @ 0x18419B4F0 / 0x18419B640). Each panel has one completion slot shared
 * by its commands. An animation can call FinishCommand after its nonblocking
 * command has advanced, so its callback addresses the current execution.
 * StoryRuntime owns the frame and input scheduling for returned waits.
 */
export abstract class ExecutorComponent {
  private current: Execution | null = null;

  register(registry: CommandRegistry<CommandResult>): void {
    for (const [name, execute] of Object.entries(this.getExecutors())) {
      registry.register(name, (line, isCurrent) =>
        this.execute(() => execute(line, isCurrent), isCurrent),
      );
    }
  }

  protected abstract getExecutors(): PanelExecutors;

  protected onFinish(): void {}

  protected forceCommandEnd(): void {
    this.onFinish();
  }

  protected readonly finishCommand = (): void => {
    const execution = this.current;
    if (execution?.isCurrent()) this.finish(execution);
  };

  protected execute(
    invoke: () => ExecutorResult | Promise<ExecutorResult>,
    isCurrent = () => true,
  ): CommandResult | Promise<CommandResult> {
    const execution: Execution = { isCurrent };
    this.current = execution;
    const fail = (error: unknown): never => {
      if (this.current === execution) this.current = null;
      throw error;
    };
    try {
      const result = invoke();
      return result instanceof Promise
        ? result.then((value) => this.handleResult(execution, value), fail)
        : this.handleResult(execution, result);
    } catch (error) {
      return fail(error);
    }
  }

  private handleResult(
    execution: Execution,
    result: ExecutorResult,
  ): CommandResult {
    if (this.current !== execution) return "continue";
    if (!execution.isCurrent()) {
      this.current = null;
      return "continue";
    }
    if (result === "continue") {
      this.finish(execution);
      return result;
    }
    if ("animation" in result) {
      const { animation, block } = result;
      if (animation && block)
        return this.waitForFrameAnimation(execution, animation);
      // Nonblocking views own their animation and its error handling.
      this.finish(execution);
      return "continue";
    }
    if ("handleClick" in result) {
      return {
        forceEnd: () => this.forceEnd(execution, result.forceEnd),
        handleClick: (finish) =>
          result.handleClick((completion) =>
            finish({
              ...completion,
              onFinish: () => {
                completion?.onFinish?.();
                this.finish(execution);
              },
            }),
          ),
      };
    }
    if ("isComplete" in result) return this.wrapFrameWait(execution, result);
    return {
      ...result,
      closeDecision: () => {
        try {
          result.closeDecision();
        } finally {
          this.finish(execution);
        }
      },
    };
  }

  private waitForFrameAnimation(
    execution: Execution,
    animation: ExecutionHandle,
  ): WaitForFrame {
    if (animation.failure) {
      this.current = null;
      throw animation.failure.error;
    }
    return this.wrapFrameWait(execution, {
      assetsReady: animation.assetsReady,
      isComplete: () => {
        if (animation.endReason === undefined) return false;
        if (animation.failure) {
          this.current = null;
          throw animation.failure.error;
        }
        return true;
      },
    });
  }

  private wrapFrameWait(
    execution: Execution,
    wait: WaitForFrame,
  ): WaitForFrame {
    return {
      assetsReady: wait.assetsReady,
      forceEnd: () => this.forceEnd(execution, wait.forceEnd),
      isComplete: (nowMs) => {
        // FinishCommand may already have released this panel's current wait.
        if (this.current !== execution) return true;
        if (!wait.isComplete(nowMs)) return false;
        this.finish(execution);
        return true;
      },
    };
  }

  private finish(execution: Execution): void {
    if (this.current !== execution) return;
    // FinishCommand (2791 @ 0x18419B640) runs OnFinish before releasing
    // the blocker. A failed OnFinish can still surface through the wait.
    if (execution.isCurrent()) this.onFinish();
    if (this.current === execution) this.current = null;
  }

  private forceEnd(execution: Execution, cleanup?: () => void): void {
    if (this.current !== execution) return;
    this.current = null;
    if (cleanup) cleanup();
    else this.forceCommandEnd();
  }
}
