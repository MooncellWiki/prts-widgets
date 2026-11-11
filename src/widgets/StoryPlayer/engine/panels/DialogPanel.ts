import {
  exactArg,
  toBoolean,
  toNumber,
  toString,
  TYPE_WRITER_ORIGIN_DELAY_MS,
} from "../commandParams";
import { AVGEvent, type EventPool } from "../eventPool";
import { parseRichChars } from "../richtext";

import { AVGTypeWriterText } from "./AVGTypeWriterText";

import type {
  CommandRegistry,
  CommandResult,
  WaitForClick,
} from "../commandRegistry";
import type {
  DialogueLayout,
  ParsedCommandLine,
  ParsedDialogueLine,
  ParsedNarrationLine,
  StoryRenderer,
} from "../types";

interface DialogPlayback {
  beginTyping: (messageLength: number) => () => void;
  prepareEndtip: () => boolean;
  setDisplayedLine: (lineNumber: number) => void;
  sleep: (ms: number) => Promise<void>;
  translateText: (text: string) => string;
  typeWriterDelayMs: () => number;
}

/**
 * Native port: Torappu.AVG.DialogPanel (2791 GetExecutors @ 0x1841C84C0).
 * Owns the dialog commands, multiline run and click/force-end lifecycle.
 * The web adapter renders through StoryRenderer and leaves input arbitration
 * and RaiseAutoClick scheduling to StoryRuntime.
 */
export class DialogPanel {
  private readonly typeWriter: AVGTypeWriterText;
  private destroyed = false;
  private multilineText = "";
  private multilineEnd = false;
  /** Visible length of the preceding fragments, excluding rich-text tags. */
  private multilineShownChars = 0;

  constructor(
    private readonly renderer: Pick<
      StoryRenderer,
      "setDialogue" | "hideDialogue" | "finishDialogueCommand"
    >,
    private readonly playback: DialogPlayback,
  ) {
    this.typeWriter = new AVGTypeWriterText(playback.sleep);
  }

  register(registry: CommandRegistry<CommandResult>): void {
    registry.register("dialog", (line) =>
      this.executeDialog(
        toString(exactArg(line.args, "name")),
        line.content,
        line.lineNumber,
      ),
    );
    registry.register("aside", (line) =>
      this.executeDialog("", line.content, line.lineNumber, "aside"),
    );
    registry.register("multiline", (line) => this.executeMultiline(line));
    registry.register("endtip", (line) => this.executeEndtip(line));
  }

  /** The web parser also represents name tags and bare narration as text lines. */
  executeTextLine(
    line: ParsedDialogueLine | ParsedNarrationLine,
  ): CommandResult {
    if (line.kind === "narration" && !line.text) return "continue";
    return this.executeDialog(
      line.kind === "dialogue" ? line.speaker : "",
      line.text,
      line.lineNumber,
    );
  }

  /** Native _OnClicked (2791 @ 0x1841CAD30) and OnFinish. */
  private readonly onClick: WaitForClick = (finishCommand) => {
    const finishedTyping = this.typeWriter.tryFinish();
    if (this.multilineEnd) this.resetMultiline();
    if (finishedTyping) return;
    finishCommand({ onFinish: () => this.renderer.finishDialogueCommand() });
  };

  /**
   * Native ForceCommandEnd (2791 @ 0x1841C8440) reveals the line and restores
   * its width. StoryRuntime invalidates the interrupted line's callback
   * before force-ending. ShouldResetOnSkip is false, so the multiline run
   * remains available to the next command after the jump.
   */
  forceCommandEnd(): void {
    this.typeWriter.tryFinish();
    this.renderer.finishDialogueCommand();
  }

  /** Native _SetTypeWriterDelay (2791 @ 0x1841CB4C0) handles ON_SPEED_SET. */
  onStoryBegin(eventPool: EventPool<AVGEvent>): void {
    eventPool.on(AVGEvent.SpeedSet, () =>
      this.typeWriter.setDelay(this.playback.typeWriterDelayMs()),
    );
  }

  stopTypingSilently(): void {
    this.typeWriter.stopTypingSilently();
  }

  destroy(): void {
    this.destroyed = true;
    this.stopTypingSilently();
  }

  private executeDialog(
    speaker: string,
    text: string,
    lineNumber: number,
    executor: "dialog" | "aside" = "dialog",
  ): CommandResult {
    // _ExecuteDialog and _ExecuteAside hide on empty content. Only a new
    // content-bearing command resets the accumulated multiline.
    if (!text) {
      this.stopTypingSilently();
      this.renderer.hideDialogue();
      return "continue";
    }
    this.resetMultiline();
    this.playback.setDisplayedLine(lineNumber);
    this.beginText(speaker, text, executor);
    return this.onClick;
  }

  private executeMultiline(line: ParsedCommandLine): CommandResult {
    const text = line.trailingText;
    if (!text) {
      this.renderer.hideDialogue();
      return "continue";
    }
    this.multilineText += text;
    this.multilineEnd = toBoolean(exactArg(line.args, "end"), false);
    this.playback.setDisplayedLine(line.lineNumber);
    // _ExecuteMultiline defaults `delay` to the current global delay in
    // seconds before dividing by originDelay (40ms). A missing delay at
    // button-auto level 1 therefore types at 0.25x the usual interval.
    const delaySeconds = toNumber(
      exactArg(line.args, "delay"),
      this.playback.typeWriterDelayMs() / 1000,
    );
    this.multilineShownChars = this.beginText(
      toString(exactArg(line.args, "name")),
      this.multilineText,
      "multiline",
      {
        delayScale: delaySeconds / (TYPE_WRITER_ORIGIN_DELAY_MS / 1000),
        layoutText: text,
        startIndex: this.multilineShownChars,
      },
    );
    return this.onClick;
  }

  private executeEndtip(line: ParsedCommandLine): CommandResult {
    // _ExecuteEndtip (2791 @ 0x1841CA2D0) gates on shouldProcessEndtip and
    // switches to manual. The implicit endtip has empty content, which still
    // shows the frame and waits for a click.
    if (!this.playback.prepareEndtip()) return "continue";
    this.resetMultiline();
    this.beginText("", line.content, "endtip");
    return this.onClick;
  }

  private beginText(
    speaker: string,
    text: string,
    executor: DialogueLayout["executor"],
    { delayScale = 1, layoutText = text, startIndex = 0 } = {},
  ): number {
    // A displayed-line listener can destroy the player before typing starts.
    if (this.destroyed) return 0;
    const translatedSpeaker = this.playback.translateText(speaker);
    const translatedText = this.playback.translateText(text);
    // _CalcMessageLayoutDelta runs on command.content, which is only the
    // latest fragment for multiline. Subsequent reveals keep this layout.
    const layout: DialogueLayout = {
      executor,
      text: parseRichChars(this.playback.translateText(layoutText))
        .map(({ char }) => char)
        .join(""),
    };
    // Native _OnTypeWriterEnd (2791 @ 0x1841CAE40) passes messageLength to
    // RaiseAutoClick. Count the translated string including markup.
    return this.typeWriter.beginText(translatedText, {
      delayMs: this.playback.typeWriterDelayMs() * delayScale,
      onTypeEnd: this.playback.beginTyping(translatedText.length),
      render: (message, initial) =>
        this.renderer.setDialogue(
          translatedSpeaker,
          message,
          initial ? layout : undefined,
        ),
      startIndex,
    });
  }

  private resetMultiline(): void {
    this.multilineText = "";
    this.multilineEnd = false;
    this.multilineShownChars = 0;
  }
}
