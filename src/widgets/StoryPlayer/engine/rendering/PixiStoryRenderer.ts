import {
  Application,
  Assets,
  CanvasSource,
  ColorMatrixFilter,
  Container,
  FillGradient,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";

import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryCharacterAssetByKey,
} from "../asset";
import {
  buildTagStyles,
  collectColors,
  parseRichChars,
  richCharsToTaggedText,
  type RichChar,
} from "../richtext";
import { computeLegacyShowItemLayout } from "../showitem";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type AnimTextInput,
  type AvgDisplayInput,
  type BackgroundInput,
  type BackgroundTweenInput,
  type BlockerInput,
  type CameraShakeInput,
  type CgItemInput,
  type CharacterActionInput,
  type CharacterCutinInput,
  type CharacterSlotInput,
  type CurtainInput,
  type DecisionSelection,
  type FocusOutInput,
  type FocusParamInput,
  type GridBackgroundInput,
  type ImageRotateInput,
  type ImageTweenInput,
  type InterludeInput,
  type LargeBackgroundTweenInput,
  type ShowItemInput,
  type SpellStickerInput,
  type StickerInput,
  type StoryRenderer,
  type SubtitleInput,
  type TimerClearInput,
  type TimerStickerInput,
} from "../types";

import { buildColorEffectMatrix } from "./core/ColorEffectMatrix";
import { LayerGraph } from "./core/LayerGraph";
import {
  applyCenteredTransform as applyCenteredTransformToRoot,
  buildGridBackgroundRoot as buildGridRoot,
  readCenteredTransform as readRootTransform,
  rotateTweenDelta,
} from "./core/SceneGeometry";
import { buildShakePath, sampleShakePath } from "./core/ShakePath";
import { TweenRunner } from "./core/TweenRunner";
import { AnimTextPanel } from "./panels/AnimTextPanel";
import { AvgDisplayPanel } from "./panels/AvgDisplayPanel";
import { CgItemPanel } from "./panels/CgItemPanel";
import {
  CharacterCutinPanel,
  type CutinCharacterArt,
} from "./panels/CharacterCutinPanel";
import { DecisionPanel } from "./panels/DecisionPanel";
import { DialogPanel } from "./panels/DialogPanel";
import { FocusEffectPanel } from "./panels/FocusEffectPanel";
import { InterludePanel } from "./panels/InterludePanel";
import { SpellStickerPanel } from "./panels/SpellStickerPanel";
import { VideoPanel } from "./panels/VideoPanel";

import type { Context } from "../../context";

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * `_GenPosition`'s per-slot term: it cancels each slot's own offset from the
 * panel centre so a horizontal enter starts at the same absolute x everywhere.
 */
const SLOT_ENTER_COMPENSATION: Record<string, number> = { l: 200, r: -200 };

/** DOTween `Ease.OutCubic`, used by `AVGCharacterSlot.SetCharPos`. */
function easeOutCubic(progress: number): number {
  const remaining = 1 - progress;
  return 1 - remaining * remaining * remaining;
}

/**
 * Canvas 渲染分辨率：逻辑坐标系固定 1280x720，实际像素数按宿主 CSS 尺寸
 * × devicePixelRatio 反推，避免画布被 CSS 拉伸发糊。取宽高比例的较大值，
 * 宿主短暂偏离 16:9 时也不会欠采样。
 */
function computeDisplayResolution(host: HTMLElement): number {
  const rect = host.getBoundingClientRect();
  const cssWidth = rect.width || STORY_WIDTH;
  const cssHeight = rect.height || STORY_HEIGHT;
  const devicePixelRatio = window.devicePixelRatio || 1;
  return Math.max(
    (cssWidth / STORY_WIDTH) * devicePixelRatio,
    (cssHeight / STORY_HEIGHT) * devicePixelRatio,
  );
}

/** Width of AVGCurtain's `_gradientImg` feather strip, in logical pixels. */
const CURTAIN_GRADIENT_PX = 20;

const CURTAIN_STAGE_CORNERS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: STORY_WIDTH, y: 0 },
  { x: STORY_WIDTH, y: STORY_HEIGHT },
  { x: 0, y: STORY_HEIGHT },
];

/**
 * 对话框顶部/底部黑条用到的同一张渐变纹理（APK 中 `sprite_avg_cutscene`，
 * 4×310 RGBA，自上而下 alpha 0→1）。放在 `public/` 下由 Vite 直接服务，
 * 预加载由 preload.ts 把该 URL 加入预加载集来预热 pixi Assets 缓存。
 */

interface CharacterBuiltVisual {
  sourceHeight: number;
  sourceWidth: number;
  visual: Container;
}

interface CharacterRenderState {
  actionX: number;
  actionY: number;
  baseScaleX: number;
  baseScaleY: number;
  baseX: number;
  baseY: number;
  characterKey?: string;
  contentAlpha: number;
  focusBrightness: number;
  expression?: string;
  fadeIdentity?: string;
  height: number;
  jumpOffsetY: number;
  jumpSessionId: number;
  motionLayer: Container;
  /**
   * `AVGCharacterSlot.m_currentKey`: the raw `name` ref the slot was last set
   * with, index and alias included. `Set` compares it verbatim, so it cannot
   * be reconstructed from the resolved characterKey/expression pair.
   */
  nativeKey?: string;
  opacitySessionId: number;
  replaceFadeSessionId: number;
  root: Container;
  rotationDeg: number;
  rotationLayer: Container;
  rotateSessionId: number;
  rotateTimeout: ReturnType<typeof setTimeout> | null;
  scaleX: number;
  scaleY: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  shakeSessionId: number;
  shakeTimeout: ReturnType<typeof setTimeout> | null;
  slot: string;
  sourceHeight: number;
  sourceWidth: number;
  transformSessionId: number;
  visual: Container;
  width: number;
}

interface CurtainRenderState {
  alpha: number;
  direction: number;
  fill: number;
  grad: boolean;
  graphic: Graphics;
  tweenSessionId: number;
}

/**
 * Web/PIXI renderer for the AVG command surfaces. Each command method ports
 * the documented observable state and blocking boundaries, while containers,
 * filters, and browser timing are adaptations rather than a Unity scene port.
 * Command-specific native provenance is recorded at the behavior boundaries.
 */
export class PixiStoryRenderer implements StoryRenderer {
  private app: Application | null = null;
  private resizeHost: HTMLElement | null = null;
  private resizeListener: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private readonly layers = new LayerGraph();
  private readonly backgroundLayer = this.layers.background;
  private backgroundRoot: Container | null = null;
  /** Current background visual; exposed for renderer diagnostics and tests. */
  backgroundSprite: Sprite | null = null;
  private backgroundTweenSessionId = 0;
  private readonly context: Context;
  private readonly charLayer = this.layers.characters;
  private readonly characterSlots = new Map<string, CharacterRenderState>();
  private readonly cutinLayer = this.layers.cutins;
  private readonly cutinPanel: CharacterCutinPanel;

  private readonly curtainLayer = this.layers.curtains;
  private readonly curtains = new Map<number, CurtainRenderState>();
  private readonly gridBackgroundLayer = this.layers.gridBackground;
  private gridBackgroundSessionId = 0;
  private largeBackgroundRoot: Container | null = null;
  private largeBackgroundTweenSessionId = 0;
  private readonly imageLayer = this.layers.images;
  private largeImageRoot: Container | null = null;
  private readonly largeImageRoots = new Set<Container>();
  private largeImageSessionId = 0;
  private largeImageTweenSessionId = 0;
  private imageSprite: Sprite | null = null;
  private imageRotateSessionId = 0;
  private readonly itemLayer = this.layers.items;
  private readonly onWarning?: (detail: string) => void;
  private readonly sceneLayer = this.layers.scene;
  private readonly uiLayer = this.layers.ui;
  private readonly worldLayer = this.layers.world;
  private readonly tweenRunner = new TweenRunner(() => Boolean(this.app));
  private readonly videoPanel: VideoPanel;
  private readonly dialogPanel: DialogPanel;
  private readonly decisionPanel: DecisionPanel;
  private readonly interludePanel: InterludePanel;
  private readonly animTextPanel: AnimTextPanel;
  private readonly avgDisplayPanel: AvgDisplayPanel;
  private readonly spellStickerPanel: SpellStickerPanel;
  private readonly focusEffectPanel: FocusEffectPanel;
  private readonly cgItemPanel: CgItemPanel;

  private blockerSprite: Sprite | null = null;
  private cameraShakeSessionId = 0;
  private cameraShakeWaitResolve: (() => void) | null = null;
  private grayscaleAmount = 0;
  private inverseAmount = 0;
  private grayscaleFilter: ColorMatrixFilter | null = null;
  private readonly stickerFadeSessionIds = new Map<string, number>();
  private readonly stickerTexts = new Map<string, Text>();
  private readonly stickerTypingTargets = new Map<
    string,
    {
      alignment: StickerInput["alignment"];
      baseX: number;
      fullText: string;
      widthPx: number;
    }
  >();
  private readonly stickerTypingSessionIds = new Map<string, number>();
  private subtitleFadeSessionId = 0;
  private subtitleText: Text | null = null;
  private subtitleTypingTarget: {
    alignment: SubtitleInput["alignment"];
    baseX: number;
    fullText: string;
    widthPx: number;
  } | null = null;
  private subtitleTypingSessionId = 0;
  private readonly stickerRichChars = new Map<string, RichChar[]>();
  private timerStickerInterval: ReturnType<typeof setInterval> | null = null;
  private timerStickerText: Text | null = null;

  constructor(context: Context, onWarning?: (detail: string) => void) {
    this.context = context;
    this.onWarning = onWarning;
    this.videoPanel = new VideoPanel(this.uiLayer, onWarning);
    this.dialogPanel = new DialogPanel(this.uiLayer, onWarning);
    this.decisionPanel = new DecisionPanel(this.uiLayer);
    this.interludePanel = new InterludePanel(
      this.cutinLayer,
      (input) => this.textureForInterlude(input),
      (durationMs, update, complete) =>
        this.tween(durationMs, update, complete),
      onWarning,
    );
    this.cutinPanel = new CharacterCutinPanel(
      this.cutinLayer,
      (input) => this.textureForCutinCharacter(input),
      (durationMs, update, complete) =>
        this.tween(durationMs, update, complete),
    );
    this.animTextPanel = new AnimTextPanel(
      this.itemLayer,
      (durationMs, update, complete) =>
        this.tween(durationMs, update, complete),
      onWarning,
    );
    this.avgDisplayPanel = new AvgDisplayPanel(
      {
        bgover: this.layers.avgDisplayBackground,
        cgover: this.layers.avgDisplayCg,
        charover: this.layers.avgDisplayCharacter,
      },
      (name) => this.textureForImageKey(name, "background"),
      (durationMs, update, complete) =>
        this.tween(durationMs, update, complete),
      onWarning,
    );
    this.spellStickerPanel = new SpellStickerPanel(this.uiLayer, onWarning);
    this.focusEffectPanel = new FocusEffectPanel(
      (type, id) => this.resolveFocusTargets(type, id),
      (durationMs, update, complete) =>
        this.tween(durationMs, update, complete),
    );
    this.cgItemPanel = new CgItemPanel(
      this.layers.cgItems,
      (key) => this.textureForImageKey(key, "image"),
      (duration, update, complete) => this.tween(duration, update, complete),
      onWarning,
    );
  }

  async mount(host: HTMLElement): Promise<void> {
    if (this.app) return;

    const app = new Application();
    await app.init({
      antialias: true,
      autoDensity: true,
      background: "#000000",
      height: STORY_HEIGHT,
      preference: "webgpu",
      resolution: computeDisplayResolution(host),
      width: STORY_WIDTH,
    });

    host.innerHTML = "";
    host.style.position = "relative";
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.display = "block";
    host.append(app.canvas);
    this.videoPanel.mount(host);

    this.app = app;
    this.watchDisplayResolution(host);

    await this.createUi();
    this.layers.attach(app.stage);

    this.setDialogue("", "");
  }

