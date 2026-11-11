import { Container, Text, type TextStyle } from "pixi.js";

import { AVGTypeWriterText } from "../../panels/AVGTypeWriterText";
import {
  buildTagStyles,
  parseRichChars,
  richCharsToTaggedText,
  type RichChar,
} from "../../richtext";

import type { StickerInput, StickerTweenInput } from "../../types";

interface StickerViewHost {
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
 * push order (position, rotation, alpha, scale). `join` and the per-kind
 * payload mirror Torappu.AVG's AnimStep { spec, join, seqEnd } composition.
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
      kind: "alpha" | "rotation" | "scale";
      to: number;
    };

/**
 * Native provenance: AVGStickerTextView (2791 RenderSticker 0x1842459B0).
 * One view owns its text, typing, fade and queued tween lifecycle. Browser
 * timers and the renderer's TweenRunner replace Unity/DOTween scheduling.
 *
 * `root` stands in for the view's `_textTransform` + `_canvasGroup`: it sits
 * at the anchoredPosition RenderSticker writes (x, y), carries every tween
 * transform (AVGTweenFactory drives anchoredPosition / eulerAngles /
 * localScale on that rect and DOFade on the canvas group) and the fade alpha.
 * `text` is the `_message` inside the rect, offset only by its alignment
 * within `width`, so a position tween and the alignment layout never write
 * the same coordinate.
 */
