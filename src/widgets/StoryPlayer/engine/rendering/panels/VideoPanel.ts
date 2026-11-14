import type { Container } from "pixi.js";

/**
 * Web adaptation of `Torappu.AVG.AVGVideoPanel._ExecuteVideo` / `_PlayVideo`.
 * It preserves full-screen UI suppression; completion keeps the native
 * end-of-current-frame FinishCommand timing (`InvokeEndOfFrame` →
 * `WaitForEndOfFrame`), while native Unity video/player lifecycle is
 * represented by an HTMLVideoElement.
 */
export class VideoPanel {
  private host: HTMLDivElement | null = null;
  private disposeActive: (() => void) | null = null;

  constructor(
    private readonly uiLayer: Container,
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
    this.uiLayer.visible = false;
    host.style.display = "flex";
    host.replaceChildren(video);
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

    const dispose = () => {
      this.disposeActive = null;
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
      host.style.display = "none";
      this.uiLayer.visible = true;
    };
    const finish = (failed: boolean) => {
      if (this.disposeActive !== dispose) return;
      dispose();
      if (failed) this.warn?.(`video playback failed: ${url}`);
      onEnd();
    };
    const onEnded = () => finish(false);
    const onError = () => finish(true);
    this.disposeActive = dispose;
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);
    void video.play().catch(onError);
  }

  stop(): void {
    this.disposeActive?.();
  }

  destroy(): void {
    this.stop();
    this.host?.remove();
    this.host = null;
  }
}
