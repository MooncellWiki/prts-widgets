import { ExecutorComponent, type PanelExecutors } from "./ExecutorComponent";
import { exactArg } from "./commandParams";

import type { ParsedLine } from "./types";

type SkipMode = "skip" | "nofirstskip";

interface SkipNodeLabel {
  lineIndex: number;
  mode: SkipMode;
}

/**
 * Torappu.AVG.AVGSkipLabel.SkipLabelController.PreprocessCommands
 * (2791 @ 0x1841B5B30) delegates to AVGStoryCache.AddSkipNode
 * (0x1841B6710). The Web controller owns that queue and its current mode.
 */
export class SkipLabelController extends ExecutorComponent {
  private readonly nodes: SkipNodeLabel[] = [];
  private nextNodeIndex = 0;
  private currentMode: SkipMode = "skip";

  constructor(
    lines: readonly ParsedLine[],
    private readonly firstRead: boolean,
  ) {
    super();
    for (const [index, line] of lines.entries()) {
      if (line.kind !== "command" || line.command !== "skipnode") continue;
      // CalSkipMode (2791 @ 0x1841B69D0) matches the ordinal "nofirstskip".
      const mode =
        exactArg(line.args, "mode") === "nofirstskip" ? "nofirstskip" : "skip";
      this.nodes.push({ lineIndex: index, mode });
    }
  }

  protected getExecutors(): PanelExecutors {
    return {
      // AVGSkipLabel._ExecuteSkipNode (2791 @ 0x1841B25E0) takes the next
      // queued node on dispatch. SkipStory uses the same queue.
      skipnode: () => {
        this.consumeNextNode();
        return "continue";
      },
    };
  }

  /** A script with skip nodes still offers a final skip after the queue drains. */
  get hasSkipNodes(): boolean {
    return this.nodes.length > 0;
  }

  /** AVGStoryCache.CheckIfSkippableInCurMode (2791 @ 0x1841B6AA0). */
  get canSkipCurrentSegment(): boolean {
    return this.currentMode !== "nofirstskip" || !this.firstRead;
  }

  /** AVGStoryCache.GetNextSkipNode (2791 @ 0x1841B6C40). */
  consumeNextNode(): number | undefined {
    const node = this.nodes[this.nextNodeIndex];
    if (node) this.nextNodeIndex += 1;
    this.currentMode = node?.mode ?? "skip";
    return node?.lineIndex;
  }

  /** The SkipToThis path of AVGController.SkipStory clears the story cache. */
  reset(): void {
    this.nodes.length = 0;
    this.nextNodeIndex = 0;
    this.currentMode = "skip";
  }
}
