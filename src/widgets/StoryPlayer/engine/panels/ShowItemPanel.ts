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
  /** Resolves to true if playback was interrupted before the animation ended. */
  waitForAnimation: (animation: Promise<void>) => Promise<boolean>;
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
  // Keep the slot occupied through the tween. A newer operation owns the
  // slot once it starts, so an older fade-out cannot clear that state.
  private slotInUse: symbol | null = null;

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
    this.slotInUse = null;
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
        const interrupted = await this.playback.waitForAnimation(
          this.fadeOut(fadeMs),
        );
        if (interrupted) return "continue";
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

    // _ShowItem (2791 @ 0x1841B1EC0) assigns the slot before starting Show.
    // SkipStory can release the command's wait while the slot is still live.
    this.slotInUse = Symbol();
    const animation = this.renderer.showItem({
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
    await this.playback.waitForAnimation(animation);
    return "continue";
  }

  private async executeHideItem(
    line: ParsedCommandLine,
  ): Promise<CommandResult> {
    // _ExecuteHideItem (2791 @ 0x1841B1910) blocks when _slotInUse exists.
    // The renderer uses this flag to wait for the fade and remove the slot.
    await this.playback.waitForAnimation(this.fadeOut(readFadeMs(line.args)));
    return "continue";
  }

  private async fadeOut(fadeMs: number): Promise<void> {
    const hasSlot = this.slotInUse !== null;
    const slot = hasSlot ? Symbol() : null;
    this.slotInUse = slot;
    await this.renderer.clearItems(fadeMs, hasSlot);
    if (this.slotInUse === slot) this.slotInUse = null;
  }
}
