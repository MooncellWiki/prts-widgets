import spine from "@/spine/runtime/spine-webgl";

import { summarize, type AnimSummary } from "./anims";

export interface AnimInfo extends AnimSummary {
  anim: spine.Animation;
}

export interface Loaded {
  skeleton: spine.Skeleton;
  data: spine.SkeletonData;
  anims: AnimInfo[];
}

/** 原点（脚底）在舞台里的位置（CSS 像素，自左上角）与缩放（CSS 像素 / 骨骼单位） */
export interface View {
  x: number;
  y: number;
  z: number;
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type Rgba = [number, number, number, number];
const TRANSPARENT: Rgba = [0, 0, 0, 0];

/**
 * 一块 canvas、一套 shader，骨骼按「时装 / 模型」缓存。
 * 不用 AnimationState：每帧从初始姿态起把当前动作在 t 时刻的姿态直接套上去（Animation.apply + MixBlend.setup），
 * 同一个 t 永远是同一个姿态，拖时间轴 / 逐帧 / 倒退都准，也没有多圈累加的旋转问题。
 * （window.SpineApi 仍是 SpineApi.ts 那一套，这里不动它。）
 */
export class Stage {
  view: View = { x: 0, y: 0, z: 1 };
  /** 清屏色：平时透明（底色由 CSS 铺），导出时换成所选背景 */
  clear: Rgba = TRANSPARENT;
  cur: Loaded | null = null;
  /** 舞台尺寸（CSS 像素） */
  w = 0;
  h = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly shader: spine.webgl.Shader;
  private readonly batcher: spine.webgl.PolygonBatcher;
  private readonly renderer: spine.webgl.SkeletonRenderer;
  private readonly mvp = new spine.webgl.Matrix4();
  private readonly assets: spine.webgl.AssetManager;
  private readonly cache: Record<string, Loaded> = {};

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = new spine.webgl.ManagedWebGLRenderingContext(canvas, {
      alpha: true,
    });
    this.gl = ctx.gl;
    this.shader = spine.webgl.Shader.newTwoColoredTextured(ctx);
    this.batcher = new spine.webgl.PolygonBatcher(ctx);
    this.renderer = new spine.webgl.SkeletonRenderer(ctx);
    this.renderer.premultipliedAlpha = true;
    this.assets = new spine.webgl.AssetManager(ctx);
  }

  private fetch(skel: string, atlas: string) {
    return Promise.all([
      new Promise<void>((resolve, reject) =>
        this.assets.loadBinary(
          skel,
          () => resolve(),
          (path, message) => reject(new Error(message || path)),
        ),
      ),
      new Promise<void>((resolve, reject) =>
        this.assets.loadTextureAtlas(
          atlas,
          () => resolve(),
          (path, message) => reject(new Error(message || path)),
        ),
      ),
    ]);
  }

  /** 取骨骼（有缓存就直接给）；不改 cur——调用方确认这次载入没被后来的覆盖，再自己设 */
  async load(key: string, path: string, skin?: string): Promise<Loaded> {
    if (this.cache[key]) return this.cache[key];

    await this.fetch(`${path}.skel`, `${path}.atlas`);
    const loader = new spine.AtlasAttachmentLoader(
      this.assets.get(`${path}.atlas`),
    );
    const raw: Uint8Array = this.assets.get(`${path}.skel`);
    // '{' 开头是 JSON 骨骼（缄默德克萨斯「幽兰秘辛」的基建 / 正面）；二进制的首字节是 hash 长度，不会是 0x7b
    const data =
      raw[0] === 0x7b
        ? new spine.SkeletonJson(loader).readSkeletonData(
            new TextDecoder("utf-8").decode(raw),
          )
        : new spine.SkeletonBinary(loader).readSkeletonData(raw);
    const skeleton = new spine.Skeleton(data);
    if (skin) skeleton.setSkinByName(skin);

    this.cache[key] = {
      skeleton,
      data,
      anims: data.animations.map((anim) => ({
        ...summarize(
          anim.name,
          anim.duration,
          anim.timelines
            .filter(
              (t): t is spine.EventTimeline => t instanceof spine.EventTimeline,
            )
            .flatMap((t) =>
              t.events.map((e) => ({ name: e.data.name, time: e.time })),
            ),
        ),
        anim,
      })),
    };
    return this.cache[key];
  }

  /** 把当前骨骼摆到 anim 的 t 时刻 */
  pose(anim: spine.Animation | null, t: number): void {
    const sk = this.cur?.skeleton;
    if (!sk) return;

    sk.setToSetupPose();
    // events 传 null：EventTimeline 遇到 null 直接返回，不收集事件
    anim?.apply(
      sk,
      -1,
      t,
      false,
      null as unknown as spine.Event[],
      1,
      spine.MixBlend.setup,
      spine.MixDirection.mixIn,
    );
    sk.updateWorldTransform();
  }

  /** 取景用：动作全程里采 6 个时刻的包围盒并起来（setup pose 常常是摊开的，data.width / height 有的模型是 0） */
  bounds(anim: spine.Animation | null): Bounds {
    const offset = new spine.Vector2();
    const size = new spine.Vector2();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 6; i++) {
      this.pose(anim, anim ? (anim.duration * i) / 6 : 0);
      this.cur?.skeleton.getBounds(offset, size, []);
      if (!Number.isFinite(offset.x) || !size.x) continue;
      x0 = Math.min(x0, offset.x);
      y0 = Math.min(y0, offset.y);
      x1 = Math.max(x1, offset.x + size.x);
      y1 = Math.max(y1, offset.y + size.y);
    }
    return Number.isFinite(x0)
      ? { x0, y0, x1, y1 }
      : { x0: -200, y0: 0, x1: 200, y1: 400 };
  }

  /** 画布跟着舞台走，按设备像素比出图 */
  resize(w: number, h: number, dpr: number): void {
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.w = w;
    this.h = h;
  }

  draw(): void {
    const { gl, canvas, view: v } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...this.clear);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.cur) return;

    this.mvp.ortho2d(
      -v.x / v.z,
      -(this.h - v.y) / v.z,
      this.w / v.z,
      this.h / v.z,
    );
    this.shader.bind();
    this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);
    this.batcher.begin(this.shader);
    this.renderer.draw(this.batcher, this.cur.skeleton);
    this.batcher.end();
    this.shader.unbind();
  }
}
