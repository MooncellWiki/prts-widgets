import type { DecisionSelection, ParsedCommandLine } from "./types";

export interface ClickCompletion {
  onClick?: () => void;
  onFinish?: () => void;
}

type FinishCommand = (completion?: ClickCompletion) => void;

/**
 * Web adaptation of an executor returning true and subscribing to ON_CLICK.
 * The click handler calls FinishCommand to request completion at frame end.
 * The runtime keeps the executor's ForceEnd callback until completion.
 */
export interface WaitForClick {
  handleClick: (finishCommand: FinishCommand) => void;
  forceEnd?: () => void;
}

export interface WaitForDecision {
  showDecision: (onSelect: (selection: DecisionSelection) => void) => void;
  applySelection: (selection: DecisionSelection) => void;
  closeDecision: () => void;
}

/** Completion is checked after Update and before the scene is drawn. */
export interface WaitForFrame {
  isComplete: (nowMs: number) => boolean;
  forceEnd?: () => void;
}

export type CommandWait = WaitForClick | WaitForDecision | WaitForFrame;
export type CommandResult = "continue" | CommandWait;

export type CommandExecutor<TResult> = (
  command: ParsedCommandLine,
  isCurrent?: () => boolean,
) => TResult | Promise<TResult>;

/**
 * Native provenance: `Torappu.AVG.AVGController._InitExecutors`,
 * `_GetCommandExecutors`, and `_ExecuteExecutor`.
 *
 * Ports the lower-cased command-key lookup and the fact that several active
 * `ExecutorComponent.GetExecutors` registrations may subscribe to one command.
 * Waiting/force-end policy remains in `StoryRuntime`; this is only the web
 * dispatch container.
 *
 */
export class CommandRegistry<TResult> {
  private readonly executors = new Map<
    string,
    Array<CommandExecutor<TResult>>
  >();

  register(command: string, executor: CommandExecutor<TResult>): () => void {
    const key = command.toLowerCase();
    const list = this.executors.get(key) ?? [];
    list.push(executor);
    this.executors.set(key, list);
    return () => {
      const current = this.executors.get(key);
      if (!current) return;
      const index = current.indexOf(executor);
      if (index !== -1) current.splice(index, 1);
      if (current.length === 0) this.executors.delete(key);
    };
  }

  has(command: string): boolean {
    return this.executors.has(command.toLowerCase());
  }

  get(command: string): ReadonlyArray<CommandExecutor<TResult>> | null {
    const list = this.executors.get(command.toLowerCase());
    return list ? [...list] : null;
  }
}
