import { STORY_HEIGHT, STORY_WIDTH } from "../engine/types";

/**
 * 剧情渲染对比用的画布抓帧器（仅独立调试页使用，不进 build 产物）。
 *
 * - 独立自续期 rAF 循环采集，不挂在播放器的 rAF 链上——播放器停在等点击时
 *   不再调度渲染，挂在播放链上的抓帧器会漏掉尾部帧。
 * - 输出固定 1280x720（引擎逻辑分辨率 STORY_WIDTH/HEIGHT，对比规范两侧统一），
 *   不随宿主 CSS/DPR 摆动；官服侧 1920x1080 帧由分析端 norm 到同一尺寸。
 * - 引擎渲染器 preference:"webgpu"，播放器闲置时画布可能不再重新 present，
 *   此时抓到的帧会是空白。无法从外部强制引擎重绘，故提供 suspiciousTail
 *   检测：连续异常小的帧视为疑似空白，UI/调用方据此改用实时页面截图补终态。
 */

export interface StoryRecorderFrame {
  /** 相对录制起点的毫秒 */
  t: number;
  /** JPEG dataURL；采集异常时缺省，改由 e 说明 */
  d?: string;
  e?: string;
}

export interface StoryRecorderOptions {
  /** 采集帧率上限，默认 30 */
  fps?: number;
  /** JPEG 质量，默认 0.75 */
  quality?: number;
  /** 缓冲上限（环形，超出丢最旧），默认 2700 = 30fps × 90s */
  maxFrames?: number;
  /** 输出宽，默认 STORY_WIDTH */
  width?: number;
  /** 输出高，默认 STORY_HEIGHT */
  height?: number;
}

/** window.__storyRec 上暴露的抓帧接口 */
export interface StoryRecorderApi {
  start: () => object;
  stop: () => object;
  clear: () => object;
  status: () => object;
  /** 返回整包帧 JSON 字符串（stride 抽稀） */
  collect: (stride?: number) => string | null;
  /** 单帧快照，返回 JSON 字符串 */
  snapshot: (quality?: number) => string | null;
}

/** 疑似空白帧判据：dataURL 小于全帧中位长的 35% 且小于 16KB（1280x720 纯色 JPEG 量级） */
const BLANK_RATIO = 0.35;
const BLANK_FLOOR_BYTES = 16 * 1024;

export class StoryRecorder {
  private readonly getCanvas: () => HTMLCanvasElement | null;
  private readonly fps: number;
  private readonly quality: number;
  private readonly maxFrames: number;
  private readonly width: number;
  private readonly height: number;
  private frames: StoryRecorderFrame[] = [];
  private t0 = 0;
  private t0Abs = 0;
  private lastCaptureAt = -Infinity;
  private running = false;
  private rafId = 0;
  private off: HTMLCanvasElement | null = null;
  private octx: CanvasRenderingContext2D | null = null;

  constructor(
    getCanvas: () => HTMLCanvasElement | null,
    options: StoryRecorderOptions = {},
  ) {
    this.getCanvas = getCanvas;
    this.fps = Math.max(1, options.fps ?? 30);
    this.quality = options.quality ?? 0.75;
    this.maxFrames = Math.max(2, options.maxFrames ?? 2700);
    this.width = options.width ?? STORY_WIDTH;
    this.height = options.height ?? STORY_HEIGHT;
  }

  get recording(): boolean {
    return this.running;
  }

  get frameCount(): number {
    return this.frames.length;
  }

  get elapsedMs(): number {
    return this.running ? performance.now() - this.t0 : 0;
  }

  start(): boolean {
    if (this.running) return false;
    this.t0 = performance.now();
    this.t0Abs = Date.now();
    this.running = true;
    this.lastCaptureAt = -Infinity;
    const raf = window.requestAnimationFrame.bind(window);
    const loop = () => {
      if (!this.running) return;
      this.captureIfNeeded();
      this.rafId = raf(loop);
    };
    this.rafId = raf(loop);
    return true;
  }

  stop(): boolean {
    if (!this.running) return false;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    return true;
  }

  clear(): void {
    this.frames = [];
  }

