import type { TweenHandle, TweenRunner } from "../core/TweenRunner";
import type { Container } from "pixi.js";

// _SetHiddenInternal (2791 @ 0x1841BEEA0) uses 230 ms and the panel_video
// prefab (sharedassets1.assets PathID 3845) supplies Ease.Linear.
const VIDEO_FADE_OUT_MS = 230;

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
    let fade: TweenHandle | undefined;
    let ended = false;
    const disconnect = () => {
      ended = true;
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
    const dispose = () => {
      if (this.stopActive !== stop) return;
      this.stopActive = null;
      fade?.kill();
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
      if (fade) return;
      disconnect();
      // The following commands can draw and receive input behind the fading
      // overlay. Keep the element mounted to retain its final frame.
      this.uiLayer.visible = true;
      host.style.pointerEvents = "none";
      const durationMs = fadeOutDelayMs + VIDEO_FADE_OUT_MS;
      fade = this.tweens.start(
        durationMs,
        (progress) => {
          const elapsedMs = progress * durationMs;
          const fadeProgress =
            Math.max(0, elapsedMs - fadeOutDelayMs) / VIDEO_FADE_OUT_MS;
          host.style.opacity = String(1 - fadeProgress);
        },
        { onComplete: dispose },
      );
    };
    const finish = (failed: boolean) => {
      if (ended) return;
      disconnect();
      if (failed) this.warn?.(`video playback failed: ${url}`);
      onEnd();
    };
    const onEnded = () => finish(false);
    const onError = () => finish(true);
    this.stopActive = stop;
    this.uiLayer.visible = false;
    host.style.display = "flex";
    host.style.opacity = "1";
    host.style.pointerEvents = "";
    host.replaceChildren(video);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
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
