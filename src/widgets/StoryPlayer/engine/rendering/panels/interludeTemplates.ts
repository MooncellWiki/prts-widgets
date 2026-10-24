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
// 坐标:Unity 的 anchoredPosition/localPosition 已换算到 PIXI(y 取反);
// RectTransform 的 anchor/pivot 折算成父节点内的固定偏移(见各模板注释)。
//
// Web 适配(有意近似,非原生行为):
// - stencil 读写通道(`UIStencilGraphic`/`UIStencilComponent`)用 PIXI
//   `Graphics` mask 近似:mask 图形挂在写入者(`_imgMask`/`img_char_mask`)
//   节点下,自动跟随模板的 DOScale/位移/入场动画;读取者(通道内容层、
//   vertical 的 `img_unknown`、dialog 的 `img_bg`/`img_char`)以它裁切。
// - `bg_defaul_gradient` 的渐变 shader 用 `top_gradient` 贴图拉伸近似;
//   `mask_soft_edge` 软边与 dialog `img_char_mask` 的自定义网格按矩形近似。
// - `group_name` 上的布局组件(随文字伸缩的 name_back/brick)未移植,
//   name_back 固定 40x40。
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
  dialogIntroLeft: clipEnd("dialog_left"),
  dialogIntroRight: clipEnd("dialog_right"),
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

type Vec2 = { x: number; y: number };

/** dialog `img_char` 的 prefab rect(`_ApplyDialogCharLayoutOverride` 每次恢复)。 */
export const DIALOG_CHAR_SIZE = 1380;

/** 2.7.61 `CutinTemplateDialogView` 的节点。 */
export interface DialogNodes {
  /**
   * `group_left/right`:`_dialogGroup`(CanvasGroup)兼入场动画根。pivot 在
   * 左中/右中,节点原点即 pivot,入场的 scale/rotation 绕它进行。
   */
  group: Container;
  /** `img_char_mask`(stencil 写入,入场动画缩放其 y)。 */
  charMask: Container;
  /** `img_frame`(入场动画缩放;left 的 prefab localScale.x = -1)。 */
  frameImg: Container;
  /** `img_char`:立绘落点,固定 1380x1380 rect。 */
  charImage: Sprite;
  /** `img_bg`:type 2 背景落点,固定 rect(不 SetNativeSize)。 */
  bgImage: Sprite;
  right: boolean;
  /** prefab `group_*` 的 anchoredPosition.x(入场动画无 clip 时的静止位)。 */
  restX: number;
  /** prefab `img_char` 的 anchoredPosition(char_part 中心系)。 */
  charBase: Vec2;
  bgSize: Vec2;
}

/** 模板内被面板/动画访问的节点集合。 */
export interface TemplateNodes {
  /** 模板根(`mask_container` 下;面板按 offset 摆放)。 */
  root: Container;
  /**
   * 根节点的水平锚:基类 ShowCutinMask 写 localPosition = offset(相对
   * mask_container 中心);dialog 写 anchoredPosition = offset,而它的
   * anchor/pivot 在左中/右中,即贴屏幕左/右边缘。
   */
  anchor: "center" | "left" | "right";
  /** `_scaleTrans ?? transform`:style 0/2 的 ts DOScale 与 clear 收缩目标。 */
  scaleNode: Container;
  /** scaleNode 的 prefab localScale(`ui_cutin_mask_vertical` 为 (0,1))。 */
  initialScale: Vec2;
  /** `_imgMask`(或 dialog 的 `img_char_mask`)所在节点。 */
  maskNode: Container;
  /** 裁切图形:基类模板用它裁切通道内容层(root_bkg_* / root_char_*)。 */
  maskGraphics: Graphics;
  /** 模板配了 `_imgMask`(style 1/2 才 Join 3s DOFade;dialog 无)。 */
  hasImgMask: boolean;
  /**
   * `_animWrapper` + `_animLocs[0]`:style 3 时播放且 m_cutinSeq = null(立即
   * 完成)。null = 没有 animWrapper,style 3 什么都不播,仍走 1s 地板。
   */
  animatorClip: "hori_mask_open" | null;
  /**
   * 模板根上 legacy Animation 的默认 clip(`playAutomatically`):实例化即
   * 播放,与 style 无关(square 模板与其 deco 同挂这一条)。
   */
  autoClip: "square_show" | null;
  /** `_emptyImg`。 */
  emptyImage: Sprite | null;
  /** square `back_shadow` 的 sizeDelta 写入(content_mask 随之内缩 36)。 */
  setBackShadowSize: ((width: number, height: number) => void) | null;
  /** square `back_shadow` 的 CanvasGroup(alpha 作用到整个子树)。 */
  backShadowGroup: Container | null;
  dialog: DialogNodes | null;
  /** 模板默认尺寸(prefab sizeDelta;命令 size≈0 时沿用)。 */
  defaultSize: Vec2;
  /** 写 sizeDelta 后按各子节点的锚定规则重排。 */
  resize: (width: number, height: number) => void;
}

