import { TYPE_WRITER_ORIGIN_DELAY_MS } from "../commandParams";
import { parseRichChars } from "../richtext";

import type { StoryRenderer, TypewriterText } from "../types";

type RenderText = (text: TypewriterText, initial?: boolean) => void;

interface TypingSession {
  cancelUpdate?: () => void;
  chars: TypewriterText["chars"];
  delayMs: number;
  elapsedMs: number;
  endStep: number;
  iteratorSteps?: readonly number[];
  onTypeEnd: () => void;
  render: RenderText;
  step: number;
}

/**
 * Native port: Torappu.AVG.AVGTypeWriterText's BeginText / AppendText,
 * TryFinish and Update (2791 @ 0x18424FA30). Update accumulates unscaled
 * frame time and consumes every reveal step whose interval has passed.
 */
export class AVGTypeWriterText {
  private session: TypingSession | null = null;

  constructor(private readonly onFrameUpdate: StoryRenderer["onFrameUpdate"]) {}

  get isTyping(): boolean {
    return this.session !== null;
  }

  get typingStep(): number | undefined {
    return this.session?.step;
  }

  /** For an append, startIndex is the previous reveal or iterator position. */
  beginText(
    text: string | TypewriterText["chars"],
    {
      delayMs,
      iteratorSteps,
      onTypeEnd,
      render,
      startIndex,
    }: {
      delayMs: number;
      iteratorSteps?: readonly number[];
      onTypeEnd: () => void;
      render: RenderText;
      startIndex: number;
    },
  ): number {
    this.stopTypingSilently();
    const chars = typeof text === "string" ? parseRichChars(text) : text;
    const step = Math.min(
      Math.max(0, startIndex),
      iteratorSteps?.length ?? chars.length,
    );
    // The 2791 mesh path completes on the last quad (0x184250AA0). The
    // sticker's string iterators (0x18425E880 / 0x18425E2A0) yield the
    // full message again and then return false to signal completion.
    const endStep = iteratorSteps ? iteratorSteps.length + 2 : chars.length;
    const session: TypingSession = {
      chars,
      delayMs,
      elapsedMs: 0,
      endStep,
      iteratorSteps,
      onTypeEnd,
      render,
      step,
    };
    this.session = session;
    render({ chars, visibleCount: this.visibleCount(session) }, true);
    if (this.session === session)
      session.cancelUpdate = this.onFrameUpdate(({ deltaMs }) =>
        this.update(session, deltaMs),
      );
    return chars.length;
  }

  tryFinish(invokeTypeEnd = true): boolean {
    const session = this.session;
    if (!session) return false;
    this.stopTypingSilently();
    session.render({
      chars: session.chars,
      visibleCount: session.chars.length,
    });
    if (invokeTypeEnd) session.onTypeEnd();
    return true;
  }

  stopTypingSilently(): void {
    const session = this.session;
    this.session = null;
    session?.cancelUpdate?.();
  }

  /** Native set_typeWriterDelay replaces the interval and keeps m_typerTime. */
  setDelay(delayMs: number): void {
    const session = this.session;
    if (session) session.delayMs = delayMs;
  }

  private visibleCount({ chars, iteratorSteps, step }: TypingSession): number {
    if (step === 0) return 0;
    return iteratorSteps ? (iteratorSteps[step - 1] ?? chars.length) : step;
  }

  private update(session: TypingSession, deltaMs: number): void {
    if (this.session !== session) return;
    const previousVisibleCount = this.visibleCount(session);
    const interval =
      session.delayMs < 0 ? TYPE_WRITER_ORIGIN_DELAY_MS : session.delayMs;
    session.elapsedMs += deltaMs;
    while (session.step < session.endStep && session.elapsedMs > interval) {
      session.elapsedMs -= interval;
      session.step += 1;
    }
    if (session.step === session.endStep) {
      this.tryFinish();
      return;
    }
    const visibleCount = this.visibleCount(session);
    if (visibleCount !== previousVisibleCount)
      session.render({ chars: session.chars, visibleCount });
  }
}
