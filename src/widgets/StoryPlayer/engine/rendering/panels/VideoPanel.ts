import type { Container } from "pixi.js";

/**
 * Web adaptation of `Torappu.AVG.AVGVideoPanel._ExecuteVideo` / `_PlayVideo`.
 * It preserves full-screen UI suppression; completion keeps the native
 * end-of-current-frame FinishCommand timing (`InvokeEndOfFrame` →
 * `WaitForEndOfFrame`), while native Unity video/player lifecycle is
 * represented by an HTMLVideoElement.
 */
export class VideoPanel {
  private active: HTMLVideoElement | null = null;
  private host: HTMLDivElement | null = null;
  private sessionId = 0;
  /** Settles the in-flight `play()` promise; `stop()` must not strand it. */
  private finishActive: (() => void) | null = null;

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

  async play(url: string): Promise<void> {
    if (!this.host) return;
    this.stop();
    const host = this.host;
    const video = document.createElement("video");
    const sessionId = ++this.sessionId;
    this.active = video;
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

    await new Promise<void>((resolve) => {
      let settled = false;
      let onEnded!: () => void;
      let onError!: () => void;
      const finish = (failed: boolean) => {
        if (settled) return;
        settled = true;
        if (failed) this.warn?.(`video playback failed: ${url}`);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("error", onError);
        if (this.active === video) this.active = null;
        if (this.finishActive === finishExternally) this.finishActive = null;
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        if (this.sessionId === sessionId && this.host) {
          this.host.style.display = "none";
          this.host.replaceChildren();
          this.uiLayer.visible = true;
        }
        resolve();
      };
      // Detaching `src` and calling `load()` does not reliably raise `error`,
      // so a force-stop has to release this promise itself.
      const finishExternally = () => finish(false);
      this.finishActive = finishExternally;
      onEnded = () => finish(false);
      onError = () => finish(true);
      video.addEventListener("ended", onEnded);
      video.addEventListener("error", onError);
      void video.play().catch(onError);
    });
  }

  stop(): void {
    this.sessionId += 1;
    const finishActive = this.finishActive;
    this.finishActive = null;
    const video = this.active;
    this.active = null;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    }
    if (this.host) {
      this.host.style.display = "none";
      this.host.replaceChildren();
    }
    this.uiLayer.visible = true;
    finishActive?.();
  }

  destroy(): void {
    this.stop();
    this.host?.remove();
    this.host = null;
  }
}