export interface DecoNodes {
  /** deco 根(`deco_container` 下;面板按 offset 摆放)。 */
  root: Container;
  /** `text_name`(仅 square deco 有)。 */
  label: Text | null;
  /**
   * `TwoStateToggle.set_selected`:selected 显示 `wave_active`(说话中的波形),
   * 否则显示 `wave_stop`(静止横线);Awake(`_setWithAwake`)默认未选中。
   */
  setSwitch: (selected: boolean) => void;
  /** square deco 的 `group_wave`/`group_name`/`group_frame_common`(入场动画目标)。 */
  waveGroup: Container | null;
  nameGroup: Container | null;
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

/** 以节点原点为中心(重)画裁切矩形。 */
function drawMaskRect(g: Graphics, width: number, height: number): void {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  g.clear()
    .rect(-w / 2, -h / 2, w, h)
    .fill(0xff_ff_ff);
}

/**
 * 按原生 prefab 层级建模板;未知 maskid 返回 null,面板回落到纯矩形 mask。
 * 返回时尺寸为 prefab 默认值,面板按命令 `size`(≈0 时保持默认)调用 `resize`。
 */
export function buildTemplate(
  maskId: string,
  tex: InterludeTextureSet,
): TemplateNodes | null {
  const root = new Container();

  if (maskId === "group_interclude_vertical_common") {
    // root 320x760。back_shadow(icon_back,拉伸锚定 = 根尺寸)即 `_scaleTrans`,
    // 其下 content_mask(`_imgMask`,每边内缩 18)→ bg_defaul_gradient。
    // img_unknown 283x720 是 root 的直接子节点:不随 ts 缩放,但它是
    // content_mask 的 stencil 读取者(`_components`),被窗口裁切。
    const scaleNode = new Container();
    const backShadow = centeredSprite(tex.iconBack, 320, 760);
    const gradient = centeredSprite(tex.gradientV, 320 - 36, 760 - 36);
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    const unknownMask = new Graphics();
    maskNode.addChild(maskGraphics, unknownMask);
    scaleNode.addChild(backShadow, gradient, maskNode);
    const unknown = centeredSprite(tex.unknownVertical, 283, 720);
    unknown.mask = unknownMask;
    root.addChild(scaleNode, unknown);
    const resize = (width: number, height: number): void => {
      backShadow.width = width;
      backShadow.height = height;
      gradient.width = Math.max(0, width - 36);
      gradient.height = Math.max(0, height - 36);
      drawMaskRect(maskGraphics, width - 36, height - 36);
      drawMaskRect(unknownMask, width - 36, height - 36);
    };
    resize(320, 760);
    return {
      root,
      anchor: "center",
      scaleNode,
      initialScale: { x: 1, y: 1 },
      maskNode,
      maskGraphics,
      hasImgMask: true,
      animatorClip: null,
      autoClip: null,
      emptyImage: unknown,
      setBackShadowSize: null,
      backShadowGroup: null,
      dialog: null,
      defaultSize: { x: 320, y: 760 },
      resize,
    };
  }

  if (maskId === "group_interclude_square_common") {
    // root 300x300(`_scaleTrans` 为空 → DOScale 作用于 root)。back_shadow
    // 是居中定尺寸的 250x250(带 CanvasGroup),所以命令 size 只改 root 的
    // sizeDelta,子节点不随之变化;content_mask(`_imgMask`)拉伸内缩 36 →
    // 214x214,其下 bg_defaul_gradient + bg_custom_holder/img_unknown(居中
    // 214x214,不读 stencil)。入场动画见 applySquareShow。
    const backShadowGroup = new Container();
    const backShadow = centeredSprite(tex.iconBack, 250, 250);
    const gradient = centeredSprite(tex.gradientV, 214, 214);
    const unknown = centeredSprite(tex.unknownSquare, 214, 214);
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    maskNode.addChild(maskGraphics);
    backShadowGroup.addChild(backShadow, gradient, unknown, maskNode);
    root.addChild(backShadowGroup);
    const setBackShadowSize = (width: number, height: number): void => {
      backShadow.width = width;
      backShadow.height = height;
      gradient.width = Math.max(0, width - 36);
      gradient.height = Math.max(0, height - 36);
      drawMaskRect(maskGraphics, width - 36, height - 36);
    };
    setBackShadowSize(250, 250);
    return {
      root,
      anchor: "center",
      scaleNode: root,
      initialScale: { x: 1, y: 1 },
      maskNode,
      maskGraphics,
      hasImgMask: true,
      animatorClip: null,
      autoClip: "square_show",
      emptyImage: unknown,
      setBackShadowSize,
      backShadowGroup,
      dialog: null,
      defaultSize: { x: 300, y: 300 },
      resize: () => {},
    };
  }

  if (
    maskId === "ui_cutin_mask_vertical" ||
    maskId === "ui_cutin_mask_horizon"
  ) {
    // 纯 stencil 窗口:唯一子节点 ui_cutin_mask(`_imgMask`,拉伸,无贴图)。
    // vertical 337.3x788.5,prefab localScale = (0,1)(style 0 无 ts / style 3
    // 时保持收起),无 animWrapper;horizon 1689.2x335.27,animWrapper 播
    // avg_cutin_hori_com_mask(ui_cutin_mask 的 y 开合,见 applyHoriMaskOpen)。
    const vertical = maskId === "ui_cutin_mask_vertical";
    const maskNode = new Container();
    const maskGraphics = new Graphics();
    maskNode.addChild(maskGraphics);
    root.addChild(maskNode);
    const defaultSize = vertical
      ? { x: 337.3, y: 788.5 }
      : { x: 1689.2, y: 335.27 };
    drawMaskRect(maskGraphics, defaultSize.x, defaultSize.y);
    return {
      root,
      anchor: "center",
      scaleNode: root,
      initialScale: vertical ? { x: 0, y: 1 } : { x: 1, y: 1 },
      maskNode,
      maskGraphics,
      hasImgMask: true,
      animatorClip: vertical ? null : "hori_mask_open",
      autoClip: null,
      emptyImage: null,
      setBackShadowSize: null,
      backShadowGroup: null,
      dialog: null,
      defaultSize,
      resize: (width, height) => drawMaskRect(maskGraphics, width, height),
    };
  }

  if (
    maskId === "interlude_dialog_left" ||
    maskId === "interlude_dialog_right"
  ) {
    // 2.7.61 CutinTemplateDialogView。left:root 1280x720,anchor/pivot (0,0.5)
    // → group_left(anchor/pivot (0,0.5),+10x,400x350)→ char_part(anchor/
    // pivot (0,0.5),300x300,中心在 group pivot +150)→ img_char_mask
    // (485x403.4 @+48x,stencil 写入)/ img_bg(550x570 @(-12.23,17.7))/
    // img_char(1380x1380 @(0,-520))两个读取者;img_frame 473x426 锚在
    // group 中心(+200)@(0,-12.6),localScale.x = -1。right 是独立 prefab
    // (锚在右中,char_part 在 group pivot -100、中心 -250,img_char_mask
    // 485x399.69 @(3,-3.5),img_bg 620.42x590.9 @(120,0),img_frame 不翻转)。
    const right = maskId === "interlude_dialog_right";
    const restX = right ? -10 : 10;
    const group = new Container();
    group.position.set(restX, 0);
    const charPart = new Container();
    charPart.position.set(right ? -250 : 150, 0);
    const charMask = new Container();
    charMask.position.set(right ? 3 : 48, right ? 3.5 : 0);
    const maskGraphics = new Graphics();
    drawMaskRect(maskGraphics, 485, right ? 399.69 : 403.4);
    charMask.addChild(maskGraphics);
    const bgSize = right ? { x: 620.42, y: 590.9 } : { x: 550, y: 570 };
    const bgImage = centeredSprite(tex.dialogGrad, bgSize.x, bgSize.y);
    bgImage.position.set(right ? 120 : -12.23, right ? 0 : -17.7);
    const charBase = { x: 0, y: 520 };
    const charImage = new Sprite(Texture.EMPTY);
    charImage.anchor.set(0.5);
    charImage.position.set(charBase.x, charBase.y);
    charImage.visible = false;
    const charContent = new Container();
    charContent.addChild(bgImage, charImage);
    charContent.mask = maskGraphics;
    charPart.addChild(charMask, charContent);
    const frameImg = new Container();
    frameImg.position.set(right ? -200 : 200, 12.6);
    frameImg.scale.set(right ? 1 : -1, 1);
    frameImg.addChild(centeredSprite(tex.dialogFrame, 473, 426));
    group.addChild(charPart, frameImg);
    root.addChild(group);
    return {
      root,
      anchor: right ? "right" : "left",
      scaleNode: root,
      initialScale: { x: 1, y: 1 },
      maskNode: charMask,
      maskGraphics,
      hasImgMask: false,
      animatorClip: null,
      autoClip: null,
      emptyImage: null,
      setBackShadowSize: null,
      backShadowGroup: null,
      dialog: {
        group,
        charMask,
        frameImg,
        charImage,
        bgImage,
        right,
        restX,
        charBase,
        bgSize,
      },
      defaultSize: { x: 1280, y: 720 },
      // group 锚在 root 的左中/右中(与 root pivot 重合),root 尺寸不影响布局。
      resize: () => {},
    };
  }

  return null;
}

/**
 * wave_shadow + wave_active(4 片 wave_base 80x42,pivot (1,0),x=±4.8,以
 * scale ±1 镜像成上下左右对称的波形)+ wave_stop(2 片 80x3.98 灰线)。
 */
function buildWaves(tex: InterludeTextureSet): {
  shadow: Sprite;
  active: Container;
  stop: Container;
} {
  const shadow = centeredSprite(tex.waveShadow, 220.14, 130);
  shadow.alpha = 0.672;
  const active = new Container();
  for (const [x, sx, sy] of [
    [4.8, 1, 1],
    [-4.8, -1, 1],
    [4.8, 1, -1],
    [-4.8, -1, -1],
  ] as const) {
    const w = new Sprite(tex.waveBase);
    // Unity pivot (1,0) = 右下角;PIXI y 向下,底边即 anchor.y = 1。
    w.anchor.set(1, 1);
    w.width = 80;
    w.height = 42;
    w.scale.set(w.scale.x * sx, w.scale.y * sy);
    w.position.set(x, 0);
    active.addChild(w);
  }
  const stop = new Container();
  for (const [x, sx] of [
    [4.8, 1],
    [-4.8, -1],
  ] as const) {
    const w = new Sprite(tex.waveBase);
    w.anchor.set(1, 0.5);
    w.width = 80;
    w.height = 3.98;
    w.scale.x *= sx;
    w.tint = 0x8c_8c_8c;
    w.position.set(x, 0);
    stop.addChild(w);
  }
  return { shadow, active, stop };
}

/**
 * 按原生 deco prefab 建装饰层(`CutinTemplate._decoPrefab`)。root 的 prefab
 * 摆位会被 ShowCutinMask 的 `localPosition = offset` 覆盖,故原点即通道
 * 中心 + offset,与模板根重合。
 */
export function buildDeco(
  maskId: string,
  tex: InterludeTextureSet,
): DecoNodes | null {
  if (maskId === "group_interclude_vertical_common") {
    // 167.55x100,localScale (1,1.15):wave_shadow/wave_active/wave_stop 直挂根下,
    // 无 text_name。
    const root = new Container();
    root.scale.set(1, 1.15);
    const { shadow, active, stop } = buildWaves(tex);
    root.addChild(shadow, active, stop);
    const setSwitch = (selected: boolean): void => {
      active.visible = selected;
      stop.visible = !selected;
    };
    setSwitch(false);
    return {
      root,
      label: null,
      setSwitch,
      waveGroup: null,
      nameGroup: null,
      frameGroup: null,
    };
  }

  if (maskId === "group_interclude_square_common") {
    // 300x300:group_wave @(0,-136) localScale (1,0.75) + group_frame_common
    // 236x236(interclude_common_frame)+ group_name @(-145.3,-85.19)
    // {name_back(icon_back)+ text_name(18px、(0.196,0.196,0.196)、
    // MiddleLeft、SourceHanSansCN-Heavy)}。
    const root = new Container();
    const waveGroup = new Container();
    waveGroup.position.set(0, 136);
    waveGroup.scale.set(1, 0.75);
    const { shadow, active, stop } = buildWaves(tex);
    waveGroup.addChild(shadow, active, stop);
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
        fontFamily: "SourceHanSansCN-Heavy, sans-serif",
      }),
    });
    label.anchor.set(0, 0.5);
    nameGroup.addChild(nameBack, label);
    root.addChild(waveGroup, frameGroup, nameGroup);
    const setSwitch = (selected: boolean): void => {
      active.visible = selected;
      stop.visible = !selected;
    };
    setSwitch(false);
    return { root, label, setSwitch, waveGroup, nameGroup, frameGroup };
  }

  return null;
}

