import { Text, type TextStyle } from "pixi.js";

import {
  buildTagStyles,
  parseRichChars,
  richCharsToTaggedText,
  type RichChar,
} from "../../richtext";

import type { StickerInput, StickerTweenInput } from "../../types";

interface StickerViewHost {
  isActive: () => boolean;
  createOverlayTextStyle: (size: number, width: number) => TextStyle;
  layoutSubtitle: (
    text: Text,
    x: number,
    width: number,
    alignment: StickerInput["alignment"],
  ) => void;
  tween: (
    duration: number,
    step: (progress: number) => void,
    done?: () => void,
  ) => Promise<void>;
}
/**
 * One accumulated SequenceBuilder.Push step of a sticker tween, in native
 * push order (position, rotation, alpha). `join` and the per-kind payload
 * mirror Torappu.AVG's AnimStep { spec, join, seqEnd } composition.
 */
type StickerTweenStepInput =
  | {
      durationMs: number;
      from: { x: number; y: number };
      join: boolean;
      kind: "position";
      to: { x: number; y: number };
    }
  | {
      durationMs: number;
      from: number;
      join: boolean;
      kind: "alpha";
      to: number;
    }
  | {
      durationMs: number;
      from: number;
      join: boolean;
      kind: "rotation";
      to: number;
    };

/**
 * Native provenance: AVGStickerTextView (2791 RenderSticker 0x1842459B0).
 * One view owns its text, typing, fade and queued tween lifecycle. Browser
 * timers and the renderer's TweenRunner replace Unity/DOTween scheduling.
 */
export class StickerView {
  // Web adaptation: retain the old pending-target Map insertion order across
  // views, independently of the order in which their ids were first created.
  private static nextTypingOrder = 0;
  private typingOrderValue = 0;
  readonly text: Text;
  private destroyed = false;
  private fadeSession = 0;
  private typingSession = 0;
  private tweenSession = 0;
  private richChars: RichChar[] | null = null;
  private tweenQueue: StickerTweenStepInput[] = [];
  private typingTarget: {
    alignment: StickerInput["alignment"];
    baseX: number;
    fullText: string;
    widthPx: number;
  } | null = null;

  constructor(private readonly host: StickerViewHost) {
    this.text = new Text({
      style: host.createOverlayTextStyle(18, 675),
      text: "",
    });
    this.text.visible = false;
  }

  get typingOrder(): number {
    return this.typingOrderValue;
  }

  get isTyping(): boolean {
    return this.typingTarget !== null;
  }

  /** Forced completion never fires the natural type-end callback. */
  finishTyping(): boolean {
    const target = this.typingTarget;
    if (!target) return false;
    this.typingSession += 1;
    this.text.text = target.fullText;
    this.host.layoutSubtitle(
      this.text,
      target.baseX,
      target.widthPx,
      target.alignment,
    );
    this.typingTarget = null;
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.invalidate();
    this.typingTarget = null;
    this.tweenQueue = [];
    this.text.destroy();
  }

  private invalidate(): void {
    this.typingSession += 1;
    this.fadeSession += 1;
    // RenderSticker/HideSticker kill the current tween; ForceEnd only types.
    this.tweenSession += 1;
  }

  async show(input: StickerInput): Promise<void> {
    const sticker = this.text;
    const wasActive = this.richChars !== null;
    this.invalidate();
    sticker.alpha = wasActive ? sticker.alpha : 0;
    sticker.visible = true;

    if (!wasActive) {
      const fadeSessionId = this.fadeSession;
      void this.host.tween(
        input.fadeMs,
        (progress) => {
          if (this.fadeSession === fadeSessionId) sticker.alpha = progress;
        },
        () => {
          if (this.fadeSession === fadeSessionId) sticker.alpha = 1;
        },
      );
    }

    const prevChars = input.append ? (this.richChars ?? []) : [];
    const newChars = parseRichChars(input.text);
    const allChars = [...prevChars, ...newChars];
    this.richChars = allChars;

    const style = this.host.createOverlayTextStyle(input.sizePx, input.widthPx);
    style.tagStyles = buildTagStyles(allChars);
    sticker.style = style;
    sticker.y = input.y;

    const fullText = richCharsToTaggedText(allChars);
    if (input.delayMs <= 0) {
      sticker.text = fullText;
      this.host.layoutSubtitle(
        sticker,
        input.x,
        input.widthPx,
        input.alignment,
      );
      input.onTypingComplete?.();
      return;
    }

    const sessionId = this.typingSession;
    sticker.text = richCharsToTaggedText(prevChars);
    this.host.layoutSubtitle(sticker, input.x, input.widthPx, input.alignment);
    if (!this.typingTarget)
      this.typingOrderValue = ++StickerView.nextTypingOrder;
    this.typingTarget = {
      alignment: input.alignment,
      baseX: input.x,
      fullText,
      widthPx: input.widthPx,
    };
    void this.runStickerTyping(sessionId, sticker, {
      alignment: input.alignment,
      baseX: input.x,
      delayMs: input.delayMs,
      prevChars,
      newChars,
      onTypingComplete: input.onTypingComplete,
      widthPx: input.widthPx,
    });
  }

