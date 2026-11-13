import { Text, type TextStyle } from "pixi.js";

import { dotweenDefaultEase } from "../core/DotweenEase";

import type {
  StoryRenderer,
  TimerClearInput,
  TimerStickerInput,
} from "../../types";
import type { TweenRunner } from "../core/TweenRunner";

interface TimerViewOptions {
  createOverlayTextStyle: (size: number, width: number) => TextStyle;
  onFrameUpdate: StoryRenderer["onFrameUpdate"];
  tween: TweenRunner["run"];
}

/** Torappu.AVG.AVGTimerView, using Pixi Text and the renderer's frame updates. */
export class TimerView {
  readonly root = new Text({ text: "" });

  private fadeSessionId = 0;
  private stopFadeComplete: (() => void) | null = null;
  private cancelCountUp: (() => void) | null = null;

  constructor(private readonly options: TimerViewOptions) {}

  show(input: TimerStickerInput): void {
    // RenderTimer (2791 VA 0x184246980) sets the layout and starts the clock
    // before _ShowTimer completes any previous fade via DOKill(true).
    this.root.style = this.options.createOverlayTextStyle(
      input.sizePx,
      input.widthPx,
    );
    this.root.position.set(input.x, input.y);
    if (input.limitSeconds !== undefined && input.limitSeconds > 0)
      this.startCountUp(input.limitSeconds);

    // Completing a pending StopTimer fade also clears the clock we just
    // restarted. _ExcuteTimerSticker activates the view after RenderTimer.
    this.fadeSessionId += 1;
    this.stopFadeComplete?.();
    this.root.alpha = input.fromAlpha;
    this.fadeTo(input.toAlpha, input.durationMs > 0 ? input.durationMs : 130);
    this.root.visible = true;
  }

  stop(input?: TimerClearInput): void {
    // StopTimer (2791 VA 0x184246c70) kills the old fade with complete: false.
    this.fadeSessionId += 1;
    this.stopFadeComplete = null;

    // Preserve the renderer's argument-less Web reset.
    if (!input) {
      this.stopCountUp();
      this.root.text = "";
      this.root.alpha = 1;
      this.root.visible = false;
      return;
    }

    // <StopTimer>b__7_0 (2791 VA 0x184246d80) clears the task and hides the
    // view at fade completion. Update keeps ticking until that callback.
    const finish = () => {
      this.stopFadeComplete = null;
      this.stopCountUp();
      this.root.alpha = 0;
      this.root.visible = false;
    };
    this.stopFadeComplete = finish;
    this.fadeTo(0, input.durationMs, finish);
  }

  destroy(): void {
    this.fadeSessionId += 1;
    this.stopFadeComplete = null;
    this.stopCountUp();
    this.root.destroy();
  }

  private fadeTo(toAlpha: number, durationMs: number, done?: () => void): void {
    const session = this.fadeSessionId;
    const fromAlpha = this.root.alpha;
    const isAlive = () => this.fadeSessionId === session;
    void this.options.tween(
      durationMs,
      (progress) => {
        if (isAlive())
          this.root.alpha = fromAlpha + (toAlpha - fromAlpha) * progress;
      },
      () => {
        if (!isAlive()) return;
        this.root.alpha = toAlpha;
        done?.();
      },
      // 2791 CanvasGroup.DOFade (0x184442db0) inherits OutQuad. A zero-duration
      // fade completes in TweenManager.Update (0x1844679f0).
      { deferZeroDuration: true, ease: dotweenDefaultEase, isAlive },
    );
  }

  private startCountUp(capSeconds: number): void {
    // _StartCountTimer (2791 VA 0x1842470c0) seeds the text only when it
    // creates a task. An existing task keeps its text until the next tick.
    if (this.cancelCountUp === null) this.root.text = "00:00:00";
    this.stopCountUp();

    // CountDownTask.SetCountDown (2791 @ 0x181e3be70) and TaskTimer.Tick
    // (0x1855df6f0) use whole-second wall time. The 200 ms gate therefore
    // admits the first frame after a reset and each advance of the timestamp.
    const startSeconds = Math.trunc(Date.now() / 1000);
    let lastTickSeconds = Number.NEGATIVE_INFINITY;
    this.cancelCountUp = this.options.onFrameUpdate(() => {
      const nowSeconds = Math.trunc(Date.now() / 1000);
      if (nowSeconds <= lastTickSeconds) return;
      lastTickSeconds = nowSeconds;

      const elapsedSeconds = Math.max(0, nowSeconds - startSeconds);
      const text = formatTimer(elapsedSeconds);
      if (this.root.text !== text) this.root.text = text;
      // TaskTimer.Tick publishes the sampled value before firing the timeout.
      if (elapsedSeconds >= capSeconds) this.stopCountUp();
    });
  }

  private stopCountUp(): void {
    this.cancelCountUp?.();
    this.cancelCountUp = null;
  }
}

function formatTimer(totalSeconds: number): string {
  // _TimerTick uses TimeSpan.Hours, which wraps at 24.
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, "0"))
    .join(":");
}