/**
 * avg_interclude_square_common_show 在 t 秒的姿态。模板根与 deco 根的
 * Animation 都以它为 `playAutomatically` 默认 clip:模板侧只有 back_shadow
 * 路径命中,deco 侧命中 group_frame_common/group_name/group_wave。
 */
export function applySquareShow(
  nodes: {
    setBackShadowSize: ((width: number, height: number) => void) | null;
    backShadowGroup: Container | null;
    frameGroup: Container | null;
    nameGroup: Container | null;
    waveGroup: Container | null;
  },
  t: number,
): void {
  const { backShadowGroup, frameGroup, nameGroup, waveGroup } = nodes;
  // back_shadow 居中定尺寸:m_SizeDelta 即绝对尺寸(40.1 → 250)。
  nodes.setBackShadowSize?.(
    sample(
      curve("square_show", "float", "back_shadow", "m_SizeDelta.x"),
      t,
      250,
    ),
    sample(
      curve("square_show", "float", "back_shadow", "m_SizeDelta.y"),
      t,
      250,
    ),
  );
  if (backShadowGroup) {
    backShadowGroup.alpha = sample(
      curve("square_show", "float", "back_shadow", "m_Alpha"),
      t,
      1,
    );
  }
  if (frameGroup) {
    // 居中定尺寸:SizeDelta 即绝对尺寸(子节点 common_frame 拉伸跟随)。
    frameGroup.width = sample(
      curve("square_show", "float", "group_frame_common", "m_SizeDelta.x"),
      t,
      236,
    );
    frameGroup.height = sample(
      curve("square_show", "float", "group_frame_common", "m_SizeDelta.y"),
      t,
      236,
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
      -145.3,
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
      -136,
    );
    waveGroup.alpha = sample(
      curve("square_show", "float", "group_wave", "m_Alpha"),
      t,
      1,
    );
  }
}

