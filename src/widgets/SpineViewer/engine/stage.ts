import spine from "@/spine/runtime/spine-webgl";

import { FPS, summarize, type AnimSummary } from "./anims";

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

/** 取景框：舞台正中的正方形（CSS 像素，自舞台左上角），导出的就是它 */
export interface Box {
  x: number;
  y: number;
  s: number;
}

export type Rgba = [number, number, number, number];
const TRANSPARENT: Rgba = [0, 0, 0, 0];

/** 取景框边长 = 这么多骨骼单位，同旧版 1000 × 1000 的画布：贴图差不多 1 : 1，各时装 / 模型大小可比 */
export const RULER = 1000;
/** 导出的边长（像素）：取景框原样出图，默认取景下正好 1 像素 / 单位，不随屏幕尺寸和像素比变 */
export const EXPORT = 1000;

const FALLBACK: Bounds = { x0: -200, y0: 0, x1: 200, y1: 400 };
/** 取景时动作最多采这么多个时刻（短动作逐帧，长的隔几帧） */
const SAMPLES = 90;

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
  /** 导出时画布的边长：非 0 时只画取景框、按这个尺寸出图；0 = 平时，按舞台尺寸 × 像素比画整块舞台 */
  out = 0;
  private dpr = 1;

  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly shader: spine.webgl.Shader;
  private readonly batcher: spine.webgl.PolygonBatcher;
  private readonly renderer: spine.webgl.SkeletonRenderer;
  private readonly mvp = new spine.webgl.Matrix4();
  private readonly assets: spine.webgl.AssetManager;
  private readonly cache: Record<string, Loaded> = {};
  /** 各动作的包围盒（没有动作时以骨骼为键，存初始姿态的） */
  private readonly boxes = new WeakMap<object, Bounds>();
  private readonly verts: number[] = [];

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

  /**
   * 取景用：动作全程逐帧（长的隔几帧）的包围盒并起来，骨骼单位、不算翻转。
   * 只算看得见的附件——有的特效平时 alpha = 0 挂在老远，算进去框会被撑得很大
   */
  bounds(anim: spine.Animation | null): Bounds {
    const sk = this.cur?.skeleton;
    if (!sk) return FALLBACK;
    const key = anim ?? sk;
    const hit = this.boxes.get(key);
    if (hit) return hit;

    const sx = sk.scaleX;
    sk.scaleX = 1;
    const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    const frames = anim ? Math.round(anim.duration * FPS) : 0;
    const step = Math.max(1, Math.ceil(frames / SAMPLES));
    for (let f = 0; f <= frames; f += step) {
      this.pose(anim, f / FPS);
      this.extend(sk, b);
    }
    sk.scaleX = sx;
    const out = Number.isFinite(b.x0) && b.x1 > b.x0 ? b : FALLBACK;
    this.boxes.set(key, out);
    return out;
  }

  private extend(sk: spine.Skeleton, b: Bounds): void {
    const v = this.verts;
    for (const slot of sk.drawOrder) {
      if (!slot.bone.active || slot.color.a < 0.02) continue;
      const att = slot.getAttachment();
      let n = 0;
      if (att instanceof spine.RegionAttachment) {
        if (att.color.a < 0.02) continue;
        n = 8;
        spine.Utils.setArraySize(v, n, 0);
        att.computeWorldVertices(slot.bone, v, 0, 2);
      } else if (att instanceof spine.MeshAttachment) {
        if (att.color.a < 0.02) continue;
        n = att.worldVerticesLength;
        spine.Utils.setArraySize(v, n, 0);
        att.computeWorldVertices(slot, 0, n, v, 0, 2);
      }
      for (let i = 0; i < n; i += 2) {
        b.x0 = Math.min(b.x0, v[i]);
        b.x1 = Math.max(b.x1, v[i]);
        b.y0 = Math.min(b.y0, v[i + 1]);
        b.y1 = Math.max(b.y1, v[i + 1]);
      }
    }
  }

  /** 取景框：舞台正中、边长取宽高里短的那个；舞台本身是正方形时就是整块舞台 */
  get box(): Box {
    const s = Math.min(this.w, this.h);
    return { x: (this.w - s) / 2, y: (this.h - s) / 2, s };
  }

  /** 画布跟着舞台走，按设备像素比出图；导出中（out ≠ 0）保持导出尺寸 */
  resize(w: number, h: number, dpr: number): void {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.setOut(this.out);
  }

  /** 进出导出：n 像素见方只画取景框，0 换回整块舞台 */
  setOut(n: number): void {
    this.out = n;
    this.canvas.width = n || Math.max(1, Math.round(this.w * this.dpr));
    this.canvas.height = n || Math.max(1, Math.round(this.h * this.dpr));
  }

  draw(): void {
    const { gl, canvas, view: v } = this;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(...this.clear);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (!this.cur) return;

    // 画布对着舞台上的哪一块（CSS 像素）：平时整块，导出时只取景框
    const b = this.out ? this.box : null;
    const [x, y, w, h] = b ? [b.x, b.y, b.s, b.s] : [0, 0, this.w, this.h];
    this.mvp.ortho2d((x - v.x) / v.z, -(y + h - v.y) / v.z, w / v.z, h / v.z);
    this.shader.bind();
    this.shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, this.mvp.values);
    this.batcher.begin(this.shader);
    this.renderer.draw(this.batcher, this.cur.skeleton);
    this.batcher.end();
    this.shader.unbind();
  }
}
