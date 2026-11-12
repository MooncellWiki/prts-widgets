import { TYPE_WRITER_ORIGIN_DELAY_MS } from "../commandParams";
import { parseRichChars } from "../richtext";

import type { TypewriterText } from "../types";

type RenderText = (text: TypewriterText, initial?: boolean) => void;

const MAX_TIMEOUT_MS = 2_147_483_647;

interface TypingSession {
  chars: TypewriterText["chars"];
  delayMs: number;
  endStep: number;
  iteratorSteps?: readonly number[];
  onTypeEnd: () => void;
  render: RenderText;
  step: number;
  wake?: () => void;
}

/**
 * Native port: Torappu.AVG.AVGTypeWriterText's BeginText / AppendText,
 * TryFinish and Update. Browser timers advance the reveal by character
 * count for both the mesh and string iterator paths.
 */
export class AVGTypeWriterText {
  private session: TypingSession | null = null;

  constructor(private readonly sleep: (ms: number) => Promise<void>) {}

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
      deferZeroDelay = false,
      iteratorSteps,
      onTypeEnd,
      render,
      startIndex,
    }: {
      delayMs: number;
      deferZeroDelay?: boolean;
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
    const interval = delayMs < 0 ? TYPE_WRITER_ORIGIN_DELAY_MS : delayMs;
    // The 2791 mesh path completes on the last quad (0x184250AA0). The
    // sticker's string iterators (0x18425E880 / 0x18425E2A0) yield the
    // full message again and then return false to signal completion.
    const endStep = iteratorSteps ? iteratorSteps.length + 2 : chars.length;
    if (
      !iteratorSteps &&
      (step === endStep || (interval === 0 && !deferZeroDelay))
    ) {
      render({ chars, visibleCount: chars.length }, true);
      onTypeEnd();
    } else {
      const session: TypingSession = {
        chars,
        delayMs: interval,
        endStep,
        iteratorSteps,
        onTypeEnd,
        render,
        step,
      };
      this.session = session;
      render({ chars, visibleCount: this.visibleCount(session) }, true);
      void this.runTyping(session);
    }
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
    session?.wake?.();
  }

  /** Native set_typeWriterDelay replaces the interval and keeps m_typerTime. */
  setDelay(delayMs: number): void {
    const session = this.session;
    if (!session || session.delayMs === delayMs) return;
    session.delayMs = delayMs;
    session.wake?.();
  }

  private visibleCount({ chars, iteratorSteps, step }: TypingSession): number {
    if (step === 0) return 0;
    return iteratorSteps ? (iteratorSteps[step - 1] ?? chars.length) : step;
  }

  private async runTyping(session: TypingSession): Promise<void> {
    const { chars, render } = session;
    let elapsedMs = 0;
    if (session.delayMs === 0) {
      // BeginText enters typing immediately. A later Update consumes the
      // zero-delay text and invokes the completion callback.
      const startedAt = performance.now();
      await this.sleep(0);
      elapsedMs = performance.now() - startedAt;
    }
    while (this.session === session) {
      const delayMs = session.delayMs;
      const waitMs = delayMs - elapsedMs;
      if (waitMs > 0) {
        const startedAt = performance.now();
        const interrupted = new Promise<number>((resolve) => {
          session.wake = () => resolve(performance.now() - startedAt);
        });
        if (Number.isFinite(waitMs)) {
          const timeoutMs = Math.min(waitMs, MAX_TIMEOUT_MS);
          elapsedMs += await Promise.race([
            this.sleep(timeoutMs).then(() =>
              Math.max(timeoutMs, performance.now() - startedAt),
            ),
            interrupted,
          ]);
        } else {
          // An infinite interval only wakes for a speed change or cancellation.
          elapsedMs += await interrupted;
        }
        session.wake = undefined;
        continue;
      }

      const remaining = session.endStep - session.step;
      const steps =
        delayMs > 0
          ? Math.min(remaining, Math.floor(elapsedMs / delayMs))
          : remaining;
      if (steps === remaining) {
        this.tryFinish();
        return;
      }
      elapsedMs -= steps * delayMs;
      const previousVisibleCount = this.visibleCount(session);
      session.step += steps;
      const visibleCount = this.visibleCount(session);
      if (visibleCount !== previousVisibleCount)
        render({ chars, visibleCount });
    }
  }
}