/** 对话框入场动画(avg_dialogue_left/right,挂在 group 上)在 t 秒的姿态。 */
export function applyDialogIntro(dialog: DialogNodes, t: number): void {
  const name = dialog.right ? "dialog_right" : "dialog_left";
  const { group, charMask, frameImg } = dialog;
  const sc = sampleVec2(curve(name, "scale", ""), t, { x: 1, y: 1 });
  group.scale.set(sc.x, sc.y);
  // Unity z 轴正向为逆时针(y 向上);PIXI rotation 正向为顺时针(y 向下)。
  group.rotation = -sampleRotZ(curve(name, "rotation", ""), t);
  group.position.x = sample(
    curve(name, "float", "", "m_AnchoredPosition.x"),
    t,
    dialog.restX,
  );
  group.alpha = sample(curve(name, "float", "", "m_Alpha"), t, 1);
  const cm = sampleVec2(curve(name, "scale", "char_part/img_char_mask"), t, {
    x: 1,
    y: 1,
  });
  charMask.scale.set(cm.x, cm.y);
  // clip 的 img_frame 曲线自带 prefab 的 x 符号(left 为 -1)。
  const fi = sampleVec2(curve(name, "scale", "img_frame"), t, {
    x: dialog.right ? 1 : -1,
    y: 1,
  });
  frameImg.scale.set(fi.x, fi.y);
}

