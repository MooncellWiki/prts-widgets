import { TYPE_WRITER_ORIGIN_DELAY_MS } from "../commandParams";
import { parseRichChars } from "../richtext";

import type { DialogueText } from "../types";

type RenderText = (text: DialogueText, initial?: boolean) => void;

const MAX_TIMEOUT_MS = 2_147_483_647;

interface TypingSession {
  chars: DialogueText["chars"];
  delayMs: number;
  onTypeEnd: () => void;
  render: RenderText;
  visibleCount: number;
  wake?: () => void;
}

/**
 * Native port: Torappu.AVG.AVGTypeWriterText's BeginText / AppendText,
 * TryFinish and Update. DialogView uses the entire message for layout and
 * reveals it by character count in place of Unity's mesh quads.
 */
export class AVGTypeWriterText {
  private session: TypingSession | null = null;

  constructor(private readonly sleep: (ms: number) => Promise<void>) {}

  /** For an append, startIndex is the visible length of the previous text. */
  beginText(
    text: string,
    {
      delayMs,
      onTypeEnd,
      render,
      startIndex,
    }: {
      delayMs: number;
      onTypeEnd: () => void;
      render: RenderText;
      startIndex: number;
    },
  ): number {
    this.stopTypingSilently();
    const chars = parseRichChars(text);
    const visibleCount = Math.min(Math.max(0, startIndex), chars.length);
    const interval = delayMs < 0 ? TYPE_WRITER_ORIGIN_DELAY_MS : delayMs;
    if (visibleCount >= chars.length || !(interval > 0)) {
      render({ chars, visibleCount: chars.length }, true);
      onTypeEnd();
    } else {
      const session = {
        chars,
        delayMs: interval,
        onTypeEnd,
        render,
        visibleCount,
      };
      this.session = session;
      render({ chars, visibleCount }, true);
      void this.runTyping(session);
    }
    return chars.length;
  }

  tryFinish(): boolean {
    const session = this.session;
    if (!session) return false;
    this.stopTypingSilently();
    session.render({
      chars: session.chars,
      visibleCount: session.chars.length,
    });
    session.onTypeEnd();
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

  private async runTyping(session: TypingSession): Promise<void> {
    const { chars, render } = session;
    let elapsedMs = 0;
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

      const remaining = chars.length - session.visibleCount;
      const count =
        delayMs > 0
          ? Math.min(remaining, Math.floor(elapsedMs / delayMs))
          : remaining;
      if (count === remaining) {
        // 2791 _UpdateMeshRevealer (0x184250AA0) completes on the last quad.
        this.tryFinish();
        return;
      }
      elapsedMs -= count * delayMs;
      session.visibleCount += count;
      render({ chars, visibleCount: session.visibleCount });
    }
  }
}