  hide(fadeMs: number, finishTyping: boolean): void {
    const sticker = this.text;

    this.invalidate();
    const typingTarget = this.typingTarget;
    if (finishTyping && typingTarget) {
      sticker.text = typingTarget.fullText;
      this.host.layoutSubtitle(
        sticker,
        typingTarget.baseX,
        typingTarget.widthPx,
        typingTarget.alignment,
      );
    }
    this.typingTarget = null;
    this.richChars = null;
    if (!sticker.visible || !sticker.text) {
      sticker.text = "";
      sticker.visible = false;
      sticker.alpha = 1;
      return;
    }

    const sessionId = this.fadeSession;
    const startAlpha = sticker.alpha;
    if (fadeMs <= 0) {
      sticker.text = "";
      sticker.visible = false;
      sticker.alpha = 1;
      return;
    }

    void this.host.tween(
      fadeMs,
      (progress) => {
        if (this.fadeSession !== sessionId) return;
        sticker.alpha = startAlpha * (1 - progress);
      },
      () => {
        if (this.fadeSession !== sessionId) return;
        sticker.text = "";
        sticker.visible = false;
        sticker.alpha = 1;
      },
    );
  }

  /**
   * Native port: Torappu.AVG.StickerPanel._ExecuteStickerTween (2.7.61 build
   * 2761, VA 0x183e92110) driving AVGStickerTextView.ExecuteTween<T>
   * (VA 0x184165be0 / 0x184165940). Each non-empty group is one
   * SequenceBuilder.Push step in native order (position, rotation, alpha);
   * `isend=false` steps only accumulate, and the first `isend=true` command
   * builds and plays the whole sequence -- mirrored here by a per-view pending
   * queue. Web adaptation: instead of a DOTween Sequence, every step gets a
   * time window inside a single tween of the total duration; a `join` step
   * starts when the previous step started, otherwise after it ends (DOTween
   * Join vs Append). Durations were already animateRatio-scaled by the
   * StickerPanel, which is the documented visual equivalent of the native
   * `Sequence.timeScale = animateRatio` assignment. Rotation is degrees in
   * native localEulerAngles and radians in pixi, hence the conversion.
   */
  executeTween(input: StickerTweenInput): void {
    const queue = this.tweenQueue;
    if (input.position)
      queue.push({ ...input.position, join: input.join, kind: "position" });
    if (input.rotation)
      queue.push({ ...input.rotation, join: input.join, kind: "rotation" });
    if (input.alpha)
      queue.push({ ...input.alpha, join: input.join, kind: "alpha" });

    if (!input.isend) {
      this.tweenQueue = queue;
      return;
    }

    this.tweenQueue = [];
    const sticker = this.text;
    if (queue.length === 0) return;

    // Starting a new sequence bumps the session: older in-flight sticker
    // tweens for this id stop applying (native lets two sequences fight over
    // the transform; skipping that glitch is a deliberate web adaptation).
    const sessionId = this.tweenSession + 1;
    this.tweenSession = sessionId;
    const isCurrent = () => this.tweenSession === sessionId;

    const steps = queue;

    // Append/Join scheduling: `join` shares the previous step's start,
    // everything else starts after the longest step of its segment ends.
    const windows: Array<{ start: number; step: (typeof steps)[number] }> = [];
    let segmentStart = 0;
    let segmentLongest = 0;
    let open = false;
    for (const step of steps) {
      if (!open || !step.join) {
        segmentStart += segmentLongest;
        segmentLongest = 0;
        open = true;
      }
      windows.push({ start: segmentStart, step });
      segmentLongest = Math.max(segmentLongest, step.durationMs);
    }
    const totalMs = segmentStart + segmentLongest;

    const apply = (step: (typeof steps)[number], progress: number): void => {
      if (step.kind === "position") {
        sticker.x = step.from.x + (step.to.x - step.from.x) * progress;
        sticker.y = step.from.y + (step.to.y - step.from.y) * progress;
        return;
      }
      if (step.kind === "alpha") {
        sticker.alpha = step.from + (step.to - step.from) * progress;
        return;
      }
      const deg = step.from + (step.to - step.from) * progress;
      sticker.rotation = (deg * Math.PI) / 180;
    };

    // `BuildSequence` creates every tween up front, and each
    // `AVGTweenFactory._Create*Tween` snaps the transform to that step's
    // `from` right there -- before the sequence plays and regardless of when
    // the step's own window opens. So all the snaps happen now, and the
    // clamped window below keeps a not-yet-started step pinned to `from`.
    for (const { step } of windows) apply(step, 0);

    void this.host.tween(
      totalMs,
      (progress) => {
        if (!isCurrent()) return;
        const elapsed = progress * totalMs;
        for (const { start, step } of windows) {
          const local =
            step.durationMs <= 0
              ? 1
              : Math.min(1, Math.max(0, (elapsed - start) / step.durationMs));
          apply(step, local);
        }
      },
      () => {
        if (!isCurrent()) return;
        for (const { step } of windows) apply(step, 1);
      },
    );
  }

  private async runStickerTyping(
    sessionId: number,
    sticker: Text,
    input: {
      alignment: StickerInput["alignment"];
      baseX: number;
      delayMs: number;
      prevChars: RichChar[];
      newChars: RichChar[];
      onTypingComplete?: () => void;
      widthPx: number;
    },
  ): Promise<void> {
    for (let index = 0; index < input.newChars.length; index += 1) {
      if (
        !this.host.isActive() ||
        this.destroyed ||
        this.typingSession !== sessionId
      )
        return;

      await new Promise((resolve) => setTimeout(resolve, input.delayMs));

      if (
        !this.host.isActive() ||
        this.destroyed ||
        this.typingSession !== sessionId
      )
        return;

      sticker.text = richCharsToTaggedText([
        ...input.prevChars,
        ...input.newChars.slice(0, index + 1),
      ]);
      this.host.layoutSubtitle(
        sticker,
        input.baseX,
        input.widthPx,
        input.alignment,
      );
    }

    if (this.typingSession === sessionId) {
      this.typingTarget = null;
      // Native `AVGStickerTextView._OnTypeWriterEnd` -> m_OnTypeEnd: only
      // typing that ends on its own raises the auto click here.
      input.onTypingComplete?.();
    }
  }
}
