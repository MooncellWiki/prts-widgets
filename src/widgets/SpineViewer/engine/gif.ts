import { FPS } from "./anims";

/**
 * GIF 导出：逐帧离屏画、读回像素再编码（gifenc，点了导出才加载）。不靠实时录屏——Stage.pose 同一个 t 永远同一个姿态，
 * 不丢帧，切到后台也照样出。这里只管排帧与编码，怎么画一帧由调用方给（grab）。
 */

/** 两档边长（× EXPORT）：GIF 是 PNG / WebM 的一半（256 色、逐帧整幅存，1000 见方动辄十来 MB），GIF 2x 与它们同尺寸 */
export const GIF_SCALE = { gif: 0.5, gif2x: 1 } as const;
export type GifKind = keyof typeof GIF_SCALE;

/** 浏览器把短于 2 厘秒的帧时长按 10 厘秒放（反倒变慢），每帧至少停 2 厘秒 */
const MIN_DELAY = 2;
/** 播一遍的 GIF 末帧停 1 秒：有的地方（聊天软件转存）不认播放次数照样循环，不至于一闪就跳回开头 */
const HOLD = 100;
/** 透明底：GIF 只有全透明 / 不透明两档，alpha 过半算不透明 */
const ALPHA_CUT = 128;
/** 求调色板时均匀挑几帧、隔点取样，样本最多这么多像素 */
const SAMPLE_FRAMES = 8;
const SAMPLE_PIXELS = 1 << 19;

export interface GifPlan {
  /** 依次要画的帧（30 帧 / 秒的帧号） */
  frames: number[];
  /** 每帧停多久（厘秒） */
  delays: number[];
}

/**
 * 排帧：total = 动作帧数，speed = 播放速度。GIF 的帧时长以厘秒计，按累计时刻取整再相减（30 帧 / 秒排成 3 4 3 3 4 3…），总时长不漂；
 * 快放到一帧不足 2 厘秒就隔帧取。循环时不画最后一帧（它和第 0 帧同一个姿态，首尾相接会多停一拍）；播一遍就停在最后一帧
 */
export function planGif(total: number, speed: number, loop: boolean): GifPlan {
  const cs = 100 / (FPS * speed);
  const at = (f: number) => Math.round(f * cs);
  const k = Math.max(1, Math.ceil(MIN_DELAY / cs - 1e-9));
  const frames: number[] = [];
  for (let f = 0; f < total; f += k) frames.push(f);
  if (!loop || !frames.length) frames.push(total);
  const delays = frames.map((f, i) =>
    i + 1 < frames.length
      ? at(frames[i + 1]) - at(f)
      : loop
        ? at(total) - at(f)
        : HOLD,
  );
  // 隔帧取时循环的最后一段可能不足 2 厘秒：并进前一帧
  for (let i = delays.length - 1; i > 0; i--) {
    if (delays[i] >= MIN_DELAY) continue;
    delays[i - 1] += delays[i];
    frames.splice(i, 1);
    delays.splice(i, 1);
  }
  delays[0] = Math.max(delays[0], MIN_DELAY);
  return { frames, delays };
}

export interface GifJob {
  /** 边长（像素） */
  size: number;
  plan: GifPlan;
  /** 一直循环；否则播一遍 */
  loop: boolean;
  /** 透明底；否则底色已经画进画面 */
  transparent: boolean;
  /** 画出第 frame 帧，读回 size × size 的 RGBA（未预乘） */
  grab: (frame: number) => Uint8ClampedArray;
  onProgress?: (done: number, total: number) => void;
}

/** 让出主线程，界面好刷新进度。用 MessageChannel：切到后台时 setTimeout 会被限到一秒一次 */
function pacer() {
  let last = performance.now();
  return async () => {
    if (performance.now() - last < 16) return;
    await new Promise<void>((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => resolve();
      ch.port2.postMessage(0);
    });
    last = performance.now();
  };
}

const words = (px: Uint8ClampedArray) =>
  new Uint32Array(px.buffer, px.byteOffset, px.length >> 2);

/** 透明底先按 ALPHA_CUT 切成两档：半透明的边缘、光效要么全透明要么不透明，免得按颜色远近乱归 */
function cutAlpha(px: Uint8ClampedArray): void {
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] >= ALPHA_CUT) px[i] = 255;
    else px[i - 3] = px[i - 2] = px[i - 1] = px[i] = 0;
  }
}

/** 编码成 GIF：所有帧共用一套 256 色（比逐帧求快得多，前后帧颜色也不闪） */
export async function encodeGif(job: GifJob): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
  const { size, plan, transparent } = job;
  const format = transparent ? "rgba4444" : "rgb565";
  const pause = pacer();
  const read = (f: number) => {
    const px = job.grab(f);
    if (transparent) cutAlpha(px);
    return px;
  };

  // quantize 读的是整块 buffer，样本数要正好填满：每帧都取 ceil(per / stride) 个
  const n = Math.min(SAMPLE_FRAMES, plan.frames.length);
  const per = size * size;
  const stride = Math.max(1, Math.ceil((per * n) / SAMPLE_PIXELS));
  const sample = new Uint32Array(n * Math.ceil(per / stride));
  let o = 0;
  for (let i = 0; i < n; i++) {
    const px = words(
      read(plan.frames[Math.floor((i * plan.frames.length) / n)]),
    );
    for (let p = 0; p < per; p += stride) sample[o++] = px[p];
    await pause();
  }
  const palette = quantize(new Uint8Array(sample.buffer), 256, {
    format,
    oneBitAlpha: transparent,
  });
  const ti = transparent ? palette.findIndex((c) => c[3] === 0) : -1;

  const gif = GIFEncoder();
  for (const [i, f] of plan.frames.entries()) {
    gif.writeFrame(applyPalette(read(f), palette, format), size, size, {
      // 第一帧的写成全局色表，之后的帧不再带
      palette: i ? undefined : palette,
      delay: plan.delays[i] * 10,
      repeat: job.loop ? 0 : -1,
      ...(ti >= 0 && { transparent: true, transparentIndex: ti }),
    });
    job.onProgress?.(i + 1, plan.frames.length);
    await pause();
  }
  gif.finish();
  return new Blob([gif.bytesView()], { type: "image/gif" });
}

/**
 * 从 WebGL 画布读像素的函数：得紧跟在同一个任务里的绘制后面调（没开 preserveDrawingBuffer）。
 * 经一块 2D 画布转一道，行序和预乘都由浏览器处理好
 */
export function canvasReader(
  src: HTMLCanvasElement,
  size: number,
): () => Uint8ClampedArray {
  const buf = document.createElement("canvas");
  buf.width = buf.height = size;
  const ctx = buf.getContext("2d", { willReadFrequently: true })!;
  return () => {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(src, 0, 0, size, size);
    return ctx.getImageData(0, 0, size, size).data;
  };
}
