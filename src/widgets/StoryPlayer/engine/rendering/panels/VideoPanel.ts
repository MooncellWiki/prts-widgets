import { hasTweenDuration } from "../../commandParams";

import type { TweenHandle, TweenRunner } from "../core/TweenRunner";
import type { Container } from "pixi.js";

// _SetHiddenInternal (2791 @ 0x1841BEEA0) uses 230 ms and the panel_video
// prefab (sharedassets1.assets PathID 3845) supplies Ease.Linear.
const VIDEO_FADE_MS = 230;

interface ActiveVideo {
  element: HTMLVideoElement;
  events: AbortController;
  started: boolean;
}

/**
 * View side of `Torappu.AVG.AVGVideoPanel`. The host represents the
 * persistent CanvasGroup. Each playback supplies its own HTMLVideoElement.
 */
export class VideoPanel {
  private host: HTMLDivElement | null = null;
  private activeVideo: ActiveVideo | null = null;
  private hidden = true;
  private disposeTween?: TweenHandle;
  private fadeTween?: TweenHandle;

  constructor(
    private readonly uiLayer: Container,
    private readonly tweens: TweenRunner,
    private readonly warn?: (detail: string) => void,
  ) {}

  mount(parent: HTMLElement): void {
    if (this.host) return;
    const host = document.createElement("div");
    Object.assign(host.style, {
      alignItems: "center",
      background: "#000",
      display: "none",
      inset: "0",
      justifyContent: "center",
      opacity: "0",
      overflow: "hidden",
      pointerEvents: "none",
      position: "absolute",
    });
    parent.append(host);
    this.host = host;
  }

  play(url: string, onEnd: () => void): void {
    const host = this.host;
    if (!host) {
      onEnd();
      return;
    }
    // _ExecuteVideo (2791 @ 0x1841BE4F0) prepares the new media while
    // the existing CanvasGroup transition continues.
    this.disposeVideo(0);
    const video = document.createElement("video");
    const media: ActiveVideo = {
      element: video,
      events: new AbortController(),
      started: false,
    };
    const { signal } = media.events;
    const finish = (failed: boolean) => {
      if (signal.aborted) return;
      media.events.abort();
      if (failed) this.warn?.(`video playback failed: ${url}`);
      onEnd();
    };
    const onError = () => finish(true);
    const onPlaying = () => {
      // _StartPlayCoroutine.MoveNext (2791 @ 0x1841CC6A0) shows the panel
      // when the player is ready. The browser signals playback via playing.
      media.started = true;
      this.setHidden(false);
    };
    this.activeVideo = media;
    host.append(video);
    this.updateDisplay();
    video.addEventListener("ended", () => finish(false), { signal });
    video.addEventListener("error", onError, { signal });
    video.addEventListener("playing", onPlaying, { once: true, signal });
    Object.assign(video, {
      autoplay: true,
      playsInline: true,
      preload: "auto",
      src: url,
    });
    Object.assign(video.style, {
      background: "#000",
      display: "block",
      height: "100%",
      width: "100%",
    });
    void video.play().catch(onError);
  }

  stop(fadeOutDelayMs?: number): void {
    if (fadeOutDelayMs === undefined) {
      this.disposeVideo(0);
      this.fadeTween?.kill();
      this.fadeTween = undefined;
      this.hidden = true;
      this.setHidden(true);
      return;
    }
    // OnFinish (2791 @ 0x1841BDDE0) sets two independent deadlines.
    this.disposeVideo(fadeOutDelayMs + VIDEO_FADE_MS);
    this.setHidden(true, fadeOutDelayMs);
  }

  /** _DisposeVideo (2791 @ 0x1841BE1C0) replaces the media stop timer. */
  private disposeVideo(closeDelayMs: number): void {
    this.disposeTween?.kill();
    this.disposeTween = undefined;
    const media = this.activeVideo;
    if (!media) return;

    const { element, events, started } = media;
    const preparing = !started && !events.signal.aborted;
    events.abort();
    const release = () => {
      if (this.activeVideo !== media) return;
      this.activeVideo = null;
      this.disposeTween = undefined;
      element.pause();
      element.removeAttribute("src");
      element.load();
      element.remove();
      this.updateDisplay();
    };
    if (!hasTweenDuration(closeDelayMs / 1000)) {
      release();
      return;
    }
    // Web media can start while a delayed disposal is pending.
    if (preparing) element.pause();
    this.disposeTween = this.tweens.start(closeDelayMs, () => {}, {
      onComplete: release,
    });
  }

  /** _SetHiddenInternal (2791 @ 0x1841BEEA0) owns only the CanvasGroup fade. */
  private setHidden(hidden: boolean, delayMs = 0): void {
    const host = this.host;
    if (!host) return;
    const targetOpacity = hidden ? 0 : 1;
    // Web can draw and receive input behind the closing overlay.
    if (hidden) this.uiLayer.visible = true;
    host.style.pointerEvents = hidden ? "none" : "";
    if (this.hidden === hidden) {
      this.setOpacity(targetOpacity);
      return;
    }

    this.hidden = hidden;
    this.fadeTween?.kill();
    // DOTween.SetDelay (2791 @ 0x1847D88B0) treats negative delay as ready.
    const delay = Math.max(0, delayMs);
    const duration = delay + VIDEO_FADE_MS;
    let startOpacity: number | undefined;
    this.fadeTween = this.tweens.start(
      duration,
      (progress) => {
        const elapsed = progress * duration;
        if (elapsed < delay) return;
        startOpacity ??= Number(host.style.opacity);
        const fadeProgress =
          progress === 1 ? 1 : (elapsed - delay) / VIDEO_FADE_MS;
        this.setOpacity(
          startOpacity + (targetOpacity - startOpacity) * fadeProgress,
        );
      },
      {
        onComplete: () => {
          this.fadeTween = undefined;
          this.uiLayer.visible = hidden;
        },
      },
    );
  }

  private setOpacity(opacity: number): void {
    if (!this.host) return;
    this.host.style.opacity = String(opacity);
    this.updateDisplay();
  }

  private updateDisplay(): void {
    const host = this.host;
    if (!host) return;
    host.style.display =
      this.activeVideo || Number(host.style.opacity) > 0 ? "flex" : "none";
  }

  destroy(): void {
    this.stop();
    this.host?.remove();
    this.host = null;
  }
}
