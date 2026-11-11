import {
  exactArg,
  parseSubtitleAlignment,
  toNumber,
  toString,
} from "../commandParams";
import { AVGEvent, type EventPool } from "../eventPool";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type OverlayTextLayout,
  type ParsedCommandLine,
  type StoryRenderer,
} from "../types";

import { AVGTypeWriterText } from "./AVGTypeWriterText";

import type {
  CommandRegistry,
  CommandResult,
  WaitForClick,
} from "../commandRegistry";

interface SubtitlePlayback {
  beginTyping: (messageLength: number) => () => void;
  /** False if notifying the Web UI invalidated this line (skip or destroy). */
  setDisplayedLine: (lineNumber: number) => boolean;
  sleep: (ms: number) => Promise<void>;
  translateText: (text: string) => string;
  typeWriterDelayMs: () => number;
}

/**
 * Native port: Torappu.AVG.SubtitlePanel (2791 GetExecutors @ 0x1841E4C10).
 * The panel owns command parsing, the typewriter and input. SubtitleView
 * adapts the visual responsibilities to Pixi through StoryRenderer.
 */
export class SubtitlePanel {
  private readonly typeWriter: AVGTypeWriterText;

  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "clearSubtitle" | "setSubtitle"
    >,
    private readonly playback: SubtitlePlayback,
  ) {
    this.typeWriter = new AVGTypeWriterText(playback.sleep);
  }

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("subtitle", (line) => this.executeSubtitle(line));
  }

  /** Native OnStoryBegin / _SetTypeWriterDelay (2791 @ 0x1841E5010 / 0x1841E5D10). */
  onStoryBegin(eventPool: EventPool<AVGEvent>): void {
    eventPool.on(AVGEvent.SpeedSet, () =>
      this.typeWriter.setDelay(this.playback.typeWriterDelayMs()),
    );
  }

  /** Native OnReset (2791 @ 0x1841E4E50) immediately hides the panel. */
  reset(): Promise<void> | void {
    this.stopTypingSilently();
    return this.renderer.clearSubtitle(0);
  }

  stopTypingSilently(): void {
    this.typeWriter.stopTypingSilently();
  }

  /** Native _OnClicked: one click finishes typing, the next finishes the command. */
  private readonly clickWait: WaitForClick = {
    handleClick: (finishCommand) => {
      if (!this.typeWriter.tryFinish()) finishCommand();
    },
    // Native ForceCommandEnd (2791 @ 0x1841E4BA0) leaves visibility to OnReset.
    forceEnd: () => this.typeWriter.tryFinish(),
  };

  private executeSubtitle(line: ParsedCommandLine): CommandResult {
    // _ExecuteSubtitle (2791 @ 0x1841E5320) ignores the script's delay.
    const { args } = line;
    const text = this.playback.translateText(toString(exactArg(args, "text")));
    if (!text) {
      this.stopTypingSilently();
      void this.renderer.clearSubtitle(150);
      return "continue";
    }

    const x = toNumber(exactArg(args, "x"), 0);
    const y = toNumber(exactArg(args, "y"), 0);
    if (x < 0 || x > STORY_WIDTH || y < 0 || y > STORY_HEIGHT)
      return "continue";
    if (!this.playback.setDisplayedLine(line.lineNumber)) return "continue";

    const layout: OverlayTextLayout = {
      alignment: parseSubtitleAlignment(exactArg(args, "alignment")) ?? "left",
      sizePx: toNumber(exactArg(args, "size"), 24),
      widthPx: Math.min(
        toNumber(exactArg(args, "width"), STORY_WIDTH),
        STORY_WIDTH - x,
      ),
      x,
      y,
    };
    this.typeWriter.beginText(text, {
      delayMs: this.playback.typeWriterDelayMs(),
      // _OnTypeWriterEnd (2791 @ 0x1841E5A20) bills the raw length.
      onTypeEnd: this.playback.beginTyping(text.length),
      render: (message, initial) =>
        this.renderer.setSubtitle(message, initial ? layout : undefined),
      startIndex: 0,
    });
    return this.clickWait;
  }
}
