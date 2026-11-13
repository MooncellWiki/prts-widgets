import { Text, type TextStyle } from "pixi.js";

import type { TimerClearInput, TimerStickerInput } from "../../types";
import type { TweenRunner } from "../core/TweenRunner";

interface TimerViewOptions {
  createOverlayTextStyle: (size: number, width: number) => TextStyle;
  tween: TweenRunner["run"];
}

/** Torappu.AVG.AVGTimerView, using Pixi Text and a browser interval. */
export class TimerView {
  readonly root = new Text({ text: "" });

  private fadeSessionId = 0;
  private stopFadeComplete: (() => void) | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;

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
    if (input.durationMs <= 0) {
      finish();
      return;
    }
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
      { isAlive },
    );
  }

  private startCountUp(capSeconds: number): void {
    // _StartCountTimer (2791 VA 0x1842470c0) seeds the text only when it
    // creates a task. An existing task keeps its text until the next tick.
    if (this.interval === null) this.root.text = "00:00:00";
    this.stopCountUp();

    const startMs = Date.now();
    // CountDownTask samples at 200 ms. Using elapsed wall time lets the
    // browser catch up after throttling. _TimerEnd leaves the final text up.
    this.interval = setInterval(() => {
      const elapsedSeconds = Math.min(
        capSeconds,
        Math.max(0, Math.floor((Date.now() - startMs) / 1000)),
      );
      const text = formatTimer(elapsedSeconds);
      if (this.root.text !== text) this.root.text = text;
      if (elapsedSeconds >= capSeconds) this.stopCountUp();
    }, 200);
  }

  private stopCountUp(): void {
    if (this.interval === null) return;
    clearInterval(this.interval);
    this.interval = null;
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
