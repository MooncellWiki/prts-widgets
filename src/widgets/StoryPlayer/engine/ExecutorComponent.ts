import type {
  CommandExecutor,
  CommandRegistry,
  CommandResult,
  WaitForAnimation,
  WaitForClick,
  WaitForDelay,
} from "./commandRegistry";
import type { AnimationCompletion } from "./execution";

export type ExecutorResult =
  | Exclude<CommandResult, WaitForAnimation | WaitForClick | WaitForDelay>
  | Pick<WaitForClick, "handleClick">
  | {
      animation: AnimationCompletion;
      block: boolean;
    };

export type PanelExecutors = Readonly<
  Record<string, CommandExecutor<ExecutorResult>>
>;

interface Execution {
  isCurrent: () => boolean;
  animation?: { reject: (error: unknown) => void; resolve: () => void };
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
      if (result.animation && result.block)
        return this.waitForAnimation(execution, result.animation);
      // Nonblocking views own their animation and its error handling.
      this.finish(execution);
      return "continue";
    }
    if ("handleClick" in result) {
      return {
        forceEnd: () => this.finish(execution, "force"),
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

  private waitForAnimation(
    execution: Execution,
    animation: Promise<unknown>,
  ): WaitForAnimation {
    const wait = new Promise<void>((resolve, reject) => {
      execution.animation = { reject, resolve };
    });
    void animation.then(
      () => {
        if (execution.isCurrent()) this.finish(execution);
      },
      (error) => {
        if (this.current !== execution || !execution.isCurrent()) return;
        this.current = null;
        execution.animation?.reject(error);
      },
    );
    return {
      animation: wait,
      forceEnd: () => this.finish(execution, "force"),
    };
  }

  private finish(
    execution: Execution,
    end: "complete" | "force" = "complete",
  ): void {
    if (this.current !== execution) return;
    this.current = null;
    try {
      if (end === "force") this.forceCommandEnd();
      else if (execution.isCurrent()) this.onFinish();
    } catch (error) {
      if (!execution.animation) throw error;
      execution.animation.reject(error);
      return;
    }
    execution.animation?.resolve();
  }
}
