import { TYPE_WRITER_ORIGIN_DELAY_MS } from "../commandParams";
import {
  buildTagStyles,
  parseRichChars,
  richCharsToTaggedText,
  type RichChar,
  type RichTagStyles,
} from "../richtext";

type RenderText = (
  text: string,
  tagStyles?: RichTagStyles,
  initial?: boolean,
) => void;

interface TypingSession {
  delayScale: number;
  onTypeEnd: () => void;
  render: RenderText;
  richChars: RichChar[];
  tagStyles: RichTagStyles;
}

/**
 * Native port: Torappu.AVG.AVGTypeWriterText's BeginText / AppendText,
 * TryFinish and Update. The web clock and tagged-text prefixes stand in for
 * Unity's Update and mesh reveal. Completion leaves input to AVGController.
 */
export class AVGTypeWriterText {
  private session: TypingSession | null = null;

  constructor(
    private readonly sleep: (ms: number) => Promise<void>,
    private readonly typeWriterDelayMs: () => number,
  ) {}

  get isTyping(): boolean {
    return this.session !== null;
  }

  /** For an append, startIndex is the visible length of the previous text. */
  beginText(
    text: string,
    {
      delayScale,
      onTypeEnd,
      render,
      startIndex,
    }: {
      delayScale: number;
      onTypeEnd: () => void;
      render: RenderText;
      startIndex: number;
    },
  ): number {
    this.stopTypingSilently();
    const richChars = parseRichChars(text);
    const tagStyles = buildTagStyles(richChars);
    const from = Math.min(Math.max(0, startIndex), richChars.length);
    if (from >= richChars.length || this.getDelayMs(delayScale) <= 0) {
      render(richCharsToTaggedText(richChars), tagStyles, true);
      onTypeEnd();
    } else {
      const session = { delayScale, onTypeEnd, render, richChars, tagStyles };
      this.session = session;
      render(richCharsToTaggedText(richChars.slice(0, from)), tagStyles, true);
      void this.runTyping(session, from);
    }
    return richChars.length;
  }

  tryFinish(): boolean {
    const session = this.session;
    if (!session) return false;
    this.stopTypingSilently();
    session.render(richCharsToTaggedText(session.richChars), session.tagStyles);
    session.onTypeEnd();
    return true;
  }

  stopTypingSilently(): void {
    this.session = null;
  }

  private getDelayMs(delayScale: number): number {
    const delayMs = this.typeWriterDelayMs() * delayScale;
    return delayMs < 0 ? TYPE_WRITER_ORIGIN_DELAY_MS : delayMs;
  }

  private async runTyping(session: TypingSession, from: number): Promise<void> {
    const { delayScale, onTypeEnd, render, richChars } = session;
    for (let index = from; index < richChars.length; index += 1) {
      if (this.session !== session) return;
      const delayMs = this.getDelayMs(delayScale);
      if (delayMs > 0) await this.sleep(delayMs);
      if (this.session !== session) return;
      render(richCharsToTaggedText(richChars.slice(0, index + 1)));
    }

    // Keep the web iterator's final step between reveal and completion.
    const finalDelayMs = this.getDelayMs(delayScale);
    if (finalDelayMs > 0) await this.sleep(finalDelayMs);
    if (this.session === session) {
      this.stopTypingSilently();
      onTypeEnd();
    }
  }
}