/**
 * `_ApplyDialogCharLayoutOverride`:先恢复缓存的 prefab 布局(1380x1380 @
 * (0,-520)),再叠加 `icharpos` 偏移(x/y 都加)、按 `icharscale` 乘 localScale。
 */
export function layoutDialogChar(
  dialog: DialogNodes,
  offset: Vec2,
  scaleMul: Vec2,
): void {
  const img = dialog.charImage;
  const tw = img.texture.width || 1;
  const th = img.texture.height || 1;
  img.scale.set(
    (DIALOG_CHAR_SIZE / tw) * scaleMul.x,
    (DIALOG_CHAR_SIZE / th) * scaleMul.y,
  );
  img.position.set(dialog.charBase.x + offset.x, dialog.charBase.y - offset.y);
}

/** `_RefreshDialogBackground`:换图保持 prefab rect;null = 清空并隐藏。 */
export function setDialogBackground(
  dialog: DialogNodes,
  texture: Texture | null,
): void {
  const img = dialog.bgImage;
  if (!texture) {
    img.visible = false;
    return;
  }
  img.texture = texture;
  img.width = dialog.bgSize.x;
  img.height = dialog.bgSize.y;
  img.visible = true;
}

/** avg_cutin_hori_com_mask(y 轴 0→1 开幕,1.8s 后合上)在 t 秒的姿态。 */
export function applyHoriMaskOpen(maskNode: Container, t: number): void {
  const sc = sampleVec2(curve("hori_mask_open", "scale", "ui_cutin_mask"), t, {
    x: 1,
    y: 1,
  });
  maskNode.scale.set(sc.x, sc.y);
}

/**
 * `direction=rin/lin` 的通道横扫动画(avg_cutin_hori_{right,left}_in_chanel,
 * 2.083s)在 t 秒的姿态:root_bkg_* / root_char_* 的 scale 弹入 + poz 漂移,
 * 通道 CanvasGroup alpha 包络 0→1→0。
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
