import { hasTweenDuration } from "../../commandParams";

import type { TweenHandle, TweenRunner } from "../core/TweenRunner";
import type { Container } from "pixi.js";

// _SetHiddenInternal (2791 @ 0x1841BEEA0) uses 230 ms and the panel_video
// prefab (sharedassets1.assets PathID 3845) supplies Ease.Linear.
const VIDEO_FADE_MS = 230;

/**
 * Web adaptation of `Torappu.AVG.AVGVideoPanel._ExecuteVideo` / `_PlayVideo`.
 * It preserves full-screen UI suppression; completion keeps the native
 * end-of-current-frame FinishCommand timing (`InvokeEndOfFrame` →
 * `WaitForEndOfFrame`), while native Unity video/player lifecycle is
 * represented by an HTMLVideoElement.
 */
export class VideoPanel {
  private host: HTMLDivElement | null = null;
  private stopActive: ((fadeOutDelayMs?: number) => void) | null = null;

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
      overflow: "hidden",
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
    this.stop();
    const video = document.createElement("video");
    let transition: TweenHandle | undefined;
    let settled = false;
    let showing = false;
    const disconnect = () => {
      settled = true;
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.removeEventListener("playing", onPlaying);
    };
    const dispose = () => {
      if (this.stopActive !== stop) return;
      this.stopActive = null;
      transition?.kill();
      disconnect();
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      host.style.display = "none";
      this.uiLayer.visible = true;
    };
    const stop = (fadeOutDelayMs?: number) => {
      if (fadeOutDelayMs === undefined) {
        dispose();
        return;
      }
      // OnFinish / _DisposeVideo (2791 @ 0x1841BDDE0 / 0x1841BE1C0)
      // schedule media release with the signed delay plus the fade duration.
      const closeDelayMs = fadeOutDelayMs + VIDEO_FADE_MS;
      if (!hasTweenDuration(closeDelayMs / 1000)) {
        dispose();
        return;
      }

      const preparing = !settled && !showing;
      disconnect();
      transition?.kill();
      // The following commands can draw and receive input behind the fading
      // overlay. Keep the element mounted to retain its final frame.
      this.uiLayer.visible = true;
      host.style.pointerEvents = "none";
      // _SetHiddenInternal snaps an already hidden layer to zero. Cancel
      // pending browser playback if the segment was skipped before readiness.
      if (!showing) host.style.opacity = "0";
      if (preparing) video.pause();
      const startOpacity = Number(host.style.opacity);
      showing = false;
      // DOTween.SetDelay (2791 @ 0x1847D88B0) starts the fade immediately
      // when the delay is negative. The media-release timer still ends early.
      const fadeStartMs = Math.max(0, fadeOutDelayMs);
      transition = this.tweens.start(
        closeDelayMs,
        (progress) => {
          const elapsedMs = progress * closeDelayMs;
          const fadeProgress =
            Math.max(0, elapsedMs - fadeStartMs) / VIDEO_FADE_MS;
          host.style.opacity = String(startOpacity * (1 - fadeProgress));
        },
        { onComplete: dispose },
      );
    };
    const finish = (failed: boolean) => {
      if (settled) return;
      disconnect();
      if (failed) this.warn?.(`video playback failed: ${url}`);
      onEnd();
    };
    const onEnded = () => finish(false);
    const onError = () => finish(true);
    const onPlaying = () => {
      // _StartPlayCoroutine.MoveNext (2791 @ 0x1841CC6A0) shows the panel
      // when the player is ready. The browser signals playback via playing.
      showing = true;
      host.style.pointerEvents = "";
      transition = this.tweens.start(
        VIDEO_FADE_MS,
        (progress) => {
          host.style.opacity = String(progress);
        },
        { onComplete: () => (this.uiLayer.visible = false) },
      );
    };
    this.stopActive = stop;
    host.style.display = "flex";
    host.style.opacity = "0";
    host.style.pointerEvents = "none";
    host.replaceChildren(video);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    video.addEventListener("playing", onPlaying, { once: true });
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
    this.stopActive?.(fadeOutDelayMs);
  }

  destroy(): void {
    this.stop();
    this.host?.remove();
    this.host = null;
  }
}
