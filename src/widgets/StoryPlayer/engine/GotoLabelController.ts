import { ExecutorComponent, type PanelExecutors } from "./ExecutorComponent";
import {
  boxedParamString,
  convertStoryParameter,
  exactArg,
} from "./commandParams";

import type { ParsedLine, StoryCommandArgs } from "./types";

/**
 * Torappu.AVG.AVGGotoLabel.GetExecutors (2791 @ 0x1841AB350) registers
 * label and warp. The Web instance owns the command group and its flow
 * controller for one story. ShouldResetOnSkip (0x1841AB610) keeps both
 * the label map and the pending jump across segment skips.
 */
export class GotoLabelController extends ExecutorComponent {
  private readonly labels = new Map<string, number>();
  private pendingIndex: number | undefined;

  constructor(
    lines: readonly ParsedLine[],
    private readonly variables?: Readonly<Record<string, unknown>>,
  ) {
    super();
    // GotoLabelController.PreprocessCommands (2791 @ 0x1841B4DA0):
    // index the label itself, with later definitions winning.
    for (const [index, line] of lines.entries()) {
      if (line.kind !== "command" || line.command !== "label") continue;
      const name = this.readName(line.args);
      if (name !== undefined) this.labels.set(name, index);
    }
  }

  protected getExecutors(): PanelExecutors {
    return {
      // AVGGotoLabel._ExecuteLabel (2791 @ 0x1841AB790) is a no-op.
      label: () => "continue",
      warp: ({ args }) => {
        // _ExecuteGoto (2791 @ 0x1841AB670) silently ignores missing targets.
        // The coroutine fetches the line after the label.
        const name = this.readName(args);
        if (name !== undefined) {
          const index = this.labels.get(name);
          if (index !== undefined) this.pendingIndex = index + 1;
        }
        return "continue";
      },
    };
  }

  /** GotoLabelController.GotoCommandIndex (2791 @ 0x1841B4D90). */
  consumeGotoIndex(): number | undefined {
    const index = this.pendingIndex;
    this.pendingIndex = undefined;
    return index;
  }

  private readName(args: StoryCommandArgs): string | undefined {
    // AVGParser._ParseCommand (2791 @ 0x1841CED60) expands variables before
    // Command.TryGetParam<string> (0x18419ACD0) stringifies the boxed value.
    const name = convertStoryParameter(
      exactArg(args, "name"),
      this.variables,
      "exact",
    );
    return name === undefined ? undefined : boxedParamString(name);
  }
}
