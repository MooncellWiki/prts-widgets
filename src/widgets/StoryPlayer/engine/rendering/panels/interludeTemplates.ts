import {
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";

import { INTERLUDE_ASSETS } from "../../../assets";
import importedClips from "../../../assets/interlude/clips.json";

// interlude mask 模板体系的 Web 重建。
//
// Native provenance:`avg/[UC]Common/MaskTemplate/{maskId}` 下 `CutinTemplate`
// (及 2.7.61+ 子类 `CutinTemplateDialogView`)prefab,资源在 `avg/[uc]common.ab`
// (CDN 热更包,不在 APK 基包);channel 骨架与 `direction` 动画在
// `ui/[uc]common.ab` 的 `cutin_controller`/`cutin_channel`/`cutin_charslot`。
// 布局数值逐项转写自 2.7.81 资源版本 26-10-14 的 prefab RectTransform dump
// (2026-10-21);动画关键帧见 `assets/interlude/clips.json`(同批 dump)。逆向
// 记录:arknights-rev `docs/commands/avg-interlude-command.md` §6/§8/§13.1。
//
// Web 适配(有意近似,非原生行为):
// - stencil 读写通道(`UIStencilGraphic`/`UIStencilComponent`)用 PIXI
//   `Graphics` mask 近似:mask 图形挂在模板 root 下,自动跟随模板的
//   DOScale/位移,元素层(`root_char_*`/`root_bkg_*`)以它裁切。
// - `bg_defaul_gradient` 的渐变 shader 用 `top_gradient` 贴图拉伸近似;
//   `mask_soft_edge` 软边不移植(矩形硬边)。
// - deco 的 `TwoStateToggle` 布线(prefab 决定 switch 控制哪层)按"整个 deco
//   内容层可见性"实现。
// - 关键帧间插值取线性(原生为 slope 贝塞尔);UI 曲线键距稀疏,视觉差异可忽略。

/** `assets/interlude/clips.json` 的结构(AnimationClip typetree 转写)。 */
interface ClipKey {
  t: number;
  v: number | { x: number; y: number; z: number; w: number };
}
interface ClipCurve {
  path: string;
  attr?: string;
  keys: ClipKey[];
}
interface ClipSection {
  position: ClipCurve[];
  rotation: ClipCurve[];
  scale: ClipCurve[];
  float: ClipCurve[];
}
type ClipMap = Record<string, ClipSection | undefined>;

const CLIPS = importedClips as unknown as ClipMap;

function curve(
  clip: string,
  section: keyof ClipSection,
  path: string,
  attr?: string,
): ClipCurve | null {
  const c = CLIPS[clip];
  if (!c) return null;
  for (const cu of c[section]) {
    if (
      cu.path === path &&
      (section !== "float" || attr === undefined || cu.attr === attr)
    ) {
      return cu;
    }
  }
  return null;
}

/** 关键帧线性采样(键外取端点值)。 */
function sample(cu: ClipCurve | null, t: number, fallback: number): number {
  if (!cu || cu.keys.length === 0) return fallback;
  const ks = cu.keys;
  if (t <= ks[0]!.t) return ks[0]!.v as number;
  for (let i = 1; i < ks.length; i++) {
    if (t > ks[i]!.t) continue;
    const a = ks[i - 1]!;
    const b = ks[i]!;
    const span = b.t - a.t;
    const p = span > 0 ? (t - a.t) / span : 1;
    return (a.v as number) + ((b.v as number) - (a.v as number)) * p;
  }
  return ks[ks.length - 1]!.v as number;
}

function sampleVec2(
  cu: ClipCurve | null,
  t: number,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  if (!cu || cu.keys.length === 0) return fallback;
  const ks = cu.keys;
  const vec = (v: ClipKey["v"]): { x: number; y: number } =>
    typeof v === "number" ? { x: v, y: v } : { x: v.x, y: v.y };
  if (t <= ks[0]!.t) return vec(ks[0]!.v);
  for (let i = 1; i < ks.length; i++) {
    if (t > ks[i]!.t) continue;
    const a = vec(ks[i - 1]!.v);
    const b = vec(ks[i]!.v);
    const span = ks[i]!.t - ks[i - 1]!.t;
    const p = span > 0 ? (t - ks[i - 1]!.t) / span : 1;
    return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
  }
  return vec(ks[ks.length - 1]!.v);
}

/** 四元数 key 的 z 轴旋转角(rad)。 */
function sampleRotZ(cu: ClipCurve | null, t: number): number {
  if (!cu || cu.keys.length === 0) return 0;
  const ks = cu.keys;
  const pick = (k: ClipKey): number =>
    typeof k.v === "number" ? 0 : 2 * Math.atan2(k.v.z, k.v.w);
  if (t <= ks[0]!.t) return pick(ks[0]!);
  for (let i = 1; i < ks.length; i++) {
    if (t > ks[i]!.t) continue;
    const a = pick(ks[i - 1]!);
    const b = pick(ks[i]!);
    const span = ks[i]!.t - ks[i - 1]!.t;
    const p = span > 0 ? (t - ks[i - 1]!.t) / span : 1;
    return a + (b - a) * p;
  }
  return pick(ks[ks.length - 1]!);
}

/** 各动画时长(秒),取自关键帧末端。 */
const clipEnd = (name: string): number => {
  const c = CLIPS[name];
  if (!c) return 0;
  let end = 0;
  for (const sec of [c.position, c.rotation, c.scale, c.float]) {
    for (const cu of sec) {
      if (cu.keys.length > 0)
        end = Math.max(end, cu.keys[cu.keys.length - 1]!.t);
    }
  }
  return end;
};

export const CLIP_SECONDS = {
  squareShow: clipEnd("square_show"),
  dialogIntro: clipEnd("dialog_left"),
  horiMaskOpen: clipEnd("hori_mask_open"),
  direction: clipEnd("dir_right"),
} as const;

export interface InterludeTextureSet {
  iconBack: Texture;
  unknownVertical: Texture;
  unknownSquare: Texture;
  commonFrame: Texture;
  waveBase: Texture;
  waveShadow: Texture;
  dialogGrad: Texture;
  dialogFrame: Texture;
  gradientV: Texture;
}

let texturePromise: Promise<InterludeTextureSet> | null = null;

/** 模板贴图懒加载(随 widget 打包的静态资源)。 */
export function loadInterludeTextures(): Promise<InterludeTextureSet> {
  texturePromise ??= (async () => {
    const [
      iconBack,
      unknownVertical,
      unknownSquare,
      commonFrame,
      waveBase,
      waveShadow,
      dialogGrad,
      dialogFrame,
      gradientV,
    ] = await Promise.all([
      Assets.load(INTERLUDE_ASSETS.icon_back),
      Assets.load(INTERLUDE_ASSETS.unknown_vertical),
      Assets.load(INTERLUDE_ASSETS.unknown_square),
      Assets.load(INTERLUDE_ASSETS.common_frame),
      Assets.load(INTERLUDE_ASSETS.wave_base),
      Assets.load(INTERLUDE_ASSETS.wave_shadow),
      Assets.load(INTERLUDE_ASSETS.dialog_grad),
      Assets.load(INTERLUDE_ASSETS.dialog_frame),
      Assets.load(INTERLUDE_ASSETS.gradient_v),
    ]);
    return {
      iconBack,
      unknownVertical,
      unknownSquare,
      commonFrame,
      waveBase,
      waveShadow,
      dialogGrad,
      dialogFrame,
      gradientV,
    };
  })();
  return texturePromise;
}

/** 模板内被面板/动画访问的节点集合。 */
export interface TemplateNodes {
  /** 模板视觉根(尺寸 = 命令 size 或模板默认;style 0 的 DOScale 作用于此)。 */
  root: Container;
  /**
   * 视觉层(root 下、maskNode 平级)。native style 1/2 淡的是 `_imgMask`
   * 图像而 stencil 裁切不受其 alpha 影响;Web 的 fade 只作用视觉层,
   * 不能让 maskGraphics 的祖先 alpha 变 0(会把元素裁成全空)。
   */
  visuals: Container;
  /** 裁切节点(stencil 写入位的近似);maskGraphics 挂在其下。 */
  maskNode: Container;
  /** 裁切图形(挂在 maskNode 下,供元素层 `.mask` 使用)。 */
  maskGraphics: Graphics;
  /** `_emptyImg`(`img_unknown`,name 为空时显示的占位立绘)。 */
  emptyImage: Sprite | null;
  /** `back_shadow`(square show 动画的 SizeDelta/alpha 目标)。 */
  backShadow: Sprite | null;
  /** square deco 的 `group_frame_common`(show 动画目标,由 deco 提供)。 */
  frameGroup: Container | null;
  /** 模板入场动画;null = 无(unknown maskid 的纯矩形回落不在此列)。 */
  showClip:
    "square_show" | "hori_mask_open" | "dialog_left" | "dialog_right" | null;
  /** 2.7.61 `CutinTemplateDialogView`:type 3/2 的更新转交模板消费。 */
  consumes: { avatar: boolean; background: boolean };
  isDialog: boolean;
  dialog?: {
    /** `group_left/right`,入场动画作用根。 */
    group: Container;
    charMask: Container;
    frameImg: Container;
    /** `img_char`(`icharpos`/`icharscale` 与 type 3 立绘落点)。 */
    charImage: Sprite;
    /** `img_bg`(type 2 背景落点)。 */
    bgImage: Sprite;
    mirrored: boolean;
  };
  /** 模板默认尺寸(prefab sizeDelta;命令 size≈0 时沿用)。 */
  defaultSize: { x: number; y: number };
  /** 按命令 size 重排(各模板锚定规则不同)。 */
  resize: (width: number, height: number) => void;
}

export interface DecoNodes {
  root: Container;
  /** `text_name`(`char` 文字;vertical deco 无此组)。 */
  label: Text | null;
  /** `group_wave`(square deco,show 动画位移目标)。 */
  waveGroup: Container | null;
  /** `group_name`(square deco,show 动画位移目标)。 */
  nameGroup: Container | null;
  /** `group_frame_common`(square deco,show 动画 SizeDelta 目标)。 */
  frameGroup: Container | null;
}

function centeredSprite(
  texture: Texture,
  width: number,
  height: number,
): Sprite {
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  s.width = width;
  s.height = height;
  return s;
}

/** maskNode 下(保留式)重画裁切矩形;不清兄弟节点(content_mask 内还有
 * bg_defaul_gradient/bg_custom_holder 等子层)。 */
function drawMaskRect(g: Graphics, width: number, height: number): void {
  g.clear()
    .rect(-width / 2, -height / 2, width, height)
    .fill(0xff_ff_ff);
}

/** 通用 resize:mask 矩形 + 内部渐变随模板尺寸更新。 */
function makeResize(
  maskGraphics: Graphics,
  opts: {
    backShadow?: Sprite;
    stretchShadow?: boolean;
    gradient?: Sprite;
    inset: number;
  },
): (width: number, height: number) => void {
  return (width, height) => {
    if (opts.stretchShadow && opts.backShadow) {
      opts.backShadow.width = width;
      opts.backShadow.height = height;
    }
    drawMaskRect(maskGraphics, width - opts.inset, height - opts.inset);
    if (opts.gradient) {
      opts.gradient.width = width - opts.inset;
      opts.gradient.height = height - opts.inset;
    }
  };
}

/**
 * 按原生 prefab 层级建模板。返回 root 尺寸为模板默认值,由面板按命令
 * `size`(≈0 时保持默认)覆盖后调用 `resize`。未知 maskid 返回 null,面板
 * 回落到纯矩形 mask。
 */
export function buildTemplate(
  maskId: string,
  tex: InterludeTextureSet,
): TemplateNodes | null {
  const root = new Container();

  if (maskId === "group_interclude_vertical_common") {
    // prefab:root 320x760;back_shadow(拉伸锚定,icon_back)→ content_mask
    // (sizeDelta -36 即每边内缩 18)→ bg_defaul_gradient + bg_custom_holder;
    // img_unknown 283x720 居中。无入场动画(vertical_show 是空 clip)。
    const backShadow = centeredSprite(tex.iconBack, 320, 760);
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    const gradient = centeredSprite(tex.gradientV, 320 - 36, 760 - 36);
    const unknown = centeredSprite(tex.unknownVertical, 283, 720);
    const visuals = new Container();
    visuals.addChild(backShadow, gradient, unknown);
    root.addChild(visuals, maskNode);
    maskNode.addChild(maskGraphics);
    return {
      root,
      visuals,
      maskNode,
      maskGraphics,
      emptyImage: unknown,
      backShadow,
      frameGroup: null,
      showClip: null,
      consumes: { avatar: false, background: false },
      isDialog: false,
      defaultSize: { x: 320, y: 760 },
      resize: makeResize(maskGraphics, {
        backShadow,
        stretchShadow: true,
        gradient,
        inset: 36,
      }),
    };
  }

  if (maskId === "group_interclude_square_common") {
    // prefab:root 300x300;back_shadow 250x250(icon_back,居中)→ content_mask
    // (内缩 36)→ bg_defaul_gradient + bg_custom_holder → img_unknown 214x214
    // (挂在 holder 下)。入场动画 avg_interclude_square_common_show(动画细节
    // 见 applySquareShow;group_frame/name/wave 节点由 deco 提供,经面板接线)。
    const backShadow = centeredSprite(tex.iconBack, 250, 250);
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    const gradient = centeredSprite(tex.gradientV, 300 - 36, 300 - 36);
    const holder = new Container();
    const unknown = centeredSprite(tex.unknownSquare, 214, 214);
    const visuals = new Container();
    visuals.addChild(backShadow, gradient, holder);
    holder.addChild(unknown);
    root.addChild(visuals, maskNode);
    maskNode.addChild(maskGraphics);
    return {
      root,
      visuals,
      maskNode,
      maskGraphics,
      emptyImage: unknown,
      backShadow,
      frameGroup: null,
      showClip: "square_show",
      consumes: { avatar: false, background: false },
      isDialog: false,
      defaultSize: { x: 300, y: 300 },
      resize: makeResize(maskGraphics, { gradient, inset: 36 }),
    };
  }

  if (
    maskId === "ui_cutin_mask_vertical" ||
    maskId === "ui_cutin_mask_horizon"
  ) {
    // prefab:纯 stencil 窗口(vertical 337x788 / horizon 1689x335,唯一子节点
    // ui_cutin_mask 全拉伸,无贴图)。horizon 伴随 avg_cutin_hori_com_mask
    // (y 轴 0→1 开幕,见 applyHoriMaskOpen)。
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    root.addChild(new Container(), maskNode);
    maskNode.addChild(maskGraphics);
    return {
      root,
      visuals: root.children[0] as Container,
      maskNode,
      maskGraphics,
      emptyImage: null,
      backShadow: null,
      frameGroup: null,
      showClip: maskId === "ui_cutin_mask_horizon" ? "hori_mask_open" : null,
      consumes: { avatar: false, background: false },
      isDialog: false,
      defaultSize:
        maskId === "ui_cutin_mask_vertical"
          ? { x: 337.3, y: 788.5 }
          : { x: 1689.2, y: 335.27 },
      resize: makeResize(maskGraphics, { inset: 0 }),
    };
  }

  if (
    maskId === "interlude_dialog_left" ||
    maskId === "interlude_dialog_right"
  ) {
    // prefab(2.7.61 CutinTemplateDialogView):root 1280x720 全屏;
    // group_left(400x350,+10x)→ char_part{img_char_mask 485x403(+48x),
    // img_bg 550x570(sprite_grad,-12.23/+17.7),img_char 1380x1380(0,-520)}
    // + img_frame 473x426(dialogue_frame)。入场动画 avg_dialogue_left/right。
    // corpus 只用 left;right 按整组镜像近似(全是图像节点,镜像无文字问题)。
    const mirrored = maskId === "interlude_dialog_right";
    const group = new Container();
    group.position.set(10, 0);
    if (mirrored) group.scale.x = -1;
    const charPart = new Container();
    const charMask = new Container();
    charMask.position.set(48, 0);
    const bgImage = centeredSprite(tex.dialogGrad, 550, 570);
    bgImage.position.set(-12.23, -17.7); // native y=+17.7(Unity y 向上),翻转
    const charImage = new Sprite(Texture.EMPTY);
    charImage.anchor.set(0.5);
    charImage.position.set(0, 520); // native y=-520,翻转
    const frameImg = centeredSprite(tex.dialogFrame, 473, 426);
    frameImg.position.set(0, 12.6); // native y=-12.6,翻转
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    root.addChild(group);
    group.addChild(charPart, frameImg, maskNode);
    maskNode.addChild(maskGraphics);
    // dialog 的视觉即 group 整体;visuals 指向 group 让 fade/入场一致。
    charPart.addChild(charMask, bgImage, charImage);
    return {
      root,
      visuals: group,
      maskNode,
      maskGraphics,
      emptyImage: null,
      backShadow: null,
      frameGroup: null,
      showClip: mirrored ? "dialog_right" : "dialog_left",
      consumes: { avatar: true, background: true },
      isDialog: true,
      defaultSize: { x: 1280, y: 720 },
      dialog: { group, charMask, frameImg, charImage, bgImage, mirrored },
      // 对话框模板自身是内容而非裁切窗;mask 保持空矩形。
      resize: () => drawMaskRect(maskGraphics, 0, 0),
    };
  }

  return null;
}

/**
 * 按原生 deco prefab 建装饰层(square 版含 frame/name/wave,vertical 版仅
 * wave)。位置为 decoContainer(通道中心)下的 local 坐标,y 已翻转。
 */
export function buildDeco(
  maskId: string,
  tex: InterludeTextureSet,
): DecoNodes | null {
  const buildWaves = (): Container => {
    // wave_shadow 220x130 @origin;wave_active 4 条 wave_base 80x42(pivot
    // 右下,x=±4.8);wave_stop 2 条 80x3.98(灰 0.551,pivot 右中)。
    const g = new Container();
    const shadow = centeredSprite(tex.waveShadow, 220.14, 130);
    shadow.alpha = 0.672;
    const active = new Container();
    for (const [i, x] of [4.8, -4.8, 4.8, -4.8].entries()) {
      const w = new Sprite(tex.waveBase);
      w.anchor.set(1, 1);
      w.width = 80;
      w.height = 42;
      w.position.set(x, i % 2 === 0 ? 42 : 0);
      active.addChild(w);
    }
    const stop = new Container();
    for (const x of [4.8, -4.8]) {
      const w = new Sprite(tex.waveBase);
      w.anchor.set(1, 0.5);
      w.width = 80;
      w.height = 3.98;
      w.tint = 0x8c_8c_8c;
      w.position.set(x, 21);
      stop.addChild(w);
    }
    g.addChild(shadow, active, stop);
    return g;
  };

  if (maskId === "group_interclude_vertical_common") {
    // deco prefab 167.55x100 @ (0,-56.21):仅波形组,无 name/frame。
    const root = new Container();
    root.position.set(0, 56.21);
    root.addChild(buildWaves());
    return {
      root,
      label: null,
      waveGroup: null,
      nameGroup: null,
      frameGroup: null,
    };
  }

  if (maskId === "group_interclude_square_common") {
    // deco prefab 300x300 @ (-150,53):group_wave @ (0,-136) +
    // group_frame_common 236x236(interclude_common_frame)+ group_name @
    // (-145.3,-85.19){name_back(icon_back 40x40)+ text_name(18px、
    // (0.196,0.196,0.196,1)、MiddleRight、pivot 左中)}。
    const root = new Container();
    root.position.set(-150, -53);
    const waveGroup = new Container();
    waveGroup.position.set(0, 136);
    waveGroup.addChild(buildWaves());
    const frameGroup = new Container();
    frameGroup.addChild(centeredSprite(tex.commonFrame, 236, 236));
    const nameGroup = new Container();
    nameGroup.position.set(-145.3, 85.19);
    const nameBack = centeredSprite(tex.iconBack, 40, 40);
    const label = new Text({
      text: "",
      style: new TextStyle({
        fill: 0x32_32_32,
        fontSize: 18,
        fontFamily: "SourceHanSansCN-Bold, sans-serif",
      }),
    });
    label.anchor.set(0, 0.5);
    nameGroup.addChild(nameBack, label);
    root.addChild(waveGroup, frameGroup, nameGroup);
    return { root, label, waveGroup, nameGroup, frameGroup };
  }

  return null;
}

/** square deco 入场动画(avg_interclude_square_common_show)在 t 秒的姿态。 */
export function applySquareShow(
  nodes: {
    backShadow: Sprite | null;
    frameGroup: Container | null;
    nameGroup: Container | null;
    waveGroup: Container | null;
  },
  templateSize: { x: number; y: number },
  t: number,
): void {
  const { backShadow, frameGroup, nameGroup, waveGroup } = nodes;
  if (backShadow) {
    // back_shadow 拉伸锚定:m_SizeDelta 叠加在(动画起点的)模板尺寸之上。
    backShadow.width =
      templateSize.x +
      sample(
        curve("square_show", "float", "back_shadow", "m_SizeDelta.x"),
        t,
        0,
      );
    backShadow.height =
      templateSize.y +
      sample(
        curve("square_show", "float", "back_shadow", "m_SizeDelta.y"),
        t,
        0,
      );
    backShadow.alpha = sample(
      curve("square_show", "float", "back_shadow", "m_Alpha"),
      t,
      1,
    );
  }
  if (frameGroup) {
    // 居中锚定:SizeDelta 即绝对尺寸。
    frameGroup.width = sample(
      curve("square_show", "float", "group_frame_common", "m_SizeDelta.x"),
      t,
      0,
    );
    frameGroup.height = sample(
      curve("square_show", "float", "group_frame_common", "m_SizeDelta.y"),
      t,
      0,
    );
    frameGroup.alpha = sample(
      curve("square_show", "float", "group_frame_common", "m_Alpha"),
      t,
      1,
    );
  }
  if (nameGroup) {
    nameGroup.position.x = sample(
      curve("square_show", "float", "group_name", "m_AnchoredPosition.x"),
      t,
      0,
    );
    nameGroup.alpha = sample(
      curve("square_show", "float", "group_name", "m_Alpha"),
      t,
      1,
    );
  }
  if (waveGroup) {
    waveGroup.position.y = -sample(
      curve("square_show", "float", "group_wave", "m_AnchoredPosition.y"),
      t,
      0,
    );
    waveGroup.alpha = sample(
      curve("square_show", "float", "group_wave", "m_Alpha"),
      t,
      1,
    );
  }
}

/** 对话框入场动画(avg_dialogue_left/right)在 t 秒的姿态。 */
export function applyDialogIntro(
  dialog: NonNullable<TemplateNodes["dialog"]>,
  t: number,
): void {
  const name = dialog.mirrored ? "dialog_right" : "dialog_left";
  const { group, charMask, frameImg } = dialog;
  const sc = sampleVec2(curve(name, "scale", ""), t, { x: 1, y: 1 });
  group.scale.set((dialog.mirrored ? -1 : 1) * sc.x, sc.y);
  group.rotation = sampleRotZ(curve(name, "rotation", ""), t);
  group.position.x = sample(
    curve(name, "float", "", "m_AnchoredPosition.x"),
    t,
    0,
  );
  group.alpha = sample(curve(name, "float", "", "m_Alpha"), t, 1);
  const cm = sampleVec2(curve(name, "scale", "char_part/img_char_mask"), t, {
    x: 1,
    y: 1,
  });
  charMask.scale.set(cm.x, cm.y);
  const fi = sampleVec2(curve(name, "scale", "img_frame"), t, { x: 1, y: 1 });
  frameImg.scale.set(dialog.mirrored ? -fi.x : fi.x, fi.y);
}

/** avg_cutin_hori_com_mask(y 轴 0→1 开幕)在 t 秒的姿态。 */
export function applyHoriMaskOpen(maskNode: Container, t: number): void {
  const sc = sampleVec2(curve("hori_mask_open", "scale", "ui_cutin_mask"), t, {
    x: 1,
    y: 1,
  });
  maskNode.scale.set(sc.x, sc.y);
}

/**
 * `direction=rin/lin` 的通道横扫动画(avg_cutin_hori_{right,left}_in_chanel,
 * 2.083s)在 t 秒的姿态。原生:`_TryPlayAnimation` 命中时对元素 DOKill、
 * 元素 sequence 不播,由通道 animWrapper 接管(scale 弹入 + poz 漂移 + 通道
 * alpha 包络 0→1→0)。
 */
export function applyDirectionClip(
  nodes: {
    alphaTarget: Container;
    bkgScale: Container;
    bkgPoz: Container;
    charScale: Container;
    charPoz: Container;
  },
  direction: "rin" | "lin",
  t: number,
): void {
  const name = direction === "rin" ? "dir_right" : "dir_left";
  nodes.alphaTarget.alpha = sample(curve(name, "float", "", "m_Alpha"), t, 1);
  const bs = sampleVec2(curve(name, "scale", "root_bkg_scale"), t, {
    x: 1,
    y: 1,
  });
  nodes.bkgScale.scale.set(bs.x, bs.y);
  nodes.bkgScale.position.y = -sample(
    curve(name, "float", "root_bkg_scale", "m_AnchoredPosition.y"),
    t,
    0,
  );
  nodes.bkgPoz.position.x = sample(
    curve(name, "float", "root_bkg_scale/root_bkg_poz", "m_AnchoredPosition.x"),
    t,
    0,
  );
  const cs = sampleVec2(curve(name, "scale", "root_char_scale"), t, {
    x: 1,
    y: 1,
  });
  nodes.charScale.scale.set(cs.x, cs.y);
  nodes.charScale.position.y = -sample(
    curve(name, "float", "root_char_scale", "m_AnchoredPosition.y"),
    t,
    0,
  );
  nodes.charPoz.position.x = sample(
    curve(
      name,
      "float",
      "root_char_scale/root_char_poz",
      "m_AnchoredPosition.x",
    ),
    t,
    0,
  );
}