  /** 尾部连续疑似空白帧数（WebGPU 闲置不 present 的自检，见文件头注释） */
  suspiciousTail(): number {
    const lengths = this.frames
      .map((f) => (f.d ? f.d.length : 0))
      .filter((n) => n > 0);
    if (lengths.length < 4) return 0;
    lengths.sort((a, b) => a - b);
    const median = lengths[Math.floor(lengths.length / 2)];
    const floor = Math.max(BLANK_FLOOR_BYTES, median * BLANK_RATIO);
    let n = 0;
    for (let i = this.frames.length - 1; i >= 0; i--) {
      const f = this.frames[i];
      if (!f.d || f.d.length >= floor) break;
      n++;
    }
    return n;
  }

  status(): object {
    return {
      recording: this.running,
      frames: this.frames.length,
      elapsedMs: Math.round(this.elapsedMs),
      fps: this.fps,
      out: `${this.width}x${this.height}`,
      canvas: this.canvasSpec(),
      startedAtEpoch: this.t0Abs || null,
      suspiciousTail: this.suspiciousTail(),
    };
  }

  /** 采集结果整包导出；stride 抽稀（默认 1 = 全量） */
  collectJson(stride = 1): string | null {
    if (this.frames.length === 0) return null;
    const step = Math.max(1, Math.floor(stride));
    const kept: StoryRecorderFrame[] = [];
    for (let i = 0; i < this.frames.length; i += step)
      kept.push(this.frames[i]);
    return JSON.stringify({
      total: this.frames.length,
      kept: kept.length,
      stride: step,
      startedAtEpoch: this.t0Abs,
      fpsCap: this.fps,
      size: `${this.width}x${this.height}`,
      frames: kept,
    });
  }

  /** 当前画面单帧（不改动采集缓冲） */
  snapshotJson(quality = 0.9): string | null {
    const data = this.captureNow(quality);
    return data ? JSON.stringify({ t: Date.now(), d: data }) : null;
  }

  /** 触发浏览器下载 JSON */
  downloadJson(
    filename = `story-frames-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  ): boolean {
    const json = this.collectJson();
    if (!json) return false;
    const url = URL.createObjectURL(
      new Blob([json], { type: "application/json" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    return true;
  }

  dispose(): void {
    this.stop();
    this.frames = [];
    this.off = null;
    this.octx = null;
  }

  private canvasSpec(): string | null {
    const canvas = this.getCanvas();
    return canvas ? `${canvas.width}x${canvas.height}` : null;
  }

  private captureIfNeeded(): void {
    const now = performance.now();
    const minInterval = 1000 / this.fps;
    if (now - this.lastCaptureAt < minInterval) return;
    this.lastCaptureAt = now;
    this.pushFrame(this.captureNow(this.quality), now - this.t0);
    if (this.frames.length > this.maxFrames)
      this.frames.splice(0, this.frames.length - this.maxFrames);
  }

  private captureNow(quality: number): string | null {
    const canvas = this.getCanvas();
    if (!canvas) return null;
    if (!this.off || !this.octx) {
      this.off = document.createElement("canvas");
      this.off.width = this.width;
      this.off.height = this.height;
      this.octx = this.off.getContext("2d");
    }
    if (!this.octx) return null;
    this.octx.drawImage(canvas, 0, 0, this.width, this.height);
    try {
      return this.off.toDataURL("image/jpeg", quality);
    } catch (error) {
      // 画布被跨源纹理污染等场景：报错帧不中断录制
      console.warn("[storyRecorder] capture failed:", error);
      return null;
    }
  }

  private pushFrame(data: string | null, t: number): void {
    const tt = Math.round(t);
    this.frames.push(
      data ? { t: tt, d: data } : { t: tt, e: "capture-failed" },
    );
  }
}

/** 在 window.__storyRec 上挂抓帧接口，返回卸载函数 */
export function installStoryRecorderApi(recorder: StoryRecorder): () => void {
  const api: StoryRecorderApi = {
    start: () => (recorder.start(), recorder.status()),
    stop: () => (recorder.stop(), recorder.status()),
    clear: () => (recorder.clear(), recorder.status()),
    status: () => recorder.status(),
    collect: (stride?: number) => recorder.collectJson(stride),
    snapshot: (quality?: number) => recorder.snapshotJson(quality),
  };
  (window as unknown as { __storyRec?: StoryRecorderApi }).__storyRec = api;
  return () => {
    delete (window as unknown as { __storyRec?: StoryRecorderApi }).__storyRec;
  };
}
