import { exactArg, toNumber, toString } from "../commandParams";
import { parseShowItemFadeStyle } from "../showitem";

import type { CommandRegistry, CommandResult } from "../commandRegistry";
import type {
  ParsedCommandLine,
  StoryCommandArgs,
  StoryRenderer,
} from "../types";

interface ShowItemPlayback {
  resolveImageKey: (key: string) => string | null;
  warnInvalidParameter: (detail: string, line: ParsedCommandLine) => void;
}

/** Both native slots default to 0.5s and read fadetime without animateRatio. */
function readFadeMs(args: StoryCommandArgs): number {
  return Math.max(
    0,
    Math.round(toNumber(exactArg(args, "fadetime"), 0.5) * 1000),
  );
}

/**
 * Native port: Torappu.AVG.AVGShowItemPanel (2791 GetExecutors @ 0x1841B1690).
 * The Web panel tracks whether the single slot is occupied. StoryRenderer
 * owns its visual state and resolves the promises that stand in for FinishCommand.
 */
export class ShowItemPanel {
  private slotInUse = false;

  constructor(
    private readonly renderer: Pick<StoryRenderer, "clearItems" | "showItem">,
    private readonly playback: ShowItemPlayback,
  ) {}

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("showitem", (line) => this.executeShowItem(line));
    registry.register("hideitem", (line) => this.executeHideItem(line));
  }

  /**
   * Native OnReset → _Reset (2791 @ 0x1841B1820 / 0x1841B1DE0) destroys
   * an occupied slot immediately. ShouldResetOnSkip defaults to false, so
   * the runtime calls reset at story end and keeps the slot on segment jumps.
   */
  reset(): void {
    if (!this.slotInUse) return;
    this.slotInUse = false;
    void this.renderer.clearItems(0);
  }

  private async executeShowItem(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    const { args } = line;
    const fadeMs = readFadeMs(args);
    const style = toString(exactArg(args, "style"), "photo");
    if (style !== "photo" && style !== "cutin") {
      // The replacement callback (2791 @ 0x1841B6290) hides and resets
      // the old slot before _ShowItem attempts its style lookup.
      if (this.slotInUse) {
        this.slotInUse = false;
        await this.renderer.clearItems(fadeMs, true);
      }
      this.playback.warnInvalidParameter(
        `showitem style is not registered: ${style}`,
        line,
      );
      return "continue";
    }

    // Native _ShowItem still creates a slot when the sprite is missing. A
    // null key uses the renderer's 100×100 placeholder path.
    const key = this.playback.resolveImageKey(
      toString(exactArg(args, "image")),
    );
    if (!key)
      this.playback.warnInvalidParameter("showitem: image is empty", line);

    // _ExecuteShowItem (2791 @ 0x1841B1A40) waits for the slot's animation.
    // The renderer also fades out an existing slot using the new fadetime.
    await this.renderer.showItem({
      // Native SetAlpha takes the unclamped value; the renderer clamps at blend.
      blackAlpha: toNumber(exactArg(args, "black"), 0.4),
      block: true,
      fadeMs,
      fadeStyle: parseShowItemFadeStyle(toString(exactArg(args, "fadestyle"))),
      key,
      offsetX: toNumber(exactArg(args, "offsetx"), 0),
      offsetY: toNumber(exactArg(args, "offsety"), 0),
      style,
      width: toNumber(exactArg(args, "width"), Number.NaN),
    });
    this.slotInUse = true;
    return "continue";
  }

  private async executeHideItem(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    // _ExecuteHideItem (2791 @ 0x1841B1910) blocks when _slotInUse exists.
    // The renderer uses this flag to wait for the fade and remove the slot.
    const hadSlot = this.slotInUse;
    this.slotInUse = false;
    await this.renderer.clearItems(readFadeMs(line.args), hadSlot);
    return "continue";
  }
}
