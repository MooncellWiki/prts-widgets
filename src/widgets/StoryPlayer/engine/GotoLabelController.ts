import { ExecutorComponent, type PanelExecutors } from "./ExecutorComponent";
import { exactArg, toString } from "./commandParams";

import type { ParsedLine } from "./types";

/**
 * Torappu.AVG.AVGGotoLabel.GetExecutors (2791 @ 0x1841AB350) registers
 * label and warp. The Web instance owns the command group and its flow
 * controller for one story. ShouldResetOnSkip (0x1841AB610) keeps both
 * the label map and the pending jump across segment skips.
 */
export class GotoLabelController extends ExecutorComponent {
  private readonly labels = new Map<string, number>();
  private pendingIndex: number | undefined;

  constructor(lines: readonly ParsedLine[]) {
    super();
    // GotoLabelController.PreprocessCommands (2791 @ 0x1841B4DA0):
    // index the label itself, with later definitions winning.
    for (const [index, line] of lines.entries()) {
      if (line.kind !== "command" || line.command !== "label") continue;
      const name = exactArg(line.args, "name");
      if (name !== undefined) this.labels.set(toString(name), index);
    }
  }

  protected getExecutors(): PanelExecutors {
    return {
      // AVGGotoLabel._ExecuteLabel (2791 @ 0x1841AB790) is a no-op.
      label: () => "continue",
      warp: ({ args }) => {
        // _ExecuteGoto (2791 @ 0x1841AB670) silently ignores missing targets.
        // The coroutine fetches the line after the label.
        const name = exactArg(args, "name");
        if (name !== undefined) {
          const index = this.labels.get(toString(name));
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
}