  /**
   * 跟随宿主尺寸同步画布分辨率。ResizeObserver 覆盖布局变化（窗口缩放、
   * 全屏切换）；window resize 兜底 devicePixelRatio 变化（页面缩放、跨屏
   * 拖动），这类变化不一定伴随宿主尺寸变化。
   */
  private watchDisplayResolution(host: HTMLElement): void {
    this.resizeHost = host;

    const listener = () => this.syncDisplayResolution();
    window.addEventListener("resize", listener);
    this.resizeListener = () => window.removeEventListener("resize", listener);

    if (typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(listener);
    this.resizeObserver.observe(host);
  }

  private syncDisplayResolution(): void {
    const app = this.app;
    const host = this.resizeHost;
    if (!app || !host) return;

    const resolution = computeDisplayResolution(host);
    if (Math.abs(app.renderer.resolution - resolution) < 0.01) return;
    app.renderer.resize(STORY_WIDTH, STORY_HEIGHT, resolution);
    // autoDensity 在 resize 时会把 style 写回 1280x720 逻辑像素，恢复撑满宿主。
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
  }

  destroy(): void {
    this.stopVideo();
    this.stopCameraShake();
    this.decisionPanel.destroy();
    this.interludePanel.destroy();
    this.animTextPanel.destroy();
    this.avgDisplayPanel.destroy();
    this.spellStickerPanel.destroy();
    this.focusEffectPanel.destroy();
    this.cgItemPanel.destroy();
    this.backgroundRoot = null;
    this.backgroundSprite = null;
    this.backgroundTweenSessionId += 1;
    this.backgroundLayer.removeChildren();
    this.gridBackgroundLayer.removeChildren();
    // panel_large_background is a permanent sibling in front of panel_background,
    // so it goes back as child 0 rather than being re-appended on each gridbg.
    this.backgroundLayer.addChild(this.gridBackgroundLayer);
    this.blockerSprite = null;
    this.gridBackgroundSessionId += 1;
    this.largeBackgroundRoot = null;
    this.largeBackgroundTweenSessionId += 1;
    this.largeImageRoot = null;
    this.largeImageSessionId += 1;
    this.largeImageTweenSessionId += 1;
    this.largeImageRoots.clear();
    this.imageSprite = null;
    this.imageLayer.removeChildren();
    this.itemLayer.removeChildren();
    this.cutinPanel.destroy();
    for (const state of this.characterSlots.values())
      this.disposeCharacterState(state);
    this.characterSlots.clear();
    for (const state of this.curtains.values()) this.disposeCurtainState(state);
    this.curtains.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.resizeListener?.();
    this.resizeListener = null;
    this.resizeHost = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.dialogPanel.destroy();
    this.subtitleText = null;
    this.timerStickerText = null;
    this.clearTimerInterval();
    this.stickerTexts.clear();
    this.stickerFadeSessionIds.clear();
    this.stickerTypingTargets.clear();
    this.stickerTypingSessionIds.clear();
    this.subtitleFadeSessionId += 1;
    this.subtitleTypingTarget = null;
    this.subtitleTypingSessionId += 1;
    this.stickerRichChars.clear();
    this.videoPanel.destroy();
  }

  async playVideo(url: string): Promise<void> {
    await this.videoPanel.play(url);
  }

  async setAnimText(input: AnimTextInput): Promise<void> {
    await this.animTextPanel.show(input);
  }

  async setAvgDisplay(input: AvgDisplayInput): Promise<void> {
    await this.avgDisplayPanel.display(input);
  }

  clearAvgDisplays(): void {
    this.avgDisplayPanel.clear();
  }

  clearAnimTexts(): void {
    this.animTextPanel.clear();
  }

  stopVideo(): void {
    this.videoPanel.stop();
  }

  finishTextTyping(): boolean {
    if (this.subtitleText && this.subtitleTypingTarget) {
      this.subtitleTypingSessionId += 1;
      this.subtitleText.text = this.subtitleTypingTarget.fullText;
      this.layoutSubtitle(
        this.subtitleText,
        this.subtitleTypingTarget.baseX,
        this.subtitleTypingTarget.widthPx,
        this.subtitleTypingTarget.alignment,
      );
      this.subtitleTypingTarget = null;
      return true;
    }

    for (const [id, target] of this.stickerTypingTargets.entries()) {
      const sticker = this.stickerTexts.get(id);
      if (!sticker) continue;
      this.stickerTypingSessionIds.set(
        id,
        (this.stickerTypingSessionIds.get(id) ?? 0) + 1,
      );
      sticker.text = target.fullText;
      this.layoutSubtitle(
        sticker,
        target.baseX,
        target.widthPx,
        target.alignment,
      );
      this.stickerTypingTargets.delete(id);
      return true;
    }

    return false;
  }

  setDialogue(
    speaker: string,
    text: string,
    tagStyles?: Record<string, { fill: string }>,
  ): void {
    this.dialogPanel.setDialogue(speaker, text, tagStyles);
  }

  async showDecision(
    options: string[],
    values: number[],
  ): Promise<DecisionSelection> {
    return this.decisionPanel.show(options, values);
  }

  /**
   * Port scope: `Torappu.AVG.AVGImagePanel._ExecuteImage` / `_LoadImage` for
   * the `background` path: replacement, initial transform, cross-fade, and
   * block boundary. PIXI roots replace the two Unity Image widgets.
   */
  async setBackground(key: string, input?: BackgroundInput): Promise<void> {
    const texture = await this.textureForImageKey(key, "background");
    if (!texture) return;

    this.backgroundTweenSessionId += 1;
    const root = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    this.layoutImageForScreenAdapt(sprite, input?.screenAdapt, true);
    // `_ExecuteImage` reads `xScale`/`yScale` with a 1.0 fallback, so an
    // omitted scale must leave the screen-adapted size alone.
    this.applyCenteredTransform(root, {
      scaleX: input?.scaleX ?? 1,
      scaleY: input?.scaleY ?? 1,
      x: input?.x ?? 0,
      y: input?.y ?? 0,
    });
    root.addChild(sprite);

    const previous = this.backgroundRoot;
    this.backgroundRoot = root;
    this.backgroundSprite = sprite;
    this.backgroundLayer.addChild(root);
    const fadeMs = input?.fadeMs ?? 0;
    root.alpha = fadeMs > 0 ? 0 : 1;
    if (fadeMs <= 0) {
      previous?.removeFromParent();
      return;
    }
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = progress),
      () => previous?.removeFromParent(),
    );
    if (input?.block) await run;
    else void run;
  }

  async clearBackground(fadeMs = 0, block = false): Promise<void> {
    this.backgroundTweenSessionId += 1;
    const root = this.backgroundRoot;
    this.backgroundRoot = null;
    this.backgroundSprite = null;
    if (!root) return;
    if (fadeMs <= 0) {
      root.removeFromParent();
      return;
    }
    const startAlpha = root.alpha;
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = startAlpha * (1 - progress)),
      () => root.removeFromParent(),
    );
    if (block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageTween`'s foreground
   * transform semantics. Browser interpolation replaces the DOTween sequence.
   */
  async setBackgroundTween(input: BackgroundTweenInput): Promise<void> {
    const root = this.backgroundRoot;
    if (!root || root.parent !== this.backgroundLayer) return;

    const current = this.readCenteredTransform(root);
    const from = {
      scaleX: isFiniteNumber(input.xScaleFrom)
        ? input.xScaleFrom
        : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleFrom)
        ? input.yScaleFrom
        : current.scaleY,
      x: isFiniteNumber(input.xFrom) ? input.xFrom : current.x,
      y: isFiniteNumber(input.yFrom) ? input.yFrom : current.y,
    };
    const to = {
      scaleX: isFiniteNumber(input.xScaleTo) ? input.xScaleTo : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleTo) ? input.yScaleTo : current.scaleY,
      x: isFiniteNumber(input.xTo) ? input.xTo : current.x,
      y: isFiniteNumber(input.yTo) ? input.yTo : current.y,
    };

    const sessionId = ++this.backgroundTweenSessionId;
    this.applyCenteredTransform(root, from);

    if (input.durationMs <= 0) {
      this.applyCenteredTransform(root, to);
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (!this.isActiveBackground(root, sessionId)) return;
        this.applyCenteredTransform(root, {
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        });
      },
      () => {
        if (!this.isActiveBackground(root, sessionId)) return;
        this.applyCenteredTransform(root, to);
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Port scope: `Torappu.AVG.LargeBackgroundPanel._ExecuteGridBG` and
   * `_LoadImage`, including all-or-nothing asset loading and replacement.
   * `Container` composition is the Web adaptation of Unity RectTransforms.
   */
  async setGridBackground(input: GridBackgroundInput): Promise<void> {
    const sessionId = ++this.gridBackgroundSessionId;
    this.largeBackgroundTweenSessionId += 1;
    const textures = await Promise.all(
      input.imageKeys.map((key) =>
        this.textureForImageKey(key, input.assetKind ?? "background"),
      ),
    );
    if (!this.app || sessionId !== this.gridBackgroundSessionId) return;

    if (textures.some((texture) => !texture)) return;

    const root = this.buildGridBackgroundRoot(input, textures as Texture[]);
    const previous = [...this.gridBackgroundLayer.children];
    this.largeBackgroundRoot = input.layout === "large" ? root : null;

    root.alpha = input.fadeMs > 0 ? 0 : 1;
    this.gridBackgroundLayer.addChild(root);

    if (input.fadeMs <= 0) {
      for (const child of previous) child.removeFromParent();
      return;
    }

    const run = this.tween(
      input.fadeMs,
      (progress) => {
        if (!this.app || sessionId !== this.gridBackgroundSessionId) return;
        root.alpha = progress;
      },
      () => {
        if (!this.app || sessionId !== this.gridBackgroundSessionId) return;
        root.alpha = 1;
        for (const child of previous) child.removeFromParent();
      },
    );

    if (input.block) await run;
    else void run;
  }

  async clearGridBackground(fadeMs = 0, block = false): Promise<void> {
    const sessionId = ++this.gridBackgroundSessionId;
    this.largeBackgroundRoot = null;
    this.largeBackgroundTweenSessionId += 1;
    const roots = [...this.gridBackgroundLayer.children];
    if (roots.length === 0) return;

    if (fadeMs <= 0) {
      for (const root of roots) root.removeFromParent();
      return;
    }

    const startAlphas = roots.map((root) => root.alpha);
    const run = this.tween(
      fadeMs,
      (progress) => {
        if (!this.app || sessionId !== this.gridBackgroundSessionId) return;
        const nextAlpha = 1 - progress;
        for (const [index, root] of roots.entries()) {
          root.alpha = startAlphas[index]! * nextAlpha;
        }
      },
      () => {
        if (!this.app || sessionId !== this.gridBackgroundSessionId) return;
        for (const root of roots) root.removeFromParent();
      },
    );

    if (block) await run;
    else void run;
  }

  /**
   * Web-only legacy compatibility surface. The investigated client has no
   * `largeimg` command or corresponding native executor, so this must not be
   * represented as a port; it remains isolated from the real `image` path.
   */
  async setLargeImage(input: GridBackgroundInput): Promise<void> {
    const sessionId = ++this.largeImageSessionId;
    this.largeImageTweenSessionId += 1;
    const textures = await Promise.all(
      input.imageKeys.map((key) =>
        this.textureForImageKey(key, input.assetKind ?? "image"),
      ),
    );
    if (!this.app || sessionId !== this.largeImageSessionId) return;

    if (textures.some((texture) => !texture)) return;

    const root = this.buildGridBackgroundRoot(input, textures as Texture[]);
    // largeimg is a legacy-only command and retains its existing transform.
    root.scale.set(1.2);
    const previous = [...this.largeImageRoots];
    this.largeImageRoot = root;

    root.alpha = input.fadeMs > 0 ? 0 : 1;
    this.largeImageRoots.add(root);
    this.imageLayer.addChild(root);

    if (input.fadeMs <= 0) {
      for (const child of previous) {
        child.removeFromParent();
        this.largeImageRoots.delete(child);
      }
      return;
    }

    const run = this.tween(
      input.fadeMs,
      (progress) => {
        if (!this.app || sessionId !== this.largeImageSessionId) return;
        root.alpha = progress;
      },
      () => {
        if (!this.app || sessionId !== this.largeImageSessionId) return;
        root.alpha = 1;
        for (const child of previous) {
          child.removeFromParent();
          this.largeImageRoots.delete(child);
        }
      },
    );

    if (input.block) await run;
    else void run;
  }

  async clearLargeImage(fadeMs = 0, block = false): Promise<void> {
    const sessionId = ++this.largeImageSessionId;
    this.largeImageRoot = null;
    this.largeImageTweenSessionId += 1;
    const roots = [...this.largeImageRoots];
    if (roots.length === 0) return;

    if (fadeMs <= 0) {
      for (const root of roots) {
        root.removeFromParent();
        this.largeImageRoots.delete(root);
      }
      return;
    }

    const startAlphas = roots.map((root) => root.alpha);
    const run = this.tween(
      fadeMs,
      (progress) => {
        if (!this.app || sessionId !== this.largeImageSessionId) return;
        const nextAlpha = 1 - progress;
        for (const [index, root] of roots.entries()) {
          root.alpha = startAlphas[index]! * nextAlpha;
        }
      },
      () => {
        if (!this.app || sessionId !== this.largeImageSessionId) return;
        for (const root of roots) {
          root.removeFromParent();
          this.largeImageRoots.delete(root);
        }
      },
    );

    if (block) await run;
    else void run;
  }

  /**
   * Port scope: `Torappu.AVG.AVGImagePanel._ExecuteImage` / `_LoadImage` for
   * the `image` path. Sprite replacement and fade behavior are preserved;
   * PIXI geometry is an adaptation of the native Image/RectTransform pair.
   */
  async setImage(key: string, input?: BackgroundInput): Promise<void> {
    const texture = await this.textureForImageKey(key, "image");
    if (!texture) return;

    this.imageRotateSessionId += 1;
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    this.layoutImageForScreenAdapt(sprite, input?.screenAdapt);
    sprite.position.set(
      STORY_WIDTH / 2 + (input?.x ?? 0),
      STORY_HEIGHT / 2 - (input?.y ?? 0),
    );
    sprite.scale.x *= input?.scaleX ?? 1;
    sprite.scale.y *= input?.scaleY ?? 1;

    const previous = this.imageSprite;
    this.imageSprite = sprite;
    this.imageLayer.addChild(sprite);
    const fadeMs = input?.fadeMs ?? 0;
    sprite.alpha = fadeMs > 0 ? 0 : 1;
    if (fadeMs <= 0) {
      previous?.removeFromParent();
      return;
    }
    const run = this.tween(
      fadeMs,
      (progress) => (sprite.alpha = progress),
      () => previous?.removeFromParent(),
    );
    if (input?.block) await run;
    else void run;
  }

  async clearImage(fadeMs = 0, block = false): Promise<void> {
    this.imageRotateSessionId += 1;
    const sprite = this.imageSprite;
    this.imageSprite = null;
    if (!sprite) return;
    if (fadeMs <= 0) {
      sprite.removeFromParent();
      return;
    }
    const startAlpha = sprite.alpha;
    const run = this.tween(
      fadeMs,
      (progress) => (sprite.alpha = startAlpha * (1 - progress)),
      () => sprite.removeFromParent(),
    );
    if (block) await run;
    else void run;
  }

  async clearCharacterCutin(widgetId?: string): Promise<void> {
    this.cutinPanel.clear(widgetId);
  }

  async clearInterludes(): Promise<void> {
    await this.interludePanel.clearAll();
  }

  async setInterlude(input: InterludeInput): Promise<void> {
    await this.interludePanel.run(input);
  }

  /**
   * Native port: `Torappu.AVG.AVGCharacterCutinPanel` (build 2761 IDA review):
   * `GetExecutors` @ 0x183e48f70 registers `charactercutin` ->
   * `_ExecuteCharacterCutin` @ 0x183e49440, whose five widgetID/name branches
   * (show / SlotUpdate / hide) live in CharacterCutinPanel together with the
   * `AVGCharacterCutinSlot` Show/SlotUpdate/Hide geometry.
   */
  async setCharacterCutin(input: CharacterCutinInput): Promise<void> {
    if (!this.app) return;
    await this.cutinPanel.run(input);
  }

  private async textureForCutinCharacter(
    input: CharacterCutinInput,
  ): Promise<CutinCharacterArt | null> {
    const base = input.characterKey;
    const expression = input.expression;
    if (!base || !expression) return null;

    const link = this.context.linkMap[base];
    if (!link) {
      this.onWarning?.(`missing character base: ${base}`);
      return null;
    }

    const item = link.array.find((entry) => entry.name === expression);
    if (!item) {
      this.onWarning?.(`missing character expression: ${base}#${expression}`);
      return null;
    }

    let assetKey: string | null = null;
    if (item.group === -1 && "image" in item && item.image) {
      assetKey = item.image;
    } else if (item.group >= 0 && "face" in item && item.face) {
      const g = link.groups[item.group];
      assetKey = g && g.mode === "face_overlay" ? g.base : null;
    }

    if (!assetKey) {
      this.onWarning?.(`invalid cutin character: ${base}#${expression}`);
      return null;
    }

    const texture = await this.textureForCharacterKey(assetKey);
    if (!texture) return null;
    // AVGCharacterSpriteHub.SetImage resizes the character Image to the hub's
    // serialized size and shifts it by pos; the scene character path applies
    // the same layout (see buildCharacterSlotState), so the cutin must too.
    const sizeX = link.size.x || texture.width;
    const sizeY = link.size.y || texture.height;
    return {
      offsetX: link.pos.x || 0,
      offsetY: link.pos.y || 0,
      scaleX: sizeX / Math.max(1, texture.width),
      scaleY: sizeY / Math.max(1, texture.height),
      texture,
    };
  }

  /**
   * Port scope: `Torappu.AVG.AVGShowItemPanel._ExecuteShowItem` / `_ShowItem`.
   * It retains the single-slot replacement and photo fade; PIXI drawing is an
   * approximation of the serialized show-item prefab.
   */
  async showItem(input: ShowItemInput): Promise<void> {
    const texture = await this.textureForImageKey(input.key, "image");
    if (!texture) return;

    // `AVGShowItemPanel._ExecuteShowItem` owns one slot, so a second showitem
    // replaces the first rather than stacking on it. See the command evidence
    // above; PIXI children are only the storage adaptation.
    this.itemLayer.removeChildren();

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);

    const layout = computeLegacyShowItemLayout(texture.width, texture.height);
    sprite.scale.set(layout.scale);

    const border = new Graphics();
    border.rect(
      -layout.contentWidth / 2 - layout.borderPx,
      -layout.contentHeight / 2 - layout.borderPx,
      layout.contentWidth + layout.borderPx * 2,
      layout.borderPx,
    );
    border.fill(0xff_ff_ff);
    border.rect(
      -layout.contentWidth / 2 - layout.borderPx,
      layout.contentHeight / 2,
      layout.contentWidth + layout.borderPx * 2,
      layout.borderPx,
    );
    border.fill(0xff_ff_ff);
    border.rect(
      -layout.contentWidth / 2 - layout.borderPx,
      -layout.contentHeight / 2,
      layout.borderPx,
      layout.contentHeight,
    );
    border.fill(0xff_ff_ff);
    border.rect(
      layout.contentWidth / 2,
      -layout.contentHeight / 2,
      layout.borderPx,
      layout.contentHeight,
    );
    border.fill(0xff_ff_ff);

    const root = new Container();
    root.alpha = input.fadeMs > 0 ? 0 : 1;
    if (input.blackAlpha > 0) {
      const backdrop = new Graphics();
      backdrop.rect(0, 0, STORY_WIDTH, STORY_HEIGHT);
      backdrop.fill({ alpha: input.blackAlpha, color: 0x00_00_00 });
      root.addChild(backdrop);
    }

    const content = new Container();
    content.position.set(
      STORY_WIDTH / 2 + input.offsetX,
      STORY_HEIGHT / 2 + input.offsetY,
    );
    content.addChild(border);
    content.addChild(sprite);
    root.addChild(content);
    this.itemLayer.addChild(root);

    if (input.fadeMs <= 0) return;

    const run = this.tween(input.fadeMs, (progress) => {
      root.alpha = progress;
    });

    if (input.block) await run;
    else void run;
  }

  async showCgItem(input: CgItemInput): Promise<void> {
    await this.cgItemPanel.show(input);
  }

  async clearCgItems(
    key?: string,
    fadeMs = 130,
    ease = "Linear",
    block = false,
  ): Promise<void> {
    await this.cgItemPanel.hide(key, fadeMs, ease, block);
  }

  async clearItems(fadeMs = 0, block = false): Promise<void> {
    const roots = [...this.itemLayer.children];
    if (roots.length === 0) return;

    if (fadeMs <= 0) {
      for (const root of roots) root.removeFromParent();
      return;
    }

    const startAlphas = roots.map((root) => root.alpha);
    const run = this.tween(
      fadeMs,
      (progress) => {
        const nextAlpha = 1 - progress;
        for (const [index, root] of roots.entries()) {
          root.alpha = startAlphas[index]! * nextAlpha;
        }
      },
      () => {
        for (const root of roots) root.removeFromParent();
      },
    );

    if (block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageTween` for the foreground
   * sprite. PIXI interpolation substitutes for native DOTween.
   */
  async setImageTween(input: ImageTweenInput): Promise<void> {
    if (!this.imageSprite) return;

    const sprite = this.imageSprite;
    const fromX = isFiniteNumber(input.xFrom)
      ? STORY_WIDTH / 2 + input.xFrom
      : sprite.position.x;
    const fromY = isFiniteNumber(input.yFrom)
      ? STORY_HEIGHT / 2 - input.yFrom
      : sprite.position.y;
    const targetPositionX = isFiniteNumber(input.xTo)
      ? STORY_WIDTH / 2 + input.xTo
      : sprite.position.x;
    const targetPositionY = isFiniteNumber(input.yTo)
      ? STORY_HEIGHT / 2 - input.yTo
      : sprite.position.y;
    const fromScaleX = isFiniteNumber(input.xScaleFrom)
      ? input.xScaleFrom
      : sprite.scale.x;
    const fromScaleY = isFiniteNumber(input.yScaleFrom)
      ? input.yScaleFrom
      : sprite.scale.y;
    const targetX = isFiniteNumber(input.xScaleTo)
      ? input.xScaleTo
      : sprite.scale.x;
    const targetY = isFiniteNumber(input.yScaleTo)
      ? input.yScaleTo
      : sprite.scale.y;

    sprite.position.set(fromX, fromY);
    sprite.scale.set(fromScaleX, fromScaleY);

    if (input.durationMs <= 0) {
      sprite.scale.set(targetX, targetY);
      sprite.position.set(targetPositionX, targetPositionY);
      return;
    }

    const run = this.tween(input.durationMs, (progress) => {
      const nextX = fromScaleX + (targetX - fromScaleX) * progress;
      const nextY = fromScaleY + (targetY - fromScaleY) * progress;
      sprite.scale.set(nextX, nextY);
      sprite.position.set(
        fromX + (targetPositionX - fromX) * progress,
        fromY + (targetPositionY - fromY) * progress,
      );
    });

    if (input.block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.LargeBackgroundPanel._ExecuteImageTween` for
   * `largebg`; it intentionally uses the panel's direct tween timing.
   */
  async setLargeBackgroundTween(
    input: LargeBackgroundTweenInput,
  ): Promise<void> {
    const root = this.largeBackgroundRoot;
    if (!root || root.parent !== this.gridBackgroundLayer) return;

    const current = this.readCenteredTransform(root);
    const from = {
      scaleX: isFiniteNumber(input.xScaleFrom)
        ? input.xScaleFrom
        : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleFrom)
        ? input.yScaleFrom
        : current.scaleY,
      x: isFiniteNumber(input.xFrom) ? input.xFrom : current.x,
      y: isFiniteNumber(input.yFrom) ? input.yFrom : current.y,
    };
    const to = {
      scaleX: isFiniteNumber(input.xScaleTo) ? input.xScaleTo : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleTo) ? input.yScaleTo : current.scaleY,
      x: isFiniteNumber(input.xTo) ? input.xTo : current.x,
      y: isFiniteNumber(input.yTo) ? input.yTo : current.y,
    };

    const sessionId = ++this.largeBackgroundTweenSessionId;
    this.applyCenteredTransform(root, from);

    if (input.durationMs <= 0) {
      this.applyCenteredTransform(root, to);
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (!this.isActiveLargeBackground(root, sessionId)) return;
        this.applyCenteredTransform(root, {
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        });
      },
      () => {
        if (!this.isActiveLargeBackground(root, sessionId)) return;
        this.applyCenteredTransform(root, to);
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Web-only companion to the legacy `setLargeImage` surface: the investigated
   * client has no `largeimgtween` executor. It is intentionally not a native
   * provenance claim.
   */
  async setLargeImageTween(input: LargeBackgroundTweenInput): Promise<void> {
    const root = this.largeImageRoot;
    if (!root || root.parent !== this.imageLayer) return;

    const current = this.readCenteredTransform(root);
    const from = {
      scaleX: isFiniteNumber(input.xScaleFrom)
        ? input.xScaleFrom
        : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleFrom)
        ? input.yScaleFrom
        : current.scaleY,
      x: isFiniteNumber(input.xFrom) ? input.xFrom : current.x,
      y: isFiniteNumber(input.yFrom) ? input.yFrom : current.y,
    };
    const to = {
      scaleX: isFiniteNumber(input.xScaleTo) ? input.xScaleTo : current.scaleX,
      scaleY: isFiniteNumber(input.yScaleTo) ? input.yScaleTo : current.scaleY,
      x: isFiniteNumber(input.xTo) ? input.xTo : current.x,
      y: isFiniteNumber(input.yTo) ? input.yTo : current.y,
    };

    const sessionId = ++this.largeImageTweenSessionId;
    this.applyCenteredTransform(root, from);

    if (input.durationMs <= 0) {
      this.applyCenteredTransform(root, to);
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (!this.isActiveLargeImage(root, sessionId)) return;
        this.applyCenteredTransform(root, {
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        });
      },
      () => {
        if (!this.isActiveLargeImage(root, sessionId)) return;
        this.applyCenteredTransform(root, to);
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageRotate`: rotate the panel
   * transform rather than its foreground Image, preserving angle across image
   * swaps. `imageLayer` is the corresponding PIXI adaptation.
   */
  async setImageRotate(input: ImageRotateInput): Promise<void> {
    const target = this.imageLayer;
    const sessionId = ++this.imageRotateSessionId;
    const startAngle = target.angle;
    const delta = rotateTweenDelta(
      startAngle,
      input.angleDeg,
      input.circles,
      input.inverse,
    );
    const endAngle = startAngle + delta;

    if (input.durationMs <= 0) {
      target.angle = endAngle;
      return;
    }

    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (this.imageRotateSessionId !== sessionId) return;
        target.angle = startAngle + delta * progress;
      },
      () => {
        if (this.imageRotateSessionId !== sessionId) return;
        target.angle = endAngle;
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Port scope: `Torappu.AVG.CharacterPanel._ExecuteCharacter` and its
   * character-slot branch. Slot state and transitions are preserved; display
   * hierarchy and texture composition are Web/PIXI adaptations.
   */
  async setCharacter(input: CharacterSlotInput): Promise<void> {
    if (this.isCharacterSlotCommand(input)) {
      await this.setCharacterSlot(input);
      return;
    }

    if (!input.characterKey || !input.expression) return;

    const link = this.context.linkMap[input.characterKey];
    if (!link) {
      this.onWarning?.(`missing character base: ${input.characterKey}`);
      return;
    }

    const item = link.array.find((entry) => entry.name === input.expression);
    if (!item) {
      this.onWarning?.(
        `missing character expression: ${input.characterKey}#${input.expression}`,
      );
      return;
    }

    const slot = this.normalizeCharacterSlot(input.slot);
    const slotBaseX: Record<string, number> = {
      // Derived from legacy 960-space anchors [330, 480, 630], scaled to 1280.
      l: 440,
      m: 640,
      r: 840,
    };

    const built = await this.buildCharacterVisual(
      input.characterKey,
      input.expression,
      input.blackStart,
      input.blackEnd,
    );
    if (!built) return;

    const { sourceHeight, sourceWidth, visual } = built;

    const sizeX = link.size.x || sourceWidth;
    const sizeY = link.size.y || sourceHeight;
    const offsetX = link.pos.x || 0;
    const offsetY = link.pos.y || 0;

    // Match legacy char layout semantics in 1280x720 space.
    const targetX = (slotBaseX[slot] ?? slotBaseX.m) - sizeX / 2 + offsetX;
    const targetY = STORY_HEIGHT - sizeY / 2 - offsetY;
    const enterOffset = this.enterOffset(
      slot,
      input.enterFrom,
      input.enterPosition,
    );
    const root = new Container();
    const motionLayer = new Container();
    const rotationLayer = new Container();
    rotationLayer.addChild(visual);
    motionLayer.addChild(rotationLayer);
    root.addChild(motionLayer);
    root.x = targetX;
    root.y = targetY;

    const safeWidth = Math.max(1, sourceWidth);
    const safeHeight = Math.max(1, sourceHeight);
    const baseScaleX = sizeX / safeWidth;
    const baseScaleY = sizeY / safeHeight;
    motionLayer.scale.set(baseScaleX, baseScaleY);
    rotationLayer.pivot.set(sourceWidth / 2, sourceHeight / 2);
    rotationLayer.position.set(sourceWidth / 2, sourceHeight / 2);

    const previous = this.characterSlots.get(slot);
    const focusBrightness = input.dimmed ? 0.5 : 1;
    const durationMs = Math.max(0, Math.round(input.durationMs ?? 0));
    // Native `AVGCharacterSlot.Set` receives `dontFadeIfSameChar=true` from
    // `CharacterPanel._ProcessSlot`. It compares `_GetIdWithoutAliasOrIndex`
    // for the old/new refs and forces only the image fade to zero when that id
    // is unchanged. Cross-fading two copies of the same body sprite causes a
    // visible brightness dip, so expression/focus changes must swap at once.
    const fadeIdentity = input.fadeIdentity ?? input.characterKey;
    // Native `_ProcessSlot`: with an `enter`, the image fade duration goes
    // through `_ProcessDurationWithTransType(duration, transtype)`, which
    // returns 0 for ECharTransType.NONE (0) -- i.e. the default enter is a
    // pure slide with no fade; only ALPHA_IN/ALPHA_OUT fade while sliding.
    // Without `enter` the raw duration is used. `dontFadeIfSameChar` can
    // still zero the fade in both paths.
    const fadeMsForNewImage =
      input.enterFrom && !input.transType ? 0 : durationMs;
    const imageFadeMs =
      previous?.fadeIdentity === fadeIdentity ? 0 : fadeMsForNewImage;
    // An explicit enter still moves for the requested duration even when the
    // same character's expression is swapped instantly.
    const moveMs = input.enterFrom ? durationMs : 0;
    const animationMs = Math.max(imageFadeMs, moveMs);
    // `AVGCharacterSlot.Set` @ 0x183eb38a0 guards its entire swap branch --
    // the `_offset` position reset and the localScale reset included -- with
    // `!op_Equality(m_currentKey, key)`. A re-show under the same key, e.g.
    // the `character(focus=-1)` that follows a `characteraction move`, never
    // reaches the reset, so the slot keeps the offset the move left behind.
    // `m_currentKey` is the raw `name` ref, so `nativeKey` is compared rather
    // than the resolved base/expression pair: `avg_x` and `avg_x#1$1` can
    // resolve alike yet are different keys to native.
    //
    // An `enter` is exempt. `CharacterPanel._ProcessSlot` @ 0x183e6c1c0 takes
    // the branch that first calls `SetCharPos(x, y, 0)` -- which writes that
    // very same `_offset` absolutely (@ 0x183eb3290) -- and then passes
    // `resetOffsetPos = 0`; the closing `SetCharPos(0, 0, duration)` tweens it
    // back to the origin. So a slide always overrides an earlier move.
    const keepsOffset =
      !input.enterFrom &&
      previous !== undefined &&
      input.nativeKey !== undefined &&
      previous.nativeKey === input.nativeKey;
    const state: CharacterRenderState = {
      actionX: keepsOffset ? previous.actionX : 0,
      actionY: keepsOffset ? previous.actionY : 0,
      baseScaleX,
      baseScaleY,
      baseX: targetX,
      baseY: targetY,
      characterKey: input.characterKey,
      contentAlpha: 1,
      focusBrightness,
      expression: input.expression,
      fadeIdentity,
      height: sizeY,
      jumpOffsetY: 0,
      jumpSessionId: 0,
      motionLayer,
      nativeKey: input.nativeKey,
      opacitySessionId: 0,
      replaceFadeSessionId: 0,
      root,
      rotationDeg: 0,
      rotationLayer,
      rotateSessionId: 0,
      rotateTimeout: null,
      scaleX: keepsOffset ? previous.scaleX : 1,
      scaleY: keepsOffset ? previous.scaleY : 1,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      shakeSessionId: 0,
      shakeTimeout: null,
      slot,
      sourceHeight,
      sourceWidth,
      transformSessionId: 0,
      visual,
      width: sizeX,
    };
    this.updateCharacterState(state);

    root.alpha = imageFadeMs > 0 ? 0 : 1;
    if (moveMs > 0) {
      root.x = targetX + enterOffset.x;
      root.y = targetY + enterOffset.y;
    }

    if (previous && imageFadeMs <= 0) this.disposeCharacterState(previous);
    this.characterSlots.set(slot, state);
    this.charLayer.addChild(root);
    this.applyCharacterZOrder(input.focus ?? 0);

    if (previous && imageFadeMs > 0)
      void this.fadeOutAndRemove(previous.root, imageFadeMs, () =>
        this.disposeCharacterState(previous),
      );

    if (animationMs > 0) {
      const run = this.tween(
        animationMs,
        (progress) => {
          root.alpha = imageFadeMs > 0 ? progress : 1;
          // Native `SetCharPos` runs the slide as
          // `DOLocalMove(...).SetEase(Ease.OutCubic)`; the shared tween runner
          // is linear, so ease the move -- and only the move -- here.
          const moveProgress = moveMs > 0 ? easeOutCubic(progress) : 1;
          root.x = targetX + enterOffset.x * (1 - moveProgress);
          root.y = targetY + enterOffset.y * (1 - moveProgress);
        },
        () => {
          root.alpha = 1;
          this.updateCharacterOpacity(state);
          root.x = targetX;
          root.y = targetY;
        },
      );

      void run;
    }
  }

  private async setCharacterSlot(input: CharacterSlotInput): Promise<void> {
    const slot = this.normalizeCharacterSlot(input.slot);
    let state = this.characterSlots.get(slot);
    const hasCharacter = Boolean(input.characterKey && input.expression);

    if (hasCharacter) {
      const built = await this.buildCharacterSlotState(input, slot, state);
      if (!built) return;
      state = built;
    }

    if (!state) {
      if (input.focusMode)
        this.applyCharacterSlotFocus(input.focusMode, slot, input.focusSlots);
      return;
    }

    this.applyCharacterSlotFocus(input.focusMode, slot, input.focusSlots);

    const fromTransform = this.characterSlotFromTransform(state, input);
    const toTransform = this.characterSlotToTransform(
      state,
      input,
      fromTransform,
    );
    const durationMs = Math.max(0, Math.round(input.durationMs ?? 0));

    state.actionX = fromTransform.x;
    state.actionY = fromTransform.y;
    state.scaleX = fromTransform.scaleX;
    state.scaleY = fromTransform.scaleY;
    this.updateCharacterState(state);

    if (input.action === "shake" || input.action === "shakemove") {
      this.startShakeAction(state, {
        block: false,
        durationMs,
        power: Math.max(0, input.power ?? 0),
        randomness: input.randomness ?? 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        slot,
        stop: Boolean(input.stop),
        times: input.times ?? 1,
        type: "shake",
        xOffset: 0,
        yOffset: 0,
      });
    }

    if (input.action === "jump")
      this.startJumpAction(
        state,
        Math.max(0, input.power ?? 0),
        input.times ?? 1,
        durationMs,
      );

    if (input.action === "rotate" && input.angle !== undefined) {
      const sessionId = ++state.rotateSessionId;
      const fromAngle = state.rotationDeg;
      const direction = input.inverse ? -1 : 1;
      const toAngle = direction * (input.angle + 360 * (input.circles ?? 0));
      void this.tween(durationMs, (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.rotateSessionId !== sessionId
        )
          return;
        state.rotationDeg = fromAngle + (toAngle - fromAngle) * progress;
        this.updateCharacterState(state);
      });
    }

    this.applyCharacterSlotOpacity(state, input, durationMs);
    if (input.action === "shake") return;

    const sessionId = ++state.transformSessionId;
    const transformDurationMs = input.action === "setpos" ? 0 : durationMs;
    const run = this.tween(
      transformDurationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX =
          fromTransform.x + (toTransform.x - fromTransform.x) * progress;
        state.actionY =
          fromTransform.y + (toTransform.y - fromTransform.y) * progress;
        state.scaleX =
          fromTransform.scaleX +
          (toTransform.scaleX - fromTransform.scaleX) * progress;
        state.scaleY =
          fromTransform.scaleY +
          (toTransform.scaleY - fromTransform.scaleY) * progress;
        this.updateCharacterState(state);
      },
      () => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = toTransform.x;
        state.actionY = toTransform.y;
        state.scaleX = toTransform.scaleX;
        state.scaleY = toTransform.scaleY;
        this.updateCharacterState(state);
      },
    );

    if (!input.block || transformDurationMs <= 0) void run;
    else await run;
  }

  /**
   * Port scope: `Torappu.AVG.CharacterPanel._ExecuteCharacterAction` and its
   * move/jump/shake/zoom/exit handlers. Browser tween sampling adapts DOTween,
   * but keeps the per-action state and completion boundary.
   */
  async runCharacterAction(input: CharacterActionInput): Promise<void> {
    const state = this.characterSlots.get(
      this.normalizeCharacterSlot(input.slot),
    );
    if (!state) {
      this.onWarning?.(`missing character slot: ${input.slot}`);
      return;
    }

    switch (input.type) {
      case "move": {
        await this.runMoveAction(
          state,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          input.block,
        );
        return;
      }
      case "jump": {
        this.startJumpAction(state, input.power, input.times, input.durationMs);
        await this.runMoveAction(
          state,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          input.block,
        );
        return;
      }
      case "shake": {
        this.startShakeAction(state, input);
        return;
      }
      case "zoom": {
        await this.runScaleAction(
          state,
          input.scaleX,
          input.scaleY,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          input.block,
        );
        return;
      }
      case "exit": {
        await this.runExitAction(
          state,
          input.durationMs,
          input.direction,
          input.yOffset,
          input.block,
        );
      }
    }
  }

  async clearCharacters(slot?: string, fadeMs = 0): Promise<void> {
    if (slot) {
      const normalized = this.normalizeCharacterSlot(slot);
      const state = this.characterSlots.get(normalized);
      if (!state) return;
      this.characterSlots.delete(normalized);
      if (fadeMs > 0)
        await this.fadeOutAndRemove(state.root, fadeMs, () =>
          this.disposeCharacterState(state),
        );
      else this.disposeCharacterState(state);
      return;
    }

    const states = [...this.characterSlots.values()];
    this.characterSlots.clear();
    if (fadeMs > 0) {
      await Promise.all(
        states.map((state) =>
          this.fadeOutAndRemove(state.root, fadeMs, () =>
            this.disposeCharacterState(state),
          ),
        ),
      );
      return;
    }
    for (const state of states) this.disposeCharacterState(state);
  }

  async clearCurtains(fadeMs = 0, block = false): Promise<void> {
    const states = [...this.curtains.values()];
    if (states.length === 0) return;

    if (fadeMs <= 0) {
      for (const state of states)
        this.removeCurtainState(state.direction, state);
      return;
    }

    const run = Promise.all(
      states.map((state) =>
        this.setCurtain({
          alphaFrom: state.alpha,
          alphaTo: state.alpha,
          block,
          direction: state.direction,
          delayMs: 0,
          fadeMs,
          fillFrom: state.fill,
          fillTo: 0,
          grad: false,
        }),
      ),
    );

    if (block) await run;
    else void run;
  }

  async clearSubtitle(fadeMs = 0): Promise<void> {
    this.subtitleTypingSessionId += 1;
    this.subtitleFadeSessionId += 1;
    this.subtitleTypingTarget = null;

    const subtitle = this.subtitleText;
    if (!subtitle) return;

    if (!subtitle.visible || !subtitle.text) {
      subtitle.text = "";
      subtitle.visible = false;
      subtitle.alpha = 1;
      return;
    }

    const sessionId = this.subtitleFadeSessionId;
    const startAlpha = subtitle.alpha;
    if (fadeMs <= 0) {
      subtitle.text = "";
      subtitle.visible = false;
      subtitle.alpha = 1;
      return;
    }

    await this.tween(
      fadeMs,
      (progress) => {
        if (this.subtitleFadeSessionId !== sessionId) return;
        subtitle.alpha = startAlpha * (1 - progress);
      },
      () => {
        if (this.subtitleFadeSessionId !== sessionId) return;
        subtitle.text = "";
        subtitle.visible = false;
        subtitle.alpha = 1;
      },
    );
  }

  async clearSticker(id?: string, fadeMs = 0): Promise<void> {
    if (!id) {
      await this.clearStickers(fadeMs);
      return;
    }

    const sticker = this.stickerTexts.get(id);
    if (!sticker) return;

    this.bumpStickerSessions(id);
    this.stickerTypingTargets.delete(id);
    this.stickerRichChars.delete(id);
    if (!sticker.visible || !sticker.text) {
      sticker.text = "";
      sticker.visible = false;
      sticker.alpha = 1;
      return;
    }

    const sessionId = this.stickerFadeSessionIds.get(id) ?? 0;
    const startAlpha = sticker.alpha;
    if (fadeMs <= 0) {
      sticker.text = "";
      sticker.visible = false;
      sticker.alpha = 1;
      return;
    }

    void this.tween(
      fadeMs,
      (progress) => {
        if ((this.stickerFadeSessionIds.get(id) ?? 0) !== sessionId) return;
        sticker.alpha = startAlpha * (1 - progress);
      },
      () => {
        if ((this.stickerFadeSessionIds.get(id) ?? 0) !== sessionId) return;
        sticker.text = "";
        sticker.visible = false;
        sticker.alpha = 1;
      },
    );
  }

  async clearStickers(fadeMs = 0): Promise<void> {
    this.stickerRichChars.clear();
    for (const id of this.stickerTexts.keys())
      await this.clearSticker(id, fadeMs);
  }

  clearSpellStickers(): void {
    this.spellStickerPanel.clear();
  }

  hideSpellSticker(id: string): void {
    this.spellStickerPanel.hide(id);
  }

  async clearTimerSticker(input?: TimerClearInput): Promise<void> {
    this.clearTimerInterval();

    const timer = this.timerStickerText;
    if (!timer) return;

    if (!input) {
      timer.text = "";
      timer.visible = false;
      timer.alpha = 1;
      return;
    }

    const fromAlpha = timer.alpha;
    if (input.durationMs <= 0) {
      timer.alpha = 0;
      timer.visible = false;
      return;
    }

    void this.tween(
      input.durationMs,
      (progress) => {
        timer.alpha = fromAlpha * (1 - progress);
      },
      () => {
        timer.alpha = 0;
        timer.visible = false;
      },
    );
  }

  /**
   * Port scope: `Torappu.AVG.AVGBlockerPanel._ExecuteBlocker`, including the
   * zero-duration and idempotent inverse branches. A PIXI sprite stands in for
   * the native blocker view.
   */
  async setBlocker(input: BlockerInput): Promise<void> {
    const blocker = this.ensureBlocker();
    if (input.style === "default" && input.image) {
      const url = resolveStoryAssetByKey(input.image, false);
      if (url) {
        try {
          blocker.texture = await Assets.load<Texture>(url);
          blocker.width = STORY_WIDTH;
          blocker.height = STORY_HEIGHT;
        } catch {
          this.onWarning?.(`missing blocker image: ${input.image}`);
        }
      }
    } else if (input.style !== "default") {
      blocker.texture = Texture.WHITE;
      this.onWarning?.(`unsupported_visual blocker:${input.style}`);
    }

    const current = this.readBlockerColor(blocker);
    const from = {
      a: Number.isFinite(input.from.a) ? input.from.a : current.a,
      b: Number.isFinite(input.from.b) ? input.from.b : current.b,
      g: Number.isFinite(input.from.g) ? input.from.g : current.g,
      r: Number.isFinite(input.from.r) ? input.from.r : current.r,
    };
    this.writeBlockerColor(blocker, from);

    if (input.fadeMs <= 0) {
      // The zero-fadetime path returns before the inverse block, so scale is
      // untouched here.
      this.writeBlockerColor(blocker, input.to);
      return;
    }

    // `AVGBlockerPanel._ExecuteBlocker` assigns literal -1 rather than negating
    // the current axis: repeated inverse commands are idempotent, and only reset
    if (input.inverse) {
      if (input.style === "slider") blocker.scale.x = -1;
      else if (input.style === "verticalslider") blocker.scale.y = -1;
    }

    const run = this.tween(
      input.fadeMs,
      (progress) => {
        this.writeBlockerColor(blocker, {
          a: from.a + (input.to.a - from.a) * progress,
          b: from.b + (input.to.b - from.b) * progress,
          g: from.g + (input.to.g - from.g) * progress,
          r: from.r + (input.to.r - from.r) * progress,
        });
      },
      () => {
        if (Math.abs(input.to.a) <= 1e-6) {
          blocker.texture = Texture.WHITE;
          blocker.visible = false;
        }
      },
    );

    if (input.block) await run;
    else void run;
  }

  /**
   * Port scope: `Torappu.AVG.AVGCurtainPanel._ExecuteCurtain`. It keeps the
   * direction state, delayed size/alpha transition, and zero-duration branch;
   * Graphics rectangles are a Web/PIXI adaptation of `AVGCurtain` widgets.
   */
  async setCurtain(input: CurtainInput): Promise<void> {
    const direction = input.direction;
    const vector = this.resolveCurtainVector(direction);
    if (!vector) {
      this.onWarning?.(`unsupported curtain direction: ${input.direction}`);
      return;
    }

    const state = this.ensureCurtainState(direction);
    const fromFill = clamp01(input.fillFrom ?? state.fill);
    const toFill = clamp01(input.fillTo);
    const fromAlpha = clamp01(input.alphaFrom ?? state.alpha);
    const toAlpha = clamp01(input.alphaTo ?? fromAlpha);

    state.fill = fromFill;
    state.alpha = fromAlpha;
    state.grad = input.grad;
    this.updateCurtainState(state, vector);

    if (input.fadeMs <= 0) {
      state.fill = toFill;
      state.alpha = toAlpha;
      this.updateCurtainState(state, vector);
      if (toFill <= 0) this.removeCurtainState(direction, state);
      return;
    }

    const sessionId = ++state.tweenSessionId;
    const animate = () =>
      this.tween(
        input.fadeMs,
        (progress) => {
          if (!this.isActiveCurtainState(direction, state, sessionId)) return;
          state.fill = fromFill + (toFill - fromFill) * progress;
          state.alpha = fromAlpha + (toAlpha - fromAlpha) * progress;
          this.updateCurtainState(state, vector);
        },
        () => {
          if (!this.isActiveCurtainState(direction, state, sessionId)) return;
          state.fill = toFill;
          state.alpha = toAlpha;
          this.updateCurtainState(state, vector);
          if (toFill <= 0) this.removeCurtainState(direction, state);
        },
      );
    const run =
      input.delayMs > 0
        ? new Promise<void>((resolve) =>
            setTimeout(resolve, input.delayMs),
          ).then(animate)
        : animate();

    if (input.block) await run;
    else void run;
  }

  /**
   * Port scope: `Torappu.AVG.AVGCameraEffect._ExecuteCameraEffect` for the
   * grayscale/inverse branches and their completion behavior. A PIXI color
   * filter substitutes for `AVGSceneEffectManager`'s camera post-process.
   *
   * Deliberately unported (verified on 2.7.61 / build 2761 IDA decompile):
   * - Chaos: dual-material distortion, intentionally skipped upstream.
   * - Reset lifecycle: native `OnReset`/`ShouldResetOnSkip=true` clears the
   *   effect record on story reset/skip; the web player rebuilds the renderer
   *   per playback instead, so no explicit reset exists here.
   * - Colorinverse amount is a shader `_Inverse` float natively (interpolable
   *   0..1, modeled below as `lerp(prev, 1-prev, inverse)` in the matrix).
   */
  async setCameraEffect(
    effect: "Colorinverse" | "Grayscale",
    amount: number,
    durationMs: number,
    block: boolean,
    keep: boolean,
    initialAmount?: number,
  ): Promise<void> {
    if (effect === "Colorinverse") {
      this.inverseAmount = amount;
      this.updateCameraFilter();
      return;
    }
    // Native `_TweenGrayscaleAmount` (2.7.61 VA 0x183E33C60): a negative
    // initamount (not just the omitted key's -1 default) starts from the
    // current grayscale amount via GetEffectAmount("grayscale", "grayscale");
    // other values are the explicit tween start. Native tests it with
    // MathUtil.LT(initAmount, 0), which decompiles to `-1e-5 > initAmount`, so
    // its real threshold sits an epsilon below 0; the plain `>= 0` here only
    // differs over [-1e-5, 0), which no story script hits.
    const from =
      initialAmount !== undefined && initialAmount >= 0
        ? initialAmount
        : this.grayscaleAmount;
    this.grayscaleAmount = from;
    this.updateCameraFilter();
    const run = this.tween(
      durationMs,
      (progress) => {
        // Native: the executor never calls SetEase, so DOTween.To tweens with
        // DOTween's default ease. This build ships DOTween 1.2.760, whose
        // cctor (VA 0x18410B0E0) writes defaultEaseType = 6 = Ease.OutQuad
        // (fast-then-slow), not linear. DOTween.AutoInit does let a
        // Resources/DOTweenSettings asset overwrite that field, and the asset
        // lives in the player's resources.assets rather than a hot-update
        // bundle so it cannot be read here — but OutQuad is also
        // DOTweenSettings' own default, so the compiled value stands.
        // DOTween's OutQuad is `-t*(t-2)`, i.e. the 1-(1-t)^2 below.
        const eased = 1 - (1 - progress) ** 2;
        this.grayscaleAmount = from + (amount - from) * eased;
        this.updateCameraFilter();
      },
      () => {
        this.grayscaleAmount = keep ? amount : 0;
        this.updateCameraFilter();
      },
    );
    if (block) await run;
    else void run;
  }

  async setFocusOut(input: FocusOutInput): Promise<void> {
    await this.focusEffectPanel.setFocus(input);
  }

  setFocusParam(input: FocusParamInput): void {
    this.focusEffectPanel.setParam(input);
  }

  private updateCameraFilter(): void {
    if (this.grayscaleAmount === 0 && this.inverseAmount === 0) {
      this.sceneLayer.filters = [];
      this.grayscaleFilter = null;
      return;
    }

    if (!this.grayscaleFilter) this.grayscaleFilter = new ColorMatrixFilter();

    // Native AVGSceneGrayScale blits the scene once with
    // AVG/[UC]Common/Arts/Materials/mat_grayscale, writing
    // `_Params = (0.299, 0.587, 0.114, grayAmount)` and `_Inverse`. See
    // buildColorEffectMatrix for the shader math and why pixi's
    // grayscale()/negative() helpers cannot express it.
    this.grayscaleFilter.matrix = buildColorEffectMatrix(
      this.grayscaleAmount,
      this.inverseAmount,
    );
    this.sceneLayer.filters = [this.grayscaleFilter];
  }

  private resolveFocusTargets(type: string, id: string): Container[] {
    switch (type) {
      case "bg": {
        return [this.backgroundLayer];
      }
      case "char": {
        return [this.charLayer];
      }
      // `AVGImagePanel._PostDisplayKey` registers ck_cg_1/2 for `image`'s
      // fore/back images, not CG objects.
      case "cg": {
        return [this.imageLayer];
      }
      // `LargeBackgroundPanel._PostDisplayKey` registers ck_lbg_1..4 over its
      // `_images` list, which only `largebg` fills.
      case "lbg": {
        return this.largeBackgroundRoot ? [this.largeBackgroundRoot] : [];
      }
      case "cgitem": {
        return this.cgItemPanel.targets(id);
      }
      case "customchar": {
        if (!id)
          return [...this.characterSlots.values()].map((state) => state.root);
        const state = this.characterSlots.get(this.normalizeCharacterSlot(id));
        return state ? [state.root] : [];
      }
      default: {
        return [];
      }
    }
  }

  /**
   * Port of `Torappu.AVG.AVGCameraEffect._ExecuteCameraShake`: it moves the
   * scene root, not independent visual layers. Path sampling is a Web/PIXI
   * adaptation of DOTween's shake tween.
   */
  async shakeCamera(input: CameraShakeInput): Promise<void> {
    this.stopCameraShake();

    if (input.stop || input.durationMs <= 0) return;

    const sessionId = ++this.cameraShakeSessionId;
    const path = buildShakePath(input.durationMs, input);
    const runCycle = async (): Promise<void> => {
      await this.tween(input.durationMs, (progress) => {
        if (sessionId !== this.cameraShakeSessionId) return;
        const offset = sampleShakePath(path, progress);
        this.sceneLayer.position.set(offset.x, offset.y);
      });
      if (sessionId !== this.cameraShakeSessionId) return;
      if (input.infinite) {
        void runCycle();
        return;
      }
      this.stopCameraShake(sessionId);
    };

    let wait: Promise<void> | undefined;
    if (input.block) {
      wait = new Promise<void>((resolve) => {
        this.cameraShakeWaitResolve = resolve;
      });
    }

    void runCycle();

    if (wait) {
      await wait;
      this.cameraShakeWaitResolve = null;
    }
  }

  /**
   * Port scope: `Torappu.AVG.SubtitlePanel._ExecuteSubtitle` normal-playback
   * semantics. PIXI text/typewriter scheduling adapts `AVGTypeWriterText`;
   * playback/reader-mode executor variants are intentionally not represented.
   */
  async setSubtitle(input: SubtitleInput): Promise<void> {
    const subtitle = this.subtitleText;
    if (!subtitle) return;

    this.subtitleTypingSessionId += 1;
    this.subtitleFadeSessionId += 1;
    this.subtitleTypingTarget = null;
    subtitle.alpha = 0;
    subtitle.visible = true;

    const fadeSessionId = this.subtitleFadeSessionId;
    void this.tween(
      150,
      (progress) => {
        if (this.subtitleFadeSessionId === fadeSessionId)
          subtitle.alpha = progress;
      },
      () => {
        if (this.subtitleFadeSessionId === fadeSessionId) subtitle.alpha = 1;
      },
    );

    const prevChars: RichChar[] = [];
    const newChars = parseRichChars(input.text);
    const allChars = [...prevChars, ...newChars];

    const colors = collectColors(allChars);
    const style = this.createOverlayTextStyle(input.sizePx, input.widthPx);
    if (colors.length > 0) style.tagStyles = buildTagStyles(colors);
    subtitle.style = style;
    subtitle.y = input.y;

    const fullText = richCharsToTaggedText(allChars);
    if (input.delayMs <= 0) {
      subtitle.text = fullText;
      this.layoutSubtitle(subtitle, input.x, input.widthPx, input.alignment);
      return;
    }

    const sessionId = this.subtitleTypingSessionId;
    subtitle.text = richCharsToTaggedText(prevChars);
    this.layoutSubtitle(subtitle, input.x, input.widthPx, input.alignment);
    this.subtitleTypingTarget = {
      alignment: input.alignment,
      baseX: input.x,
      fullText,
      widthPx: input.widthPx,
    };
    void this.runSubtitleTyping(sessionId, subtitle, {
      alignment: input.alignment,
      baseX: input.x,
      delayMs: input.delayMs,
      prevChars,
      newChars,
      widthPx: input.widthPx,
    });
  }

  /**
   * Port scope: `Torappu.AVG.StickerPanel._ExecuteSticker` and its append,
   * fade, and typewriter state. PIXI Text replaces the native sticker prefab.
   */
  async setSticker(input: StickerInput): Promise<void> {
    const sticker = this.ensureStickerText(input.id);
    const wasActive = this.stickerRichChars.has(input.id);
    this.bumpStickerSessions(input.id);
    sticker.alpha = wasActive ? sticker.alpha : 0;
    sticker.visible = true;

    if (!wasActive) {
      const fadeSessionId = this.stickerFadeSessionIds.get(input.id) ?? 0;
      void this.tween(
        input.fadeMs,
        (progress) => {
          if ((this.stickerFadeSessionIds.get(input.id) ?? 0) === fadeSessionId)
            sticker.alpha = progress;
        },
        () => {
          if ((this.stickerFadeSessionIds.get(input.id) ?? 0) === fadeSessionId)
            sticker.alpha = 1;
        },
      );
    }

    const prevChars = input.append
      ? (this.stickerRichChars.get(input.id) ?? [])
      : [];
    const newChars = parseRichChars(input.text);
    const allChars = [...prevChars, ...newChars];
    this.stickerRichChars.set(input.id, allChars);

    const colors = collectColors(allChars);
    const style = this.createOverlayTextStyle(input.sizePx, input.widthPx);
    if (colors.length > 0) style.tagStyles = buildTagStyles(colors);
    sticker.style = style;
    sticker.y = input.y;

    const fullText = richCharsToTaggedText(allChars);
    if (input.delayMs <= 0) {
      sticker.text = fullText;
      this.layoutSubtitle(sticker, input.x, input.widthPx, input.alignment);
      return;
    }

    const sessionId = this.stickerTypingSessionIds.get(input.id) ?? 0;
    sticker.text = richCharsToTaggedText(prevChars);
    this.layoutSubtitle(sticker, input.x, input.widthPx, input.alignment);
    this.stickerTypingTargets.set(input.id, {
      alignment: input.alignment,
      baseX: input.x,
      fullText,
      widthPx: input.widthPx,
    });
    void this.runStickerTyping(input.id, sessionId, sticker, {
      alignment: input.alignment,
      baseX: input.x,
      delayMs: input.delayMs,
      prevChars,
      newChars,
      widthPx: input.widthPx,
    });
  }

  setSpellSticker(input: SpellStickerInput): void {
    this.spellStickerPanel.show(input);
  }

  /**
   * Port scope: `Torappu.AVG.StickerPanel._ExcuteTimerSticker` (native spelling)
   * and `AVGTimerView.RenderTimer`. Browser intervals and PIXI text adapt the
   * native timer view; this command itself never supplies a block boundary.
   */
  async setTimerSticker(input: TimerStickerInput): Promise<void> {
    const timer = this.ensureTimerStickerText();
    this.clearTimerInterval();

    timer.style = this.createOverlayTextStyle(input.sizePx, input.widthPx);
    timer.alpha = input.fromAlpha;
    timer.visible = true;
    timer.x = input.x;
    timer.y = input.y;
    timer.text = this.formatTimer(0);

    void this.tween(
      input.durationMs > 0 ? input.durationMs : 130,
      (progress) => {
        timer.alpha =
          input.fromAlpha + (input.toAlpha - input.fromAlpha) * progress;
      },
      () => {
        timer.alpha = input.toAlpha;
      },
    );

    if (input.limitSeconds === undefined || input.limitSeconds <= 0) return;

    let remainingSeconds = input.limitSeconds;
    this.timerStickerInterval = setInterval(() => {
      remainingSeconds = Math.max(0, remainingSeconds - 1);
      if (!this.timerStickerText) return;

      this.timerStickerText.text = this.formatTimer(remainingSeconds);
      if (remainingSeconds <= 0) this.clearTimerInterval();
    }, 1000);
  }

  private async createUi(): Promise<void> {
    await this.dialogPanel.mount();
    this.subtitleText = new Text({
      style: this.createOverlayTextStyle(18, 675),
      text: "",
    });
    this.subtitleText.visible = false;
    this.timerStickerText = new Text({
      style: this.createOverlayTextStyle(18, 220),
      text: "",
    });
    this.timerStickerText.visible = false;

    this.uiLayer.addChild(this.subtitleText);
    this.uiLayer.addChild(this.timerStickerText);
  }

  private ensureBlocker(): Sprite {
    if (this.blockerSprite) return this.blockerSprite;

    const blocker = new Sprite(Texture.WHITE);
    blocker.width = STORY_WIDTH;
    blocker.height = STORY_HEIGHT;
    blocker.tint = 0x00_00_00;
    blocker.alpha = 0;

    this.blockerSprite = blocker;
    this.worldLayer.addChild(blocker);

    return blocker;
  }

  private ensureCurtainState(direction: number): CurtainRenderState {
    const existing = this.curtains.get(direction);
    if (existing) return existing;

    const graphic = new Graphics();
    graphic.visible = false;
    this.curtainLayer.addChild(graphic);

    const state: CurtainRenderState = {
      alpha: 1,
      direction,
      fill: 0,
      grad: false,
      graphic,
      tweenSessionId: 0,
    };
    this.curtains.set(direction, state);
    return state;
  }

  private updateCurtainState(
    state: CurtainRenderState,
    vector: { x: number; y: number },
  ): void {
    state.graphic.alpha = clamp01(state.alpha);
    state.graphic.clear();

    if (state.graphic.alpha <= 0 || state.fill <= 0) {
      state.graphic.visible = false;
      return;
    }

    const threshold = this.curtainThreshold(vector, state.fill);
    if (threshold === null) {
      state.graphic.visible = false;
      return;
    }

    state.graphic.visible = true;

    // The curtain body is a solid black quad (_curtainImg is sprite_white tinted
    // (0,0,0,1)). `grad` adds a separate CURTAIN_GRADIENT_PX strip on the inner
    // edge, opaque on the curtain side and fully transparent toward the screen
    // centre -- it does not fade the whole body.
    const bodyEnd = state.grad ? threshold - CURTAIN_GRADIENT_PX : threshold;
    const body = this.buildCurtainBand(vector, null, bodyEnd);
    if (body.length >= 6) state.graphic.poly(body).fill(0x00_00_00);

    if (!state.grad) return;

    const feather = this.buildCurtainBand(vector, bodyEnd, threshold);
    if (feather.length < 6) return;

    state.graphic.poly(feather).fill(
      new FillGradient({
        colorStops: [
          { color: "rgba(0, 0, 0, 1)", offset: 0 },
          { color: "rgba(0, 0, 0, 0)", offset: 1 },
        ],
        end: { x: vector.x * threshold, y: vector.y * threshold },
        start: { x: vector.x * bodyEnd, y: vector.y * bodyEnd },
        textureSpace: "global",
        type: "linear",
      }),
    );
  }

  /** Projection along `vector` where the curtain's inner edge sits. */
  private curtainThreshold(
    vector: { x: number; y: number },
    fill: number,
  ): number | null {
    const clampedFill = clamp01(fill);
    if (clampedFill <= 0) return null;

    const projections = CURTAIN_STAGE_CORNERS.map(
      (point) => point.x * vector.x + point.y * vector.y,
    );
    const min = Math.min(...projections);
    const max = Math.max(...projections);
    if (Math.abs(max - min) <= 1e-6) return null;

    return min + (max - min) * clampedFill;
  }

  /** Stage rect clipped to `low <= projection <= high`; `null` low means unbounded. */
  private buildCurtainBand(
    vector: { x: number; y: number },
    low: number | null,
    high: number,
  ): number[] {
    let polygon = this.clipCurtainPolygon(
      [...CURTAIN_STAGE_CORNERS],
      vector,
      high,
    );
    if (low !== null) {
      polygon = this.clipCurtainPolygon(
        polygon,
        { x: -vector.x, y: -vector.y },
        -low,
      );
    }
    if (polygon.length < 3) return [];
    return polygon.flatMap((point) => [point.x, point.y]);
  }

  private clipCurtainPolygon(
    polygon: Array<{ x: number; y: number }>,
    vector: { x: number; y: number },
    threshold: number,
  ): Array<{ x: number; y: number }> {
    const output: Array<{ x: number; y: number }> = [];
    const last = polygon.at(-1);
    if (!last) return output;
    let previous = last;
    let previousInside = this.isCurtainPointInside(previous, vector, threshold);

    for (const current of polygon) {
      const currentInside = this.isCurtainPointInside(
        current,
        vector,
        threshold,
      );
      if (currentInside !== previousInside)
        output.push(
          this.intersectCurtainEdge(previous, current, vector, threshold),
        );
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }

    return output;
  }

  private isCurtainPointInside(
    point: { x: number; y: number },
    vector: { x: number; y: number },
    threshold: number,
  ): boolean {
    return point.x * vector.x + point.y * vector.y <= threshold + 1e-6;
  }

  private intersectCurtainEdge(
    start: { x: number; y: number },
    end: { x: number; y: number },
    vector: { x: number; y: number },
    threshold: number,
  ): { x: number; y: number } {
    const startProjection = start.x * vector.x + start.y * vector.y;
    const endProjection = end.x * vector.x + end.y * vector.y;
    const delta = endProjection - startProjection;
    if (Math.abs(delta) <= 1e-6) return { ...start };

    const ratio = (threshold - startProjection) / delta;
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    };
  }

  private resolveCurtainVector(
    direction: number,
  ): { x: number; y: number } | null {
    const mappedAngles: Record<number, number> = {
      0: 180,
      1: 225,
      2: 270,
      3: 315,
      4: 0,
      5: 45,
      6: 90,
      7: 135,
    };

    const angleDeg = mappedAngles[direction];
    if (angleDeg === undefined) return null;

    const radians = (angleDeg * Math.PI) / 180;
    return {
      x: Math.sin(radians),
      y: -Math.cos(radians),
    };
  }

  private async buildCharacterVisual(
    characterKey: string,
    expression: string,
    blackStart?: number,
    blackEnd?: number,
  ): Promise<CharacterBuiltVisual | null> {
    const link = this.context.linkMap[characterKey];
    if (!link) {
      this.onWarning?.(`missing character base: ${characterKey}`);
      return null;
    }

    const item = link.array.find((entry) => entry.name === expression);
    if (!item) {
      this.onWarning?.(
        `missing character expression: ${characterKey}#${expression}`,
      );
      return null;
    }

    const visual = new Container();
    const content = new Container();
    visual.addChild(content);

    let sourceWidth: number;
    let sourceHeight: number;
    // Every sprite that contributes character pixels, in draw order. Native
    // composites the face into the *same* material as the body (`SetSprite`
    // feeds the face through `_HGDynamicTex`) and only then applies
    // `_BlackStart`/`_BlackEnd`, so the gradient must be baked over the whole
    // stack -- baking the face alone would leave the body its original colour.
    const contentSprites: Sprite[] = [];

    if (item.group === -1 && "image" in item && item.image) {
      const texture = await this.textureForCharacterKey(item.image);
      if (!texture) return null;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0, 0);
      content.addChild(sprite);
      contentSprites.push(sprite);
      sourceWidth = texture.width;
      sourceHeight = texture.height;
    } else if (item.group >= 0 && "face" in item && item.face) {
      const group = link.groups[item.group];
      if (!group || group.mode !== "face_overlay") {
        this.onWarning?.(
          `unsupported character group: ${characterKey}#${expression}`,
        );
        return null;
      }

      const [baseTexture, faceTexture] = await Promise.all([
        this.textureForCharacterKey(group.base),
        this.textureForCharacterKey(item.face),
      ]);
      if (!baseTexture || !faceTexture) return null;

      const baseSprite = new Sprite(baseTexture);
      baseSprite.anchor.set(0, 0);
      content.addChild(baseSprite);
      contentSprites.push(baseSprite);

      const faceSprite = new Sprite(faceTexture);
      faceSprite.anchor.set(0, 0);
      faceSprite.x = group.faceRect.x;
      faceSprite.y = group.faceRect.y;
      faceSprite.width = group.faceRect.w;
      faceSprite.height = group.faceRect.h;
      content.addChild(faceSprite);
      contentSprites.push(faceSprite);

      sourceWidth = baseTexture.width;
      sourceHeight = baseTexture.height;
    } else {
      this.onWarning?.(`invalid character item: ${characterKey}#${expression}`);
      return null;
    }

    this.applyCharacterBlackGradient(
      content,
      contentSprites,
      sourceWidth,
      sourceHeight,
      blackStart,
      blackEnd,
    );
    return { sourceHeight, sourceWidth, visual };
  }

  private async buildCharacterSlotState(
    input: CharacterSlotInput,
    slot: string,
    current?: CharacterRenderState,
  ): Promise<CharacterRenderState | null> {
    if (!input.characterKey || !input.expression) return current ?? null;

    const link = this.context.linkMap[input.characterKey];
    if (!link) {
      this.onWarning?.(`missing character base: ${input.characterKey}`);
      return null;
    }

    const built = await this.buildCharacterVisual(
      input.characterKey,
      input.expression,
      input.blackStart,
      input.blackEnd,
    );
    if (!built) return null;

    const slotBaseX: Record<string, number> = { l: 440, m: 640, r: 840 };
    const sizeX = link.size.x || built.sourceWidth;
    const sizeY = link.size.y || built.sourceHeight;
    const offsetX = link.pos.x || 0;
    const offsetY = link.pos.y || 0;
    const baseX = (slotBaseX[slot] ?? slotBaseX.m) - sizeX / 2 + offsetX;
    const baseY = STORY_HEIGHT - sizeY / 2 - offsetY;
    const baseScaleX = sizeX / Math.max(1, built.sourceWidth);
    const baseScaleY = sizeY / Math.max(1, built.sourceHeight);

    if (!current) {
      const root = new Container();
      const motionLayer = new Container();
      const rotationLayer = new Container();
      rotationLayer.addChild(built.visual);
      motionLayer.addChild(rotationLayer);
      root.addChild(motionLayer);
      root.x = baseX;
      root.y = baseY;
      rotationLayer.pivot.set(built.sourceWidth / 2, built.sourceHeight / 2);
      rotationLayer.position.set(built.sourceWidth / 2, built.sourceHeight / 2);

      const state: CharacterRenderState = {
        actionX: 0,
        actionY: 0,
        baseScaleX,
        baseScaleY,
        baseX,
        baseY,
        characterKey: input.characterKey,
        contentAlpha: 1,
        focusBrightness: 1,
        expression: input.expression,
        fadeIdentity: input.fadeIdentity ?? input.characterKey,
        height: sizeY,
        jumpOffsetY: 0,
        jumpSessionId: 0,
        motionLayer,
        nativeKey: input.nativeKey,
        opacitySessionId: 0,
        replaceFadeSessionId: 0,
        root,
        rotationDeg: 0,
        rotationLayer,
        rotateSessionId: 0,
        rotateTimeout: null,
        scaleX: 1,
        scaleY: 1,
        shakeOffsetX: 0,
        shakeOffsetY: 0,
        shakeSessionId: 0,
        shakeTimeout: null,
        slot,
        sourceHeight: built.sourceHeight,
        sourceWidth: built.sourceWidth,
        transformSessionId: 0,
        visual: built.visual,
        width: sizeX,
      };
      this.updateCharacterState(state);
      this.updateCharacterOpacity(state);
      this.characterSlots.set(slot, state);
      this.charLayer.addChild(root);
      return state;
    }

    const previousVisual = current.visual;
    current.baseScaleX = baseScaleX;
    current.baseScaleY = baseScaleY;
    current.baseX = baseX;
    current.baseY = baseY;
    current.characterKey = input.characterKey;
    current.expression = input.expression;
    current.fadeIdentity = input.fadeIdentity ?? input.characterKey;
    current.height = sizeY;
    // `_SlotSetCharInternal` writes `m_currentKey = options.charName` too.
    current.nativeKey = input.nativeKey;
    current.root.x = baseX;
    current.root.y = baseY;
    current.sourceHeight = built.sourceHeight;
    current.sourceWidth = built.sourceWidth;
    current.visual = built.visual;
    current.width = sizeX;
    current.rotationLayer.pivot.set(
      built.sourceWidth / 2,
      built.sourceHeight / 2,
    );
    current.rotationLayer.position.set(
      built.sourceWidth / 2,
      built.sourceHeight / 2,
    );
    current.rotationLayer.addChild(built.visual);

    const fadeMs = Math.max(0, Math.round(input.replaceFadeMs ?? 0));
    if (fadeMs > 0) {
      const sessionId = ++current.replaceFadeSessionId;
      const previousAlpha = previousVisual?.alpha ?? current.contentAlpha;
      built.visual.alpha = 0;
      void this.tween(
        fadeMs,
        (progress) => {
          if (
            !this.isActiveCharacterState(current) ||
            current.replaceFadeSessionId !== sessionId
          )
            return;
          built.visual.alpha = current.contentAlpha * progress;
          if (previousVisual && previousVisual !== built.visual)
            previousVisual.alpha = previousAlpha * (1 - progress);
        },
        () => {
          if (
            !this.isActiveCharacterState(current) ||
            current.replaceFadeSessionId !== sessionId
          )
            return;
          built.visual.alpha = current.contentAlpha;
          previousVisual?.removeFromParent();
        },
      );
    } else {
      built.visual.alpha = current.contentAlpha;
      previousVisual?.removeFromParent();
    }

    return current;
  }

  private applyCharacterBlackGradient(
    content: Container,
    contentSprites: Sprite[],
    width: number,
    height: number,
    blackStart = Number.NaN,
    blackEnd = Number.NaN,
  ): void {
    if (!Number.isFinite(blackStart) || !Number.isFinite(blackEnd)) return;

    const start = Math.max(0, Math.min(1, blackStart ?? 0));
    const end = Math.max(0, Math.min(1, blackEnd ?? 0));
    if (end <= 0) return;

    const startY = height * Math.min(start, end);
    const endY = height * Math.max(start, end);
    const texture = this.bakeDarkenedCharacterTexture(
      contentSprites,
      width,
      height,
      startY,
      endY,
    );
    if (!texture) return;

    // Native applies the gradient inside the character shader
    // (`avgCharSplitShader` material floats `_BlackStart`/`_BlackEnd` on the
    // sprite's own material, AlphaSplitImageHolder.SetSprite), darkening the
    // texture BEFORE the vertex color multiplies it (fade-in alpha, focus
    // dim tint). The web port must bake the darkening into the texture
    // itself: an overlay/mask sibling cannot reproduce that order, because
    // Pixi multiplies container alpha into each child before the children
    // composite, yielding dst * (1 - a * p) instead of dst * (1 - a) * p --
    // the shading would fade in with the character and only look right at
    // the end of the fade.
    for (const sprite of contentSprites) sprite.removeFromParent();
    const darkened = new Sprite(texture);
    darkened.anchor.set(0, 0);
    content.addChild(darkened);
  }

  private bakeDarkenedCharacterTexture(
    sprites: Sprite[],
    width: number,
    height: number,
    startY: number,
    endY: number,
  ): Texture | null {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    for (const sprite of sprites) {
      const resource = sprite.texture?.source?.resource as
        CanvasImageSource | undefined;
      // The caller drops the originals in favour of the baked texture, so a
      // sprite we cannot draw has to abort the whole bake -- skipping it would
      // silently erase that part of the character instead of just leaving it
      // undarkened.
      if (!resource) return null;
      const frame = sprite.texture.frame;
      ctx.drawImage(
        resource,
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        sprite.x,
        sprite.y,
        sprite.width,
        sprite.height,
      );
    }

    // source-atop lerps the existing pixels toward the gradient color while
    // keeping their alpha: out = black * g + c * (1 - g), identical to the
    // native shader's lerp-to-black.
    ctx.globalCompositeOperation = "source-atop";
    const overlayHeight = Math.max(1, endY);
    const gradient = ctx.createLinearGradient(0, 0, 0, overlayHeight);
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(
      Math.min(1, startY / overlayHeight),
      "rgba(0, 0, 0, 1)",
    );
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    return new Texture({ source: new CanvasSource({ resource: canvas }) });
  }

  private characterSlotFromTransform(
    state: CharacterRenderState,
    input: CharacterSlotInput,
  ): { scaleX: number; scaleY: number; x: number; y: number } {
    // `charslot` does NOT share `character`'s key-equality guard. It reaches
    // the slot through `AVGCharacterSlot._SlotSetCharInternal` @ 0x183eb5830,
    // whose reset is
    //   `if (resetOffsetPos && !IsNullOrEmpty(charName)) _offset.pos = zero`
    // with no `m_currentKey` comparison anywhere -- unlike `Set` @ 0x183eb38a0,
    // which wraps the same reset in `!op_Equality(m_currentKey, key)`. So a
    // charslot carrying a name zeroes the offset whatever the character is,
    // and `end=false` (resetOffsetPos = 0) is the only way to keep it.
    const preserve =
      input.resetTransform === false || input.preserveTransform === true;
    const baseX = preserve ? state.actionX : 0;
    const baseY = preserve ? state.actionY : 0;
    const baseScaleX = preserve ? state.scaleX : 1;
    const baseScaleY = preserve ? state.scaleY : 1;

    if (input.positionFrom) {
      return {
        scaleX: baseScaleX,
        scaleY: baseScaleY,
        x: input.positionFrom.x,
        y: input.positionFrom.y,
      };
    }

    return {
      scaleX: baseScaleX,
      scaleY: baseScaleY,
      x: baseX,
      y: baseY,
    };
  }

  private characterSlotToTransform(
    state: CharacterRenderState,
    input: CharacterSlotInput,
    from: { scaleX: number; scaleY: number; x: number; y: number },
  ): { scaleX: number; scaleY: number; x: number; y: number } {
    let toX = from.x;
    let toY = from.y;
    if (input.positionTo) {
      if (input.positionFrom) {
        toX = input.positionTo.x;
        toY = input.positionTo.y;
      } else {
        toX += input.positionTo.x;
        toY += input.positionTo.y;
      }
    }

    let toScaleX = from.scaleX;
    let toScaleY = from.scaleY;
    if (input.action === "zoom") {
      if (isFiniteNumber(input.scaleX)) toScaleX = input.scaleX;
      if (isFiniteNumber(input.scaleY)) toScaleY = input.scaleY;
      if (input.posZoom) {
        toX += (0.5 - input.posZoom.x) * toScaleX * state.width;
        toY += (input.posZoom.y - 0.5) * toScaleY * state.height;
      }
    }

    return { scaleX: toScaleX, scaleY: toScaleY, x: toX, y: toY };
  }

  private applyCharacterSlotFocus(
    focusMode: CharacterSlotInput["focusMode"],
    slot: string,
    focusSlots?: string[],
  ): void {
    if (!focusMode) return;

    if (focusMode === "none") {
      const state = this.characterSlots.get(slot);
      if (!state) return;
      state.focusBrightness = 0.5;
      this.updateCharacterOpacity(state);
      return;
    }

    const active =
      focusMode === "current_only"
        ? new Set([slot])
        : new Set(
            (focusSlots ?? []).map((value) =>
              this.normalizeCharacterSlot(value),
            ),
          );

    for (const [slotKey, state] of this.characterSlots.entries()) {
      state.focusBrightness = active.has(slotKey) ? 1 : 0.5;
      this.updateCharacterOpacity(state);
    }
  }

  private applyCharacterSlotOpacity(
    state: CharacterRenderState,
    input: CharacterSlotInput,
    durationMs: number,
  ): void {
    const hasFrom = isFiniteNumber(input.alphaFrom);
    const hasTo = isFiniteNumber(input.alphaTo);
    if (!hasFrom && !hasTo) return;

    const fromAlpha = hasFrom ? input.alphaFrom! : state.contentAlpha;
    const toAlpha = hasTo ? input.alphaTo! : fromAlpha;
    state.contentAlpha = fromAlpha;
    this.updateCharacterOpacity(state);

    if (durationMs <= 0 || fromAlpha === toAlpha) {
      state.contentAlpha = toAlpha;
      this.updateCharacterOpacity(state);
      return;
    }

    const sessionId = ++state.opacitySessionId;
    void this.tween(
      durationMs,
      (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.opacitySessionId !== sessionId
        )
          return;
        state.contentAlpha = fromAlpha + (toAlpha - fromAlpha) * progress;
        this.updateCharacterOpacity(state);
      },
      () => {
        if (
          !this.isActiveCharacterState(state) ||
          state.opacitySessionId !== sessionId
        )
          return;
        state.contentAlpha = toAlpha;
        this.updateCharacterOpacity(state);
      },
    );
  }

  /**
   * Port of `CharacterPanel._GenPosition`, which returns the slide-in start as
   * an `_offset.localPosition` -- a slot-local delta that `SetCharPos(0, 0,
   * duration)` then tweens back to zero, not an absolute screen position.
   *
   * ```
   * v = slot == LEFT ? 200 : slot == RIGHT ? -200 : 0
   * "left"  -> (v - 1152, 0)   "right" -> (v + 1152, 0)
   * "up"    -> (0, 1072)       "down"  -> (0, -1072)
   * ```
   *
   * The LEFT +200 / RIGHT -200 term cancels each slot's own resting offset
   * from the panel centre (`slotBaseX` is 440/640/840, i.e. 200 apart), so
   * every slot starts a horizontal enter at the same absolute off-screen x.
   * Unity y is up while the renderer is y-down, hence the flipped vertical
   * constants.
   */
  private enterOffset(
    slot: string,
    direction?: CharacterSlotInput["enterFrom"],
    position?: { x: number; y: number },
  ): {
    x: number;
    y: number;
  } {
    // Explicit xpos/ypos replace `_GenPosition` wholesale -- slot
    // compensation included -- and native only applies the result for a legal
    // `enter`, with both coordinates present.
    if (direction && position) return position;
    const slotCompensation = SLOT_ENTER_COMPENSATION[slot] ?? 0;
    switch (direction) {
      case "left": {
        return { x: slotCompensation - 1152, y: 0 };
      }
      case "right": {
        return { x: slotCompensation + 1152, y: 0 };
      }
      case "up": {
        return { x: 0, y: -1072 };
      }
      case "down": {
        return { x: 0, y: 1072 };
      }
      default: {
        return { x: 0, y: 0 };
      }
    }
  }

  /**
   * Native `_ProcessSlot` raises MIDDLE via SetAsLastSibling, then the focused
   * non-middle slot (ECharSlot LEFT = 1 / RIGHT = 2). With the native
   * processing order MIDDLE -> LEFT -> RIGHT the resulting bottom-to-top
   * sibling order is: focus 1 -> [r, m, l], focus 2 -> [l, m, r],
   * otherwise -> [l, r, m].
   *
   * Raising each tracked root to the top in that order also keeps roots that
   * are mid cross-fade below the live ones: they are no longer tracked slots,
   * so nothing lifts them back up. Computing fixed target indices instead
   * would not -- `setChildIndex` splices, so each move shifts the indices the
   * later moves were computed against, and an outgoing root ends up wedged
   * between two live slots.
   */
  private applyCharacterZOrder(focus: number): void {
    const ufocus = focus >>> 0;
    let order = ["l", "r", "m"];
    if (ufocus === 1) order = ["r", "m", "l"];
    else if (ufocus === 2) order = ["l", "m", "r"];
    for (const slot of order) {
      const root = this.characterSlots.get(slot)?.root;
      if (!root || root.parent !== this.charLayer) continue;
      this.charLayer.setChildIndex(root, this.charLayer.children.length - 1);
    }
  }

  private async fadeOutAndRemove(
    container: Container,
    durationMs: number,
    done?: () => void,
  ): Promise<void> {
    const startAlpha = container.alpha;
    await this.tween(
      durationMs,
      (progress) => {
        container.alpha = startAlpha * (1 - progress);
      },
      () => {
        container.removeFromParent();
        done?.();
      },
    );
  }

  private updateCharacterState(state: CharacterRenderState): void {
    state.motionLayer.x = state.actionX + state.shakeOffsetX;
    state.motionLayer.y =
      state.shakeOffsetY - state.actionY - state.jumpOffsetY;
    state.motionLayer.scale.set(
      state.baseScaleX * state.scaleX,
      state.baseScaleY * state.scaleY,
    );
    state.rotationLayer.rotation = (state.rotationDeg * Math.PI) / 180;
    this.updateCharacterOpacity(state);
  }

  private updateCharacterOpacity(state: CharacterRenderState): void {
    const channel = Math.round(0xff * clamp01(state.focusBrightness));
    state.visual.tint = (channel << 16) | (channel << 8) | channel;
    state.visual.alpha = state.contentAlpha;
  }

  private disposeCharacterState(state: CharacterRenderState): void {
    state.opacitySessionId += 1;
    state.replaceFadeSessionId += 1;
    state.transformSessionId += 1;
    state.jumpSessionId += 1;
    this.stopRotateAction(state);
    this.stopShakeAction(state);
    state.root.removeFromParent();
  }

  private normalizeCharacterSlot(slot?: string): string {
    switch ((slot ?? "").trim().toLowerCase()) {
      case "char_left":
      case "l":
      case "left": {
        return "l";
      }
      case "c":
      case "center":
      case "char_middle":
      case "m":
      case "middle": {
        return "m";
      }
      case "char_right":
      case "r":
      case "right": {
        return "r";
      }
      default: {
        return "m";
      }
    }
  }

  private isCharacterSlotCommand(input: CharacterSlotInput): boolean {
    return (
      input.focusMode !== undefined ||
      input.focusSlots !== undefined ||
      input.positionFrom !== undefined ||
      input.positionTo !== undefined ||
      input.alphaFrom !== undefined ||
      input.alphaTo !== undefined ||
      input.action !== undefined ||
      input.scaleX !== undefined ||
      input.scaleY !== undefined ||
      input.posZoom !== undefined ||
      input.preserveTransform !== undefined ||
      input.resetTransform !== undefined ||
      input.replaceFadeMs !== undefined ||
      input.power !== undefined ||
      input.randomness !== undefined ||
      input.stop !== undefined ||
      input.times !== undefined ||
      input.characterKey === undefined ||
      input.expression === undefined
    );
  }

  private stopShakeAction(state: CharacterRenderState): void {
    state.shakeSessionId += 1;
    if (state.shakeTimeout) {
      clearTimeout(state.shakeTimeout);
      state.shakeTimeout = null;
    }
    state.shakeOffsetX = 0;
    state.shakeOffsetY = 0;
    this.updateCharacterState(state);
  }

  private stopRotateAction(state: CharacterRenderState): void {
    state.rotateSessionId += 1;
    if (state.rotateTimeout) {
      clearTimeout(state.rotateTimeout);
      state.rotateTimeout = null;
    }
    state.rotationDeg = 0;
    this.updateCharacterState(state);
  }

  private disposeCurtainState(state: CurtainRenderState): void {
    state.tweenSessionId += 1;
    state.graphic.removeFromParent();
    state.graphic.destroy();
  }

  private removeCurtainState(
    direction: number,
    state: CurtainRenderState,
  ): void {
    if (this.curtains.get(direction) !== state) return;
    this.curtains.delete(direction);
    this.disposeCurtainState(state);
  }

  private async runMoveAction(
    state: CharacterRenderState,
    xOffset: number,
    yOffset: number,
    durationMs: number,
    block: boolean,
  ): Promise<void> {
    const fromX = state.actionX;
    const fromY = state.actionY;
    const toX = fromX + xOffset;
    const toY = fromY + yOffset;
    const sessionId = ++state.transformSessionId;

    const run = this.tween(
      durationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = fromX + (toX - fromX) * progress;
        state.actionY = fromY + (toY - fromY) * progress;
        this.updateCharacterState(state);
      },
      () => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = toX;
        state.actionY = toY;
        this.updateCharacterState(state);
      },
    );

    if (block && durationMs > 0) await run;
  }

  private async runScaleAction(
    state: CharacterRenderState,
    scaleX: number | undefined,
    scaleY: number | undefined,
    xOffset: number,
    yOffset: number,
    durationMs: number,
    block: boolean,
  ): Promise<void> {
    const fromX = state.actionX;
    const fromY = state.actionY;
    const fromScaleX = state.scaleX;
    const fromScaleY = state.scaleY;
    const toX = fromX + xOffset;
    const toY = fromY + yOffset;
    const toScaleX = isFiniteNumber(scaleX) ? scaleX : state.scaleX;
    const toScaleY = isFiniteNumber(scaleY) ? scaleY : state.scaleY;
    const sessionId = ++state.transformSessionId;

    const run = this.tween(
      durationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = fromX + (toX - fromX) * progress;
        state.actionY = fromY + (toY - fromY) * progress;
        state.scaleX = fromScaleX + (toScaleX - fromScaleX) * progress;
        state.scaleY = fromScaleY + (toScaleY - fromScaleY) * progress;
        this.updateCharacterState(state);
      },
      () => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = toX;
        state.actionY = toY;
        state.scaleX = toScaleX;
        state.scaleY = toScaleY;
        this.updateCharacterState(state);
      },
    );

    if (block && durationMs > 0) await run;
  }

  private async runExitAction(
    state: CharacterRenderState,
    durationMs: number,
    direction: CharacterActionInput["direction"],
    yOffset: number,
    block: boolean,
  ): Promise<void> {
    const toX =
      direction === "left"
        ? -(state.baseX + state.width + 64)
        : STORY_WIDTH - state.baseX + 64;
    const fromX = state.actionX;
    const fromY = state.actionY;
    const toY = fromY + yOffset;
    const sessionId = ++state.transformSessionId;

    const run = this.tween(
      durationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = fromX + (toX - fromX) * progress;
        state.actionY = fromY + (toY - fromY) * progress;
        this.updateCharacterState(state);
      },
      () => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = toX;
        state.actionY = toY;
        this.updateCharacterState(state);
      },
    );

    if (block && durationMs > 0) await run;
  }

  private startJumpAction(
    state: CharacterRenderState,
    power: number,
    times: number,
    durationMs: number,
  ): void {
    const sessionId = ++state.jumpSessionId;
    state.jumpOffsetY = 0;
    this.updateCharacterState(state);

    if (power <= 0 || durationMs <= 0) return;

    const iterations = Math.max(1, times);
    void (async () => {
      for (let index = 0; index < iterations; index += 1) {
        if (
          !this.isActiveCharacterState(state) ||
          state.jumpSessionId !== sessionId
        )
          return;

        await this.tween(durationMs, (progress) => {
          if (
            !this.isActiveCharacterState(state) ||
            state.jumpSessionId !== sessionId
          )
            return;
          const cycle = progress <= 0.5 ? progress / 0.5 : (1 - progress) / 0.5;
          state.jumpOffsetY = Math.max(0, power * cycle);
          this.updateCharacterState(state);
        });
      }

      if (
        !this.isActiveCharacterState(state) ||
        state.jumpSessionId !== sessionId
      )
        return;
      state.jumpOffsetY = 0;
      this.updateCharacterState(state);
    })();
  }

  private startShakeAction(
    state: CharacterRenderState,
    input: CharacterActionInput,
  ): void {
    this.stopShakeAction(state);
    if (input.stop || input.power <= 0) return;

    const sessionId = state.shakeSessionId;
    const intervalMs =
      input.times > 0
        ? Math.max(1, Math.round(Math.max(input.durationMs, 1) / input.times))
        : Math.max(1, input.durationMs || 33);
    let remainingTicks = input.times < 0 ? -1 : Math.max(1, input.times);

    const tick = (): void => {
      if (
        !this.isActiveCharacterState(state) ||
        state.shakeSessionId !== sessionId
      )
        return;

      state.shakeOffsetX = this.pickShakeOffset(input.power, input.randomness);
      state.shakeOffsetY = this.pickShakeOffset(input.power, input.randomness);
      this.updateCharacterState(state);

      if (remainingTicks > 0) remainingTicks -= 1;

      if (remainingTicks === 0) {
        state.shakeTimeout = null;
        state.shakeOffsetX = 0;
        state.shakeOffsetY = 0;
        this.updateCharacterState(state);
        return;
      }

      state.shakeTimeout = setTimeout(tick, intervalMs);
    };

    tick();
  }

  private isActiveCharacterState(
    state: CharacterRenderState,
    transformSessionId?: number,
  ): boolean {
    if (!this.app) return false;
    const current = this.characterSlots.get(state.slot);
    if (current !== state) return false;
    if (
      transformSessionId !== undefined &&
      state.transformSessionId !== transformSessionId
    )
      return false;
    return true;
  }

  private isActiveCurtainState(
    direction: number,
    state: CurtainRenderState,
    tweenSessionId?: number,
  ): boolean {
    if (!this.app) return false;
    const current = this.curtains.get(direction);
    if (current !== state) return false;
    if (tweenSessionId !== undefined && state.tweenSessionId !== tweenSessionId)
      return false;
    return true;
  }

  private bumpStickerSessions(id: string): void {
    this.stickerTypingSessionIds.set(
      id,
      (this.stickerTypingSessionIds.get(id) ?? 0) + 1,
    );
    this.stickerFadeSessionIds.set(
      id,
      (this.stickerFadeSessionIds.get(id) ?? 0) + 1,
    );
  }

  private clearTimerInterval(): void {
    if (!this.timerStickerInterval) return;
    clearInterval(this.timerStickerInterval);
    this.timerStickerInterval = null;
  }

  private stopCameraShake(sessionId?: number): void {
    if (sessionId !== undefined && sessionId !== this.cameraShakeSessionId)
      return;

    this.cameraShakeSessionId += 1;
    this.sceneLayer.position.set(0, 0);
    this.cameraShakeWaitResolve?.();
    this.cameraShakeWaitResolve = null;
  }

  private readBlockerColor(blocker: Sprite): {
    a: number;
    b: number;
    g: number;
    r: number;
  } {
    return {
      a: blocker.alpha,
      b: (blocker.tint & 0xff) / 255,
      g: ((blocker.tint >> 8) & 0xff) / 255,
      r: ((blocker.tint >> 16) & 0xff) / 255,
    };
  }

  private writeBlockerColor(
    blocker: Sprite,
    color: { a: number; b: number; g: number; r: number },
  ): void {
    const channel = (value: number) =>
      Math.round(clamp01(value > 1 ? value / 255 : value) * 255);
    blocker.tint =
      (channel(color.r) << 16) | (channel(color.g) << 8) | channel(color.b);
    blocker.alpha = clamp01(color.a);
    blocker.visible = blocker.alpha > 0;
  }

  // CharacterAction still uses the legacy per-tick shake model; CameraShake uses ShakePath.
  private pickShakeOffset(strength: number, randomness: number): number {
    const roll = Math.floor(Math.random() * 99) + 1;
    const directions = [-1, -0.707, 0, 1, 0.707];
    const index =
      roll < randomness ? Math.floor(Math.random() * directions.length) : 0;
    return directions[index] * strength;
  }

  private createOverlayTextStyle(fontSize: number, widthPx: number): TextStyle {
    return new TextStyle({
      breakWords: true,
      dropShadow: {
        alpha: 0.9,
        angle: Math.PI / 4,
        blur: 4,
        color: "#404040",
        distance: 0,
      },
      fill: "#ffffff",
      fontFamily: ["Noto Sans SC", "Microsoft YaHei", "sans-serif"],
      fontSize,
      whiteSpace: "pre-line",
      wordWrap: true,
      wordWrapWidth: widthPx,
    });
  }

  private ensureStickerText(id: string): Text {
    const existing = this.stickerTexts.get(id);
    if (existing) return existing;

    const sticker = new Text({
      style: this.createOverlayTextStyle(18, 675),
      text: "",
    });
    sticker.visible = false;
    this.stickerTexts.set(id, sticker);
    this.uiLayer.addChild(sticker);
    return sticker;
  }

  private ensureTimerStickerText(): Text {
    if (!this.timerStickerText) {
      this.timerStickerText = new Text({
        style: this.createOverlayTextStyle(18, 220),
        text: "",
      });
      this.timerStickerText.visible = false;
      this.uiLayer.addChild(this.timerStickerText);
    }
    return this.timerStickerText;
  }

  private formatTimer(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [hours, minutes, seconds]
      .map((value) => value.toString().padStart(2, "0"))
      .join(":");
  }

  private layoutSubtitle(
    subtitle: Text,
    baseX: number,
    widthPx: number,
    alignment: SubtitleInput["alignment"],
  ): void {
    const renderedWidth = Math.min(subtitle.width, widthPx);
    switch (alignment) {
      case "center": {
        subtitle.x = baseX + Math.max(widthPx - renderedWidth, 0) / 2;
        return;
      }
      case "right": {
        subtitle.x = baseX + Math.max(widthPx - renderedWidth, 0);
        return;
      }
      default: {
        subtitle.x = baseX;
      }
    }
  }

  private async runSubtitleTyping(
    sessionId: number,
    subtitle: Text,
    input: {
      alignment: SubtitleInput["alignment"];
      baseX: number;
      delayMs: number;
      prevChars: RichChar[];
      newChars: RichChar[];
      widthPx: number;
    },
  ): Promise<void> {
    for (let index = 0; index < input.newChars.length; index += 1) {
      if (!this.app || this.subtitleTypingSessionId !== sessionId) return;

      await new Promise((resolve) => setTimeout(resolve, input.delayMs));

      if (!this.app || this.subtitleTypingSessionId !== sessionId) return;

      subtitle.text = richCharsToTaggedText([
        ...input.prevChars,
        ...input.newChars.slice(0, index + 1),
      ]);
      this.layoutSubtitle(
        subtitle,
        input.baseX,
        input.widthPx,
        input.alignment,
      );
    }

    if (this.subtitleTypingSessionId === sessionId)
      this.subtitleTypingTarget = null;
  }

  private async runStickerTyping(
    id: string,
    sessionId: number,
    sticker: Text,
    input: {
      alignment: StickerInput["alignment"];
      baseX: number;
      delayMs: number;
      prevChars: RichChar[];
      newChars: RichChar[];
      widthPx: number;
    },
  ): Promise<void> {
    for (let index = 0; index < input.newChars.length; index += 1) {
      if (
        !this.app ||
        (this.stickerTypingSessionIds.get(id) ?? 0) !== sessionId
      )
        return;

      await new Promise((resolve) => setTimeout(resolve, input.delayMs));

      if (
        !this.app ||
        (this.stickerTypingSessionIds.get(id) ?? 0) !== sessionId
      )
        return;

      sticker.text = richCharsToTaggedText([
        ...input.prevChars,
        ...input.newChars.slice(0, index + 1),
      ]);
      this.layoutSubtitle(sticker, input.baseX, input.widthPx, input.alignment);
    }

    if ((this.stickerTypingSessionIds.get(id) ?? 0) === sessionId)
      this.stickerTypingTargets.delete(id);
  }

  private layoutImageForScreenAdapt(
    sprite: Sprite,
    mode?: BackgroundInput["screenAdapt"],
    useViewportSizeByDefault = false,
  ): void {
    const sourceWidth = Math.max(1, sprite.texture.width);
    const sourceHeight = Math.max(1, sprite.texture.height);
    // Unity swaps Image.sprite without calling SetNativeSize, so the AVG
    // background Image keeps its scene-authored 1280x720 RectTransform when
    // screenadapt is omitted. Pixi otherwise defaults to the texture's native
    // size (many extracted backgrounds are 1024x576), leaving visible borders.
    let width = useViewportSizeByDefault ? STORY_WIDTH : sourceWidth;
    let height = useViewportSizeByDefault ? STORY_HEIGHT : sourceHeight;

    if (mode === "fill") {
      width = STORY_WIDTH;
      height = STORY_HEIGHT;
    } else if (
      mode === "width" ||
      (mode === "showall" &&
        sourceWidth / sourceHeight > STORY_WIDTH / STORY_HEIGHT) ||
      (mode === "coverall" &&
        sourceWidth / sourceHeight < STORY_WIDTH / STORY_HEIGHT)
    ) {
      width = STORY_WIDTH;
      height = (sourceHeight * STORY_WIDTH) / sourceWidth;
    } else if (mode === "height" || mode === "showall" || mode === "coverall") {
      height = STORY_HEIGHT;
      width = (sourceWidth * STORY_HEIGHT) / sourceHeight;
    }

    sprite.width = width;
    sprite.height = height;
    sprite.position.set(0, 0);
  }

  private readCenteredTransform(root: Container): {
    scaleX: number;
    scaleY: number;
    x: number;
    y: number;
  } {
    return readRootTransform(root);
  }

  private applyCenteredTransform(
    root: Container,
    transform: { scaleX: number; scaleY: number; x: number; y: number },
  ): void {
    applyCenteredTransformToRoot(root, transform);
  }

  private isActiveBackground(root: Container, sessionId: number): boolean {
    return Boolean(
      this.app &&
      this.backgroundRoot === root &&
      this.backgroundTweenSessionId === sessionId &&
      root.parent === this.backgroundLayer,
    );
  }

  private isActiveLargeBackground(root: Container, sessionId: number): boolean {
    return Boolean(
      this.app &&
      this.largeBackgroundRoot === root &&
      this.largeBackgroundTweenSessionId === sessionId &&
      root.parent === this.gridBackgroundLayer,
    );
  }

  private isActiveLargeImage(root: Container, sessionId: number): boolean {
    return Boolean(
      this.app &&
      this.largeImageRoot === root &&
      this.largeImageTweenSessionId === sessionId &&
      root.parent === this.imageLayer,
    );
  }

  private buildGridBackgroundRoot(
    input: GridBackgroundInput,
    textures: Texture[],
  ): Container {
    return buildGridRoot(input, textures);
  }

  private async textureForImageKey(
    key: string,
    kind: "background" | "image",
  ): Promise<Texture | null> {
    const rawUrl = resolveStoryAssetByKey(key, kind === "background");
    if (!rawUrl) {
      this.onWarning?.(`missing ${kind}: ${key}`);
      return null;
    }

    return this.textureForUrl(rawUrl, kind, key);
  }

  private async textureForCharacterKey(key: string): Promise<Texture | null> {
    const rawUrl = resolveStoryCharacterAssetByKey(key);
    if (!rawUrl) {
      this.onWarning?.(`missing character: ${key}`);
      return null;
    }

    return this.textureForUrl(rawUrl, "character", key);
  }

  private async textureForInterlude(
    input: InterludeInput,
  ): Promise<Texture | null> {
    if (input.type !== 3)
      return this.textureForImageKey(
        input.name,
        input.type === 2 ? "background" : "image",
      );

    const base = input.avatarCharacterKey;
    const expression = input.avatarExpression;
    if (!base || !expression) return null;
    const link = this.context.linkMap[base];
    const item = link?.array.find((entry) => entry.name === expression);
    if (!item) return null;
    if (item.group === -1 && item.image)
      return this.textureForCharacterKey(item.image);
    const group = item.group >= 0 ? link.groups[item.group] : undefined;
    if (group?.mode === "face_overlay")
      return this.textureForCharacterKey(group.base);
    return null;
  }

  private async textureForUrl(
    rawUrl: string,
    kind: string,
    key: string,
  ): Promise<Texture | null> {
    const url = resolveAssetUrl(rawUrl);
    try {
      const texture = await Assets.load<Texture>(url);
      return texture;
    } catch {
      this.onWarning?.(`failed ${kind}: ${key}`);
      return null;
    }
  }

  private tween(
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
  ): Promise<void> {
    return this.tweenRunner.run(durationMs, step, done);
  }
}

export { DIALOG_FRAME_URL } from "../../assets";