export class StickerView {
  readonly root = new Container();
  readonly text: Text;
  private readonly typeWriter = new AVGTypeWriterText(
    (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  );
  private fadeSession = 0;
  private tweenSession = 0;
  private richChars: RichChar[] | null = null;
  private tweenQueue: StickerTweenStepInput[] = [];

  constructor(private readonly host: StickerViewHost) {
    this.text = new Text({
      style: host.createOverlayTextStyle(18, 675),
      text: "",
    });
    this.root.addChild(this.text);
    this.root.visible = false;
  }

  get isTyping(): boolean {
    return this.typeWriter.isTyping;
  }

  /** Native _OnClicked -> TryFinishType invokes the view's type-end callback. */
  finishTyping(): boolean {
    return this.typeWriter.tryFinish();
  }

  setTypeWriterDelay(delayMs: number): void {
    this.typeWriter.setDelay(delayMs);
  }

  destroy(): void {
    this.invalidate();
    this.typeWriter.stopTypingSilently();
    this.tweenQueue = [];
    this.root.destroy({ children: true });
  }

  private invalidate(): void {
    this.fadeSession += 1;
    // RenderSticker/HideSticker kill the current tween; ForceEnd only types.
    this.tweenSession += 1;
  }

  /**
   * Native `_ResetStickerTransform` (0x1842464B0): restores the base
   * localRotation / localScale cached on the first RenderSticker -- identity
   * for the prefab. Position is not part of it; RenderSticker rewrites the
   * anchoredPosition itself and HideSticker leaves it alone.
   */
  private resetTransform(): void {
    this.root.rotation = 0;
    this.root.scale.set(1, 1);
  }

  async show(input: StickerInput): Promise<void> {
    const { root, text } = this;
    const wasActive = this.richChars !== null;
    // Native AppendText (0x1842455F0) leaves the fade, tween and transform
    // alone. Only a fresh show invalidates their sessions.
    if (!input.append || !wasActive) {
      // RenderSticker -> _ResetView kills m_seq and resets the transform, then
      // writes anchoredPosition from the param.
      this.invalidate();
      this.resetTransform();
      root.x = input.x;
      root.y = input.y;
    }
    root.visible = true;

    if (!wasActive) {
      root.alpha = 0;
      const fadeSessionId = this.fadeSession;
      void this.host.tween(
        input.fadeMs,
        (progress) => {
          if (this.fadeSession === fadeSessionId) root.alpha = progress;
        },
        () => {
          if (this.fadeSession === fadeSessionId) root.alpha = 1;
        },
      );
    }

    const prevChars = input.append ? (this.richChars ?? []) : [];
    const newChars = parseRichChars(input.text);
    const allChars = [...prevChars, ...newChars];
    this.richChars = allChars;

    const style = this.host.createOverlayTextStyle(input.sizePx, input.widthPx);
    style.tagStyles = buildTagStyles(allChars);
    text.style = style;

    this.typeWriter.beginText(allChars, {
      delayMs: input.delayMs,
      onTypeEnd: () => input.onTypingComplete?.(),
      render: ({ chars, visibleCount }) => {
        text.text = richCharsToTaggedText(chars.slice(0, visibleCount));
        this.host.layoutSubtitle(text, 0, input.widthPx, input.alignment);
      },
      startIndex: prevChars.length,
    });
  }

  hide(fadeMs: number, finishTyping: boolean): void {
    const { root, text } = this;

    this.invalidate();
    // The hide executor raises its own auto click with length zero.
    if (finishTyping) this.typeWriter.tryFinish(false);
    else this.typeWriter.stopTypingSilently();
    this.richChars = null;
    if (!root.visible || !text.text || fadeMs <= 0) {
      this.clearVisual();
      return;
    }

    const sessionId = this.fadeSession;
    const startAlpha = root.alpha;
    void this.host.tween(
      fadeMs,
      (progress) => {
        if (this.fadeSession !== sessionId) return;
        root.alpha = startAlpha * (1 - progress);
      },
      () => {
        if (this.fadeSession !== sessionId) return;
        this.clearVisual();
      },
    );
  }

  /**
   * Native `StickerPanel._RecycleStickers` (0x1841E46E0) runs
   * `ResetStickerTransform` and then `HideSticker(0)` on every live entry of
   * m_stickerDict -- no TryFinishType, so a partial typewriter is what fades.
   */
  recycle(fadeMs: number): void {
    if (this.richChars !== null) this.resetTransform();
    this.hide(fadeMs, false);
  }

  private clearVisual(): void {
    this.text.text = "";
    this.root.visible = false;
    this.root.alpha = 1;
  }

  /**
   * Native port: Torappu.AVG.StickerPanel._ExecuteStickerTween (2791
   * 0x1841E2E40) driving AVGStickerTextView.ExecuteTween<T> (2791
   * 0x184486F10). Each non-empty group is one SequenceBuilder.Push step in
   * native order (position, rotation, alpha, scale); `isend=false` steps only
   * accumulate, and the first `isend=true` command builds and plays the whole
   * sequence -- mirrored here by a per-view pending queue (native keeps
   * m_builder on the view as well). Web adaptation: instead of a DOTween
   * Sequence, every step gets a time window inside a single tween of the total
   * duration; a `join` step starts when the previous step started, otherwise
   * after it ends (DOTween Join vs Append). Durations were already
   * animateRatio-scaled by the StickerPanel, which is the documented visual
   * equivalent of the native `Sequence.timeScale = animateRatio` assignment.
   * Rotation is degrees in native localEulerAngles and radians in pixi, hence
   * the conversion.
   */
  executeTween(input: StickerTweenInput): void {
    const queue = this.tweenQueue;
    if (input.position)
      queue.push({ ...input.position, join: input.join, kind: "position" });
    if (input.rotation)
      queue.push({ ...input.rotation, join: input.join, kind: "rotation" });
    if (input.alpha)
      queue.push({ ...input.alpha, join: input.join, kind: "alpha" });
    if (input.scale)
      queue.push({ ...input.scale, join: input.join, kind: "scale" });

    if (!input.isend) return;

    this.tweenQueue = [];
    const { root } = this;
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
        root.x = step.from.x + (step.to.x - step.from.x) * progress;
        root.y = step.from.y + (step.to.y - step.from.y) * progress;
        return;
      }
      const value = step.from + (step.to - step.from) * progress;
      if (step.kind === "alpha") root.alpha = value;
      else if (step.kind === "scale") root.scale.set(value, value);
      else root.rotation = (value * Math.PI) / 180;
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
}
