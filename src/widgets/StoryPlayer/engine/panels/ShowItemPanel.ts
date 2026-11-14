import {
  ExecutorComponent,
  type ExecutorResult,
  type PanelExecutors,
} from "../ExecutorComponent";
import { exactArg, toString } from "../commandParams";
import { createExecutionHandle, type ExecutionHandle } from "../execution";

import type {
  ParsedCommandLine,
  StoryRenderer,
  StoryShowItemSlot,
} from "../types";

interface ShowItemPlayback {
  resolveImageKey: (key: string) => string | null;
  warnInvalidParameter: (detail: string, line: ParsedCommandLine) => void;
}

/** Native port: Torappu.AVG.AVGShowItemPanel (2791 GetExecutors @ 0x1841B1690). */
export class ShowItemPanel extends ExecutorComponent {
  private slotInUse: StoryShowItemSlot | null = null;

  constructor(
    private readonly renderer: Pick<StoryRenderer, "createShowItemSlot">,
    private readonly playback: ShowItemPlayback,
  ) {
    super();
  }

  protected getExecutors(): PanelExecutors {
    return {
      hideitem: (line) => this.executeHideItem(line),
      showitem: (line) => this.executeShowItem(line),
    };
  }

  /**
   * OnReset → _Reset (2791 @ 0x1841B1820 / 0x1841B1DE0). Segment jumps
   * release the command wait and leave the slot alone (ShouldResetOnSkip).
   */
  reset(): void {
    const slot = this.slotInUse;
    this.slotInUse = null;
    slot?.destroy();
  }

  private executeShowItem(line: ParsedCommandLine): ExecutorResult {
    const animation = createExecutionHandle(true);
    const show = () => {
      try {
        this.showItem(line, animation);
      } catch (error) {
        animation.fail(error);
      }
    };
    // _ExecuteShowItem @ 0x1841B1A40 gives the new command to the old slot.
    // Its Hide callback resets the slot before the new style lookup.
    if (this.slotInUse) this.hideItem(this.slotInUse, line, show);
    else show();
    // The slot owns replacement callbacks. After SkipStory, the destination
    // can start its Hide before the previous Web animation has settled.
    return animation.endReason === "complete"
      ? "continue"
      : { animation, block: true };
  }

  private showItem(line: ParsedCommandLine, animation: ExecutionHandle): void {
    const styleArg = exactArg(line.args, "style");
    const style = styleArg === undefined ? "photo" : toString(styleArg);
    const slot = this.renderer.createShowItemSlot(style);
    if (!slot) {
      this.playback.warnInvalidParameter(
        `showitem style is not registered: ${style}`,
        line,
      );
      animation.end();
      return;
    }

    // _ShowItem @ 0x1841B1EC0 registers the new slot before loading the sprite.
    this.slotInUse = slot;
    const fail = (error: unknown) => {
      if (this.slotInUse === slot) this.reset();
      animation.fail(error);
    };
    try {
      const key = this.playback.resolveImageKey(
        toString(exactArg(line.args, "image")),
      );
      if (!key)
        this.playback.warnInvalidParameter("showitem: image is empty", line);
      const prepare = slot.show(line.args, key, () => animation.end());
      if (prepare) void prepare.catch(fail);
    } catch (error) {
      fail(error);
    }
  }

  private executeHideItem(line: ParsedCommandLine): ExecutorResult {
    // _ExecuteHideItem @ 0x1841B1910 returns immediately without a live slot.
    const slot = this.slotInUse;
    if (!slot) return "continue";
    const animation = createExecutionHandle(true);
    this.hideItem(slot, line, () => animation.end());
    return { animation, block: true };
  }

  private hideItem(
    slot: StoryShowItemSlot,
    line: ParsedCommandLine,
    finish: () => void,
  ): void {
    slot.hide(line.args, () => {
      if (this.slotInUse !== slot) return;
      this.reset();
      finish();
    });
  }
}
