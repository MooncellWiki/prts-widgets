import { exactArg, toString } from "../commandParams";

import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type {
  ParsedCommandLine,
  StoryRenderer,
  StoryShowItemSlot,
} from "../types";

interface ShowItemPlayback {
  resolveImageKey: (key: string) => string | null;
  waitForAnimation: (animation: Promise<void>) => Promise<boolean>;
  warnInvalidParameter: (detail: string, line: ParsedCommandLine) => void;
}

/** Native port: Torappu.AVG.AVGShowItemPanel (2791 GetExecutors @ 0x1841B1690). */
export class ShowItemPanel {
  private slotInUse: StoryShowItemSlot | null = null;

  constructor(
    private readonly renderer: Pick<StoryRenderer, "createShowItemSlot">,
    private readonly playback: ShowItemPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("showitem", (line) => this.executeShowItem(line));
    registry.register("hideitem", (line) => this.executeHideItem(line));
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

  private async executeShowItem(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    const animation = new Promise<void>((finish, reject) => {
      const show = () => {
        void this.showItem(line, finish).catch(reject);
      };
      // _ExecuteShowItem @ 0x1841B1A40 gives the new command to the old slot.
      // Its Hide callback resets the slot before the new style lookup.
      if (this.slotInUse) this.hideItem(this.slotInUse, line, show);
      else show();
    });
    await this.playback.waitForAnimation(animation);
    return "continue";
  }

  private async showItem(
    line: ParsedCommandLine,
    finish: () => void,
  ): Promise<void> {
    const styleArg = exactArg(line.args, "style");
    const style = styleArg === undefined ? "photo" : toString(styleArg);
    const slot = this.renderer.createShowItemSlot(style);
    if (!slot) {
      this.playback.warnInvalidParameter(
        `showitem style is not registered: ${style}`,
        line,
      );
      finish();
      return;
    }

    // _ShowItem @ 0x1841B1EC0 registers the new slot before loading the sprite.
    this.slotInUse = slot;
    const key = this.playback.resolveImageKey(
      toString(exactArg(line.args, "image")),
    );
    if (!key)
      this.playback.warnInvalidParameter("showitem: image is empty", line);
    try {
      await slot.show(line.args, key, finish);
    } catch (error) {
      if (this.slotInUse === slot) this.reset();
      throw error;
    }
  }

  private async executeHideItem(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    // _ExecuteHideItem @ 0x1841B1910 returns immediately without a live slot.
    const slot = this.slotInUse;
    if (slot) {
      await this.playback.waitForAnimation(
        new Promise<void>((finish) => this.hideItem(slot, line, finish)),
      );
    }
    return "continue";
  }

  private hideItem(
    slot: StoryShowItemSlot,
    line: ParsedCommandLine,
    finish: () => void,
  ): void {
    slot.hide(line.args, () => {
      this.reset();
      finish();
    });
  }
}
