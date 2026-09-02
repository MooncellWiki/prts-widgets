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
  type TextureSource,
  TilingSprite,
} from "pixi.js";

import { SLIDE_MASK_TEXTURE_URL } from "../../assets";
import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryCharacterAssetByKey,
} from "../asset";
import {
  buildTagStyles,
  collectColors,
  colorTagName,
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
import { SlideMaskFilter } from "./core/SlideMaskFilter";
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
 * `TweenerOptions.posFrom` / `posTo` / `zoomPos` all default to `Vector2.one`
 * (`_ExecuteCharslot` 0x183e4d752-0x183e4d7ad). The plain-move branch uses
 * posFrom == (1,1) as its "not given" sentinel; the action branches pass the
 * values through verbatim.
 */
const CHARSLOT_POINT_DEFAULT = { x: 1, y: 1 } as const;

interface CharacterSlotPoint {
  x: number;
  y: number;
}

interface CharacterSlotZoomState {
  scaleX: number;
  scaleY: number;
  shiftX: number;
  shiftY: number;
}

/**
 * Which `charslot` branches feed posfrom/posto into `SlotMoveChar`, i.e. the
 * `_offset.localPosition` move. `_UpdateSeqWithParam` (0x183e53940) picks
 * `_GenSlotActionTw` XOR `_GenCharslotMove`: the plain move only runs when
 * `action` is empty and posFrom != (1,1), and `_GenSlotActionTw`
 * (0x183e4f3b0) re-enters SlotMoveChar for `shakemove` and for `jump` when
 * `NeedSkipAnimation(duration)` holds -- without the sentinel gate. `zoom`
 * and `shake` never touch the offset. `move`/`setpos` are Web extensions kept
 * on the plain-move path. Returns null when the command moves nothing.
 */
function characterSlotMove(
  state: { actionX: number; actionY: number },
  input: CharacterSlotInput,
): { from: CharacterSlotPoint; to: CharacterSlotPoint } | null {
  const posTo = input.positionTo ?? CHARSLOT_POINT_DEFAULT;
  switch (input.action) {
    case undefined:
    case "move":
    case "setpos": {
      // posFrom == (1,1) never reaches SlotMoveChar: a bare `posto` is a
      // no-op rather than a relative move.
      if (!input.positionFrom) return null;
      return { from: input.positionFrom, to: posTo };
    }
    case "shakemove": {
      // SlotMoveChar(posFrom, posTo, duration) verbatim, sentinel included.
      return { from: input.positionFrom ?? CHARSLOT_POINT_DEFAULT, to: posTo };
    }
    case "jump": {
      if ((input.durationMs ?? 0) > 0) {
        // CharJump (0x183eb2690): DOLocalJump to `localPosition + posTo`.
        // An omitted posto stays at the (1,1) default -- a bare jump drifts
        // one unit -- while a posto that is present but not an "x,y" pair
        // becomes Vector2.zero (0x183e4e2db-0x183e4e322); the runtime hands
        // that case in as (0,0).
        return {
          from: { x: state.actionX, y: state.actionY },
          to: { x: state.actionX + posTo.x, y: state.actionY + posTo.y },
        };
      }
      // NeedSkipAnimation(duration) => _GenCharslotMove => SlotMoveChar(...,
      // 0) => `localPosition = posTo` outright.
      return { from: input.positionFrom ?? CHARSLOT_POINT_DEFAULT, to: posTo };
    }
    default: {
      return null;
    }
  }
}

/**
 * The zoom half of a `charslot`: CharZoom (0x183eb2b50) tweens the fore
 * Image's `rectTransform.pivot` to `zoomPos` and its `localScale` to `scale`
 * (setter `<CharZoom>b__1` 0x183ed95a0), both absolute -- re-issuing the same
 * zoom lands on the same transform instead of stacking. The pivot move is
 * approximated as a translation of the scaled sprite. Returns null when the
 * command is not a zoom or CharZoom would reject the pivot.
 */
function characterSlotZoom(
  state: CharacterRenderState,
  input: CharacterSlotInput,
): { from: CharacterSlotZoomState; to: CharacterSlotZoomState } | null {
  if (input.action !== "zoom") return null;
  // CharZoom validates the pivot first: x/y outside [0,1] => return null,
  // skipping the whole zoom (scale change included). An absent poszoom
  // defaults to (1,1), which is inside the valid range; the Web port keeps
  // treating an absent pivot as "no extra shift".
  const zoom = input.posZoom;
  const pivotValid =
    !zoom || (zoom.x >= 0 && zoom.x <= 1 && zoom.y >= 0 && zoom.y <= 1);
  if (!pivotValid) return null;

  // `CharZoom(zoomPos.x, zoomPos.y, options.scale, duration)` always tweens
  // to `options.scale`, whose GetOrDefault falls back to 1.0 (0x183e4dcea)
  // -- a zoom without `scale` resets it.
  const toScaleX = isFiniteNumber(input.scaleX) ? input.scaleX : 1;
  const toScaleY = isFiniteNumber(input.scaleY) ? input.scaleY : 1;
  return {
    from: {
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      shiftX: state.zoomShiftX,
      shiftY: state.zoomShiftY,
    },
    to: {
      scaleX: toScaleX,
      scaleY: toScaleY,
      shiftX: zoom ? (0.5 - zoom.x) * toScaleX * state.width : 0,
      shiftY: zoom ? (zoom.y - 0.5) * toScaleY * state.height : 0,
    },
  };
}

interface FaceOverlayCacheEntry {
  /** Live visuals drawing this bake; only unreferenced bakes are evicted. */
  refs: number;
  texture: Texture;
}

/**
 * Soft cap on cached face-overlay bakes. Each one is a full base-sized
 * canvas plus its GPU upload (CDN bases run 1024^2-1484^2, ~4-9 MB RGBA), so
 * the cache cannot grow with the number of expressions a story shows. Three
 * slots with an incoming and an outgoing visual each pin at most six.
 */
const FACE_OVERLAY_CACHE_LIMIT = 8;

function faceOverlayCacheKey(baseKey: string, faceKey: string): string {
  return `${baseKey}|${faceKey}`;
}

/** Raw float color channel to the 8-bit tint write (the only clamp point). */
function tintChannel(value: number): number {
  return Math.round(clamp01(value) * 255);
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
 * Native `Torappu.AVG.AVGTypeWriterText.BeginText` hides the unrevealed tail
 * behind a fully transparent `<color=#00000000>` span so the whole message is
 * laid out (and wrapped) from t0 -- revealing characters never re-wraps the
 * lines already on screen.
 */
const SUBTITLE_HIDDEN_TAIL_COLOR = "#00000000";
const SUBTITLE_HIDDEN_TAIL_TAG = colorTagName(SUBTITLE_HIDDEN_TAIL_COLOR);

/**
 * Web-only counterpart to the transparent tail: PIXI's tagged-text drop shadow
 * pass forces an opaque fill (`CanvasTextGenerator._setupDropShadow`) and never
 * reads the run's own fill, so an `alpha = 0` run still casts the style's
 * shadow -- the "hidden" tail would read as legible grey ghost text. Unity
 * modulates its shadow by vertex alpha instead, so native has nothing to turn
 * off here. Disabling the shadow per tag hits PIXI's own skip branch and leaves
 * the measured layout byte-identical.
 */
const SUBTITLE_HIDDEN_TAIL_STYLE = {
  dropShadow: false,
  fill: SUBTITLE_HIDDEN_TAIL_COLOR,
} as const;

function subtitleHiddenTail(chars: RichChar[]): RichChar[] {
  return chars.map(({ char }) => ({
    char,
    color: SUBTITLE_HIDDEN_TAIL_COLOR,
  }));
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
  /**
   * The previous visual while it cross-fades out. Native keeps exactly one
   * back Image: the next swap replaces it outright, so a swap during a
   * crossfade discards this one instead of leaving it half faded.
   */
  outgoingVisual: Container | null;
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
  zoomSessionId: number;
  /**
   * CharZoom's pivot move, as a translation in stage pixels. Kept apart from
   * `actionX/Y` (the `_offset` position) because native stores it on the
   * fore Image, which every successful image load resets.
   */
  zoomShiftX: number;
  zoomShiftY: number;
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
  backgroundSprite: Sprite | TilingSprite | null = null;
  private backgroundTweenSessionId = 0;
  private readonly context: Context;
  private readonly charLayer = this.layers.characters;
  private readonly characterSlots = new Map<string, CharacterRenderState>();
  /**
   * 每槽缓存 `DOTween.Sequence` 的完成时刻（`performance.now()` 毫秒）。
   * `_GetCachedSlotSeq`（0x183e4f830）在 Sequence 未被 `end` 挂的
   * OnComplete 标记 played 前一直复用同一条，而 `_UpdateSeqWithTween`
   * （0x183e53fc0）把每条 charslot tween `Insert` 到各自 `delay` 上——
   * 并行、从不 Append——所以 Sequence 在"全部已插入 tween 的最大结束
   * 时刻"完成。`isblock` 等的就是这一刻（OnComplete → FinishCommand，
   * 0x183e4e501）：紧跟 `end=false` 入场之后的 shake 要等两者同时结束，
   * 但各自仍从自己命令的发出时刻起播。
   *
   * 复用只在同一帧内成立：`TweenManager.Update(Tween, …)`（0x1841495c0）
   * 在 tween 首次更新时置 `creationLocked`，此后 `Insert`（0x18411da10）
   * 只打 `LogAddToLockedSequence` 就返回；播完的 Sequence 又因
   * `defaultAutoKill`（cctor 0x18410b0e0）失活，而 `end=false` 的从不被标
   * played，`_GetCachedSlotSeq` 会继续交出这条死 Sequence，Insert 与
   * OnComplete 都成 no-op。AVG 的 `_DoExecuteCommands`（0x183e2b9c0）把
   * 连续非阻塞命令在同一次 MoveNext 里跑完，所以相邻命令共享 Sequence；
   * 隔了对白或阻塞命令之后，native 只等旧 Sequence 的剩余时间。全语料
   * `end=false` 后接同槽 isblock 的只有相邻两处（act23side_02_beg 425→426、
   * 555→556），这里按 max(旧 deadline, 自身 duration) 近似，不建模上锁。
   */
  private readonly characterSlotSeqDeadlines = new Map<string, number>();
  private readonly faceOverlayTextures = new Map<
    string,
    FaceOverlayCacheEntry
  >();
  /** Which cached bake each character visual draws, for refcounting. */
  private readonly faceOverlayVisualKeys = new WeakMap<Container, string>();
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
  /**
   * Raw float mirror of the native `_blocker.color` (prefab initial
   * (0,0,0,0)). Unity `Color` channels are float32 and may exceed 1 -- scripts
   * write 0-255 endpoints (r=255 white flashes, 7.5k+ occurrences) whose
   * mid-tween values saturate only at the GPU. Readback and interpolation stay
   * in raw scale; only the 8-bit tint write clamps.
   */
  private blockerColor: { a: number; b: number; g: number; r: number } = {
    a: 0,
    b: 0,
    g: 0,
    r: 0,
  };
  private blockerTweenSessionId = 0;
  /**
   * localScale sign persistence for the slider wipe (native `_ExecuteBlocker`
   * assigns literal -1 to the flipped axis; `inverse = false` never resets it,
   * and only OnReset/destroy restores +1). The sign is tracked separately from
   * `sprite.scale` because every `blocker.width`/`height` write recomputes the
   * magnitude from the new texture, so the sign is the only part worth owning;
   * the visible mirror is the shader's (SlideMaskFilter uFlip), since the quad
   * itself is untextured white.
   */
  private blockerScaleSign = { x: 1, y: 1 };
  /**
   * `_blocker.material` equivalent: non-null only while the slide wipe is
   * mounted, so `writeBlockerColor` knows whether alpha belongs to the shader
   * or to `sprite.alpha`.
   */
  private blockerSlideFilter: SlideMaskFilter | null = null;
  /**
   * The filter instance itself, mirroring the single `slide_mask` Material
   * `_SetMaterial` re-fetches from the asset loader cache (2.7.61 VA
   * 0x183e30b60): mounting and unmounting reuses it rather than rebuilding.
   */
  private blockerSlideMaterial: SlideMaskFilter | null = null;
  private blockerMaskSource: TextureSource | null = null;
  private blockerMaskSourceFailed = false;
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
  /**
   * Native port: `SubtitlePanel._SetHiddenInternal`'s `m_hidden`. Flips the
   * moment `set_isHidden` is called, while the alpha tween catches up. A
   * `setSubtitle` on an already-shown panel must not replay the fade-in.
   */
  private subtitleHidden = true;
  private subtitleText: Text | null = null;
  private subtitleTypingTarget: {
    alignment: SubtitleInput["alignment"];
    baseX: number;
    fullText: string;
    widthPx: number;
  } | null = null;
  private subtitleTypingSessionId = 0;
  private readonly stickerRichChars = new Map<string, RichChar[]>();
  private timerFadeSessionId = 0;
  /**
   * Mirrors `AVGTimerView.m_countTimerTask != null`. It gates the inline
   * `_TimerTick(0)` that `_StartCountTimer` only fires when it has to build a
   * task, and it survives a `StopTimer` fade -- native nulls the field from
   * that fade's OnComplete, not when the fade starts.
   */
  private timerTaskActive = false;
  /**
   * The pending `StopTimer` OnComplete (`<StopTimer>b__7_0`, VA 0x183ed54f0).
   * `RenderTimer`'s `DOKill(_canvas, complete: true)` runs it; `StopTimer`'s own
   * `DOKill(_canvas, complete: false)` discards it.
   */
  private timerStopFadeComplete: (() => void) | null = null;
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
    // Blocker's closest OnReset equivalent on destroy: drop in-flight tween
    // callbacks and restore the prefab color (0,0,0,0). OnReset also clears
    // the slide_mask material and restores localScale = one.
    this.blockerTweenSessionId += 1;
    this.blockerScaleSign = { x: 1, y: 1 };
    this.blockerSlideFilter = null;
    this.blockerSlideMaterial = null;
    this.blockerColor = { a: 0, b: 0, g: 0, r: 0 };
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
    this.characterSlotSeqDeadlines.clear();
    for (const entry of this.faceOverlayTextures.values())
      entry.texture.destroy(true);
    this.faceOverlayTextures.clear();
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
    this.timerFadeSessionId += 1;
    this.timerStopFadeComplete = null;
    this.timerTaskActive = false;
    this.stickerTexts.clear();
    this.stickerFadeSessionIds.clear();
    this.stickerTypingTargets.clear();
    this.stickerTypingSessionIds.clear();
    this.subtitleFadeSessionId += 1;
    this.subtitleHidden = true;
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
    if (!texture) {
      // Native `_LoadImage` on a failed sprite load logs "Failed to load
      // image" and falls into the clear branch: DOFade(_backImage -> 0) with
      // the same scaled duration and block gate, so the old background fades
      // out instead of staying visible.
      await this.clearBackground(input?.fadeMs ?? 0, input?.block ?? false);
      return;
    }

    // Simplification vs native: `_ExecuteImage` only DOKills the outgoing
    // image's transform tween when the cross-fade finishes (OnKill ->
    // `_ResetImage(_backImage)`), so an in-flight backgroundtween keeps
    // animating the old image during the fade. Bumping the session id here
    // freezes that tween one fade early; accepted deviation because both
    // endpoints (new image cross-faded in, old root removed) still agree.
    this.backgroundTweenSessionId += 1;
    const root = new Container();
    // `_LoadImage`: TryGetParam("tiled", false) switches Image.type between
    // Tiled and Simple, tiling the sprite inside the final sizeDelta rect; a
    // repeat-addressed TilingSprite is the PIXI equivalent. The address mode
    // is set on the Assets-cached texture, which is harmless for the 0..1-UV
    // simple sprites sharing it.
    let sprite: Sprite | TilingSprite;
    if (input?.tiled) {
      texture.source.style.addressMode = "repeat";
      sprite = new TilingSprite({ texture });
    } else {
      sprite = new Sprite(texture);
    }
    sprite.anchor.set(0.5);
    const nativeRect = this.nativeBackgroundRect(key, texture);
    this.layoutImageForScreenAdapt(
      sprite,
      input?.screenAdapt,
      {
        height: input?.height ?? 1,
        width: input?.width ?? 1,
      },
      nativeRect,
    );
    if (sprite instanceof TilingSprite) {
      // Image.type = Tiled repeats the sprite at its native (ppu-scaled) size
      // inside the final sizeDelta rect, so each tile spans nativeRect while
      // the TilingSprite's own width/height stay at that final rect.
      sprite.tileScale.set(
        nativeRect[0] / Math.max(1, texture.width),
        nativeRect[1] / Math.max(1, texture.height),
      );
    }
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
      outgoingVisual: null,
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
      zoomSessionId: 0,
      zoomShiftX: keepsOffset ? previous.zoomShiftX : 0,
      zoomShiftY: keepsOffset ? previous.zoomShiftY : 0,
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

  /**
   * Native `_ExecuteCharslot` assembles every tween into the slot's cached
   * Sequence and plays it right away: `_GetCachedSlotSeq` (0x183e4f830) hands
   * back a fresh `DOTween.Sequence()` whenever the previous one already ran,
   * and `DOTween.Sequence()` (0x184109110) starts it playing because
   * `defaultAutoPlay` is `AutoPlay.All` (cctor 0x18410b0e0). `end=false` only
   * skips the `OnComplete(_SetSeqPlayed)` + redundant `Play()` pair at
   * 0x183e4e501, which in turn is what gates `isblock` (0x183e4e56f) -- it
   * never defers the animation, so nothing is queued here. `isblock` instead
   * waits for the whole cached Sequence (see characterSlotSeqDeadlines), not
   * for this command's own tweens.
   */
  private async setCharacterSlot(input: CharacterSlotInput): Promise<void> {
    const slot = this.normalizeCharacterSlot(input.slot);
    let state = this.characterSlots.get(slot);
    const hasCharacter = Boolean(input.characterKey && input.expression);

    const durationMs = Math.max(0, Math.round(input.durationMs ?? 0));

    if (hasCharacter) {
      const built = await this.buildCharacterSlotState(input, slot, state);
      // Only a linkMap miss or a texture load failure lands here; the runtime
      // already turns an unresolvable `name` into a slot clear (native swaps
      // the Images before `_LoadImage`, so the old art fades out as the back
      // Image). Keep whatever the slot shows and still run the action/focus
      // sections, as `_UpdateSeqWithParam` does after a failed load.
      if (built) state = built;
    }

    // The deadline is anchored once the asset is in, i.e. when this command's
    // tweens actually start (native only inserts the crossfade tweens after
    // its synchronous load), so a slow load neither shortens the wait of a
    // later same-slot `isblock` nor this one's. Every action contributes
    // `durationMs`: DOLocalJump's duration spans all `times` jumps
    // (0x183eb2690), and `CharShake`/`CharZoom` are plain duration-length
    // tweens.
    let blockWaitMs = 0;
    if (input.slotSequence) {
      const nowMs = performance.now();
      const cachedDeadlineMs = this.characterSlotSeqDeadlines.get(slot) ?? 0;
      const seqDeadlineMs = Math.max(
        cachedDeadlineMs,
        nowMs,
        nowMs + durationMs,
      );
      this.characterSlotSeqDeadlines.set(slot, seqDeadlineMs);
      if (input.block) blockWaitMs = seqDeadlineMs - nowMs;
    }

    if (!state) {
      if (input.focusMode) this.applyCharacterSlotFocus(input.focusSlots ?? []);
      if (blockWaitMs > 0) await this.tween(blockWaitMs, () => {});
      return;
    }

    if (input.focusMode) this.applyCharacterSlotFocus(input.focusSlots ?? []);

    const move = characterSlotMove(state, input);
    const zoom = characterSlotZoom(state, input);

    // SlotMoveChar writes `localPosition = posFrom` when the tween is
    // created, so the start of a move lands on the spot even when the tween
    // itself has a duration.
    if (move) {
      state.actionX = move.from.x;
      state.actionY = move.from.y;
    }
    this.updateCharacterState(state);

    // `_GenSlotActionTw`: NeedSkipAnimation(duration) makes the shake branch
    // return null -- shake (and shakemove's shake half) only exists with a
    // positive duration.
    if (
      (input.action === "shake" || input.action === "shakemove") &&
      durationMs > 0
    ) {
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

    // Native drives rotation from the standalone `angle` parameter segment
    // at the tail of `_UpdateSeqWithParam`; `action="rotate"` itself is an
    // unknown action in 2.7.61's `_GenSlotActionTw` (LogError + null).
    if (input.angle !== undefined) {
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

    // The move (`_offset.localPosition`) and the zoom (the fore Image's
    // pivot/localScale) are independent tweens natively: an image swap
    // resets the zoom but leaves a running move alone, and a command whose
    // from == to starts nothing, so an in-flight tween of either kind
    // survives an unrelated command.
    if (move && (move.from.x !== move.to.x || move.from.y !== move.to.y)) {
      const sessionId = ++state.transformSessionId;
      const moveDurationMs = input.action === "setpos" ? 0 : durationMs;
      const { from, to } = move;
      void this.tween(
        moveDurationMs,
        (progress) => {
          if (!this.isActiveCharacterState(state, sessionId)) return;
          state.actionX = from.x + (to.x - from.x) * progress;
          state.actionY = from.y + (to.y - from.y) * progress;
          this.updateCharacterState(state);
        },
        () => {
          if (!this.isActiveCharacterState(state, sessionId)) return;
          state.actionX = to.x;
          state.actionY = to.y;
          this.updateCharacterState(state);
        },
      );
    }

    if (
      zoom &&
      (zoom.from.scaleX !== zoom.to.scaleX ||
        zoom.from.scaleY !== zoom.to.scaleY ||
        zoom.from.shiftX !== zoom.to.shiftX ||
        zoom.from.shiftY !== zoom.to.shiftY)
    ) {
      const sessionId = ++state.zoomSessionId;
      const { from, to } = zoom;
      void this.tween(
        durationMs,
        (progress) => {
          if (
            !this.isActiveCharacterState(state) ||
            state.zoomSessionId !== sessionId
          )
            return;
          state.scaleX = from.scaleX + (to.scaleX - from.scaleX) * progress;
          state.scaleY = from.scaleY + (to.scaleY - from.scaleY) * progress;
          state.zoomShiftX = from.shiftX + (to.shiftX - from.shiftX) * progress;
          state.zoomShiftY = from.shiftY + (to.shiftY - from.shiftY) * progress;
          this.updateCharacterState(state);
        },
        () => {
          if (
            !this.isActiveCharacterState(state) ||
            state.zoomSessionId !== sessionId
          )
            return;
          state.scaleX = to.scaleX;
          state.scaleY = to.scaleY;
          state.zoomShiftX = to.shiftX;
          state.zoomShiftY = to.shiftY;
          this.updateCharacterState(state);
        },
      );
    }

    // `isblock` waits for the slot's whole cached Sequence -- this command's
    // shake/jump/rotate tweens included, plus whatever a still-running
    // `end=false` enter on the same slot left in it -- not just move/zoom.
    if (blockWaitMs > 0) await this.tween(blockWaitMs, () => {});
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
    // Native `set_isHidden(true)` flips `m_hidden` immediately; the fade only
    // animates the visible alpha towards it.
    this.subtitleHidden = true;

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

  /**
   * Port scope: `Torappu.AVG.AVGTimerView.StopTimer` (2.7.61 VA 0x183ed53e0):
   * `DOKill(_canvas, complete: false)` kills any in-flight fade tween without
   * completing it, then fades from the current alpha to a hard-coded 0 and
   * hides (never destroys) the view. The fade session counter is the DOKill
   * analogue: bumping it here retires the previous fade's step/done callbacks
   * so a timersticker fade-in still running when timerclear lands cannot keep
   * writing alpha alongside the fade-out.
   */
  async clearTimerSticker(input?: TimerClearInput): Promise<void> {
    this.clearTimerInterval();
    // `DOKill(_canvas, complete: false)`: an earlier fade is dropped mid-flight,
    // so a StopTimer fade it may have been running never reaches its OnComplete.
    this.timerFadeSessionId += 1;
    this.timerStopFadeComplete = null;

    const timer = this.timerStickerText;
    if (!timer) {
      this.timerTaskActive = false;
      return;
    }

    if (!input) {
      this.timerTaskActive = false;
      timer.text = "";
      timer.visible = false;
      timer.alpha = 1;
      return;
    }

    // `<StopTimer>b__7_0` is what actually retires the clock: it nulls
    // `m_countTimerTask` and deactivates the view. Until this runs the slot is
    // still considered to own a task, which is what makes a timersticker
    // arriving mid-fade reuse it instead of rebuilding it.
    const finishStopFade = (): void => {
      this.timerStopFadeComplete = null;
      this.clearTimerInterval();
      this.timerTaskActive = false;
      timer.alpha = 0;
      timer.visible = false;
    };

    const fromAlpha = timer.alpha;
    if (input.durationMs <= 0) {
      finishStopFade();
      return;
    }

    const fadeSessionId = this.timerFadeSessionId;
    this.timerStopFadeComplete = finishStopFade;
    void this.tween(
      input.durationMs,
      (progress) => {
        if (this.timerFadeSessionId !== fadeSessionId) return;
        timer.alpha = fromAlpha * (1 - progress);
      },
      () => {
        if (this.timerFadeSessionId !== fadeSessionId) return;
        finishStopFade();
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
          this.applyBlockerScaleSign(blocker);
        } catch {
          this.onWarning?.(`missing blocker image: ${input.image}`);
        }
      }
    } else if (input.style !== "default") {
      // Native slider/verticalslider set sprite = null (2.7.61 VA 0x183e30297):
      // the quad stays full-screen and the SlideMask material draws the wipe.
      // Texture.WHITE is the web equivalent of Unity's null-sprite white quad.
      blocker.texture = Texture.WHITE;
      blocker.width = STORY_WIDTH;
      blocker.height = STORY_HEIGHT;
      this.applyBlockerScaleSign(blocker);
      if (input.fadeMs > 0) {
        // _GenTweenerWithParam mounts slide_mask only on the animated path
        // (VA 0x183e30860); the zero-duration branch never touches the
        // material, so it persists from the previous command.
        await this.attachBlockerSlideFilter(blocker, input.style);
      }
    }

    const current = this.readBlockerColor();
    // `DOKill(_blocker, complete: false)` equivalent (2.7.61 VA 0x183e30522):
    // a new command kills the previous DOColor mid-flight, so at most one
    // blocker tween is ever active. Stale step/complete callbacks below are
    // dropped -- a stale complete with to.a ~= 0 would otherwise reset the
    // texture and hide the sprite under the new command.
    const sessionId = ++this.blockerTweenSessionId;
    const from = {
      a: Number.isFinite(input.from.a) ? input.from.a : current.a,
      b: Number.isFinite(input.from.b) ? input.from.b : current.b,
      g: Number.isFinite(input.from.g) ? input.from.g : current.g,
      r: Number.isFinite(input.from.r) ? input.from.r : current.r,
    };
    this.writeBlockerColor(blocker, from);

    if (input.fadeMs <= 0) {
      // The zero-fadetime path returns before the inverse block, so scale is
      // untouched here, and before _GenTweenerWithParam, so the material
      // (slide filter) keeps whatever the previous animated command mounted.
      this.writeBlockerColor(blocker, input.to);
      return;
    }

    // Animated default-style commands call _CleanMaterial (set_material(null))
    // inside _GenTweenerWithParam; slider styles mounted the filter above.
    if (input.style === "default") this.detachBlockerSlideFilter(blocker);

    // `AVGBlockerPanel._ExecuteBlocker` assigns literal -1 rather than negating
    // the current axis: repeated inverse commands are idempotent, and only reset
    // via OnReset. The sign lives in blockerScaleSign (PIXI's width setter
    // rewrites scale magnitudes), and the mask coordinate mirror follows it in
    // SlideMaskFilter's uFlip uniforms.
    if (input.inverse) {
      if (input.style === "slider") this.blockerScaleSign.x = -1;
      else if (input.style === "verticalslider") this.blockerScaleSign.y = -1;
      this.applyBlockerScaleSign(blocker);
    }

    const run = this.tween(
      input.fadeMs,
      (progress) => {
        if (sessionId !== this.blockerTweenSessionId) return;
        this.writeBlockerColor(blocker, {
          a: from.a + (input.to.a - from.a) * progress,
          b: from.b + (input.to.b - from.b) * progress,
          g: from.g + (input.to.g - from.g) * progress,
          r: from.r + (input.to.r - from.r) * progress,
        });
      },
      () => {
        if (sessionId !== this.blockerTweenSessionId) return;
        if (Math.abs(input.to.a) <= 1e-6) {
          // _FinishCommand's _ResetBlockerImg equivalent. Native restores the
          // serialized `_defaultBlocker` sprite (VA 0x183e30af0), not null;
          // the plain white quad is the standing web approximation of it.
          // The size write is required because the 1x1 Texture.WHITE would
          // otherwise inherit the previous texture's scale.
          blocker.texture = Texture.WHITE;
          blocker.width = STORY_WIDTH;
          blocker.height = STORY_HEIGHT;
          this.applyBlockerScaleSign(blocker);
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
    this.subtitleTypingTarget = null;

    // Native `SubtitlePanel._SetHiddenInternal` (2.7.61 VA 0x183e94ff0):
    // `set_isHidden(false)` is a no-op while the panel is already visible, so
    // consecutive subtitles swap text seamlessly without replaying the 150ms
    // Linear fade-in. A hidden panel fades in from its current alpha, which
    // also covers interrupting an in-flight fade-out (DOKill + DOFade).
    //
    // The fade session is only bumped when a fade actually starts: native's
    // no-op branch never reaches DOKill either, so a fade-in that is still
    // running when the next subtitle arrives must keep animating to 1. Bumping
    // it unconditionally would orphan that tween and strand the panel at
    // whatever alpha it had reached.
    if (this.subtitleHidden) {
      this.subtitleHidden = false;
      const startAlpha = subtitle.visible ? subtitle.alpha : 0;
      subtitle.visible = true;
      this.subtitleFadeSessionId += 1;
      const fadeSessionId = this.subtitleFadeSessionId;
      void this.tween(
        150,
        (progress) => {
          if (this.subtitleFadeSessionId === fadeSessionId)
            subtitle.alpha = startAlpha + (1 - startAlpha) * progress;
        },
        () => {
          if (this.subtitleFadeSessionId === fadeSessionId) subtitle.alpha = 1;
        },
      );
    }

    const prevChars: RichChar[] = [];
    const newChars = parseRichChars(input.text);
    const allChars = [...prevChars, ...newChars];

    const colors = collectColors(allChars);
    const style = this.createOverlayTextStyle(input.sizePx, input.widthPx);
    // Native maps alignment to TextAnchor.UpperLeft/UpperCenter/UpperRight,
    // which horizontally aligns *every wrapped line* inside the width box;
    // PIXI needs the per-line `align` style in addition to the whole-block
    // offset that layoutSubtitle applies.
    style.align = input.alignment;
    // The transparent hidden tail below needs its tag registered while typing,
    // with the drop shadow disabled so the unrevealed text stays invisible.
    const tagStyles: NonNullable<TextStyle["tagStyles"]> =
      buildTagStyles(colors);
    if (input.delayMs > 0)
      tagStyles[SUBTITLE_HIDDEN_TAIL_TAG] = { ...SUBTITLE_HIDDEN_TAIL_STYLE };
    if (Object.keys(tagStyles).length > 0) style.tagStyles = tagStyles;
    subtitle.style = style;
    subtitle.y = input.y;

    const fullText = richCharsToTaggedText(allChars);
    if (input.delayMs <= 0) {
      subtitle.text = fullText;
      this.layoutSubtitle(subtitle, input.x, input.widthPx, input.alignment);
      // Nothing to type: the typewriter is done the moment the text is shown.
      input.onTypingComplete?.();
      return;
    }

    const sessionId = this.subtitleTypingSessionId;
    // Native `AVGTypeWriterText.BeginText` lays out the full message from t0
    // by keeping the unrevealed tail in the text wrapped in a fully
    // transparent <color=#00000000> span; revealing chars never re-wraps the
    // lines that are already on screen.
    subtitle.text = richCharsToTaggedText([
      ...prevChars,
      ...subtitleHiddenTail(newChars),
    ]);
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
      newChars,
      onTypingComplete: input.onTypingComplete,
      prevChars,
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
   * The step order below is RenderTimer's own: transform and font first, then
   * `_StartCountTimer`, then the `_ShowTimer` fade, and only after RenderTimer
   * returns does `_ExcuteTimerSticker` re-activate the view.
   */
  async setTimerSticker(input: TimerStickerInput): Promise<void> {
    const timer = this.ensureTimerStickerText();

    timer.style = this.createOverlayTextStyle(input.sizePx, input.widthPx);
    timer.x = input.x;
    timer.y = input.y;

    // RenderTimer guards `_StartCountTimer` with `time > 0`; with the parameter
    // absent (native default -1) neither the text nor a running clock is
    // touched.
    if (input.limitSeconds !== undefined && input.limitSeconds > 0)
      this.startTimerCountUp(timer, input.limitSeconds);

    // `DOKill(_canvas, complete: true)`, the asymmetric counterpart of
    // StopTimer's `complete: false`: it *finishes* a timerclear fade still in
    // flight, which runs `<StopTimer>b__7_0` and nulls `m_countTimerTask` --
    // discarding the clock restarted just above, so the text stays frozen at
    // its last value while the view still fades back in.
    this.timerFadeSessionId += 1;
    this.timerStopFadeComplete?.();

    timer.alpha = input.fromAlpha;
    const fadeSessionId = this.timerFadeSessionId;
    void this.tween(
      input.durationMs > 0 ? input.durationMs : 130,
      (progress) => {
        if (this.timerFadeSessionId !== fadeSessionId) return;
        timer.alpha =
          input.fromAlpha + (input.toAlpha - input.fromAlpha) * progress;
      },
      () => {
        if (this.timerFadeSessionId !== fadeSessionId) return;
        timer.alpha = input.toAlpha;
      },
    );

    // `SetActiveIfNecessary(gameObject, true)` trails RenderTimer, so it undoes
    // the deactivation a completed StopTimer fade may have just performed.
    timer.visible = true;
  }

  /**
   * Port scope: `Torappu.AVG.AVGTimerView._StartCountTimer` (2.7.61 VA
   * 0x183ed5830) plus the `CountDownTask` it drives.
   *
   * Native is a stopwatch, not a countdown: `SetCountDown` (0x181cefc50) stores
   * startTime = now, endTime = now + time*1000 (ms) on a wall clock, and
   * `Update` feeds `_OverrideTimerTaskTick` = `Math.Max(curTime - startTime, 0)`
   * -- elapsed milliseconds, verified at the instruction level in build 2761
   * (an earlier reading of `endTime - curTime` had the operands swapped) -- into
   * `_TimerTick` = TimeSpan.FromMilliseconds(...). The text therefore climbs
   * 00:00:00 -> 00:00:01 -> ...; reaching `time` fires `_TimerEnd`, which only
   * clears the task, so the display freezes at the cap (time=9999 -> 02:46:39)
   * and stays visible. Deriving elapsed from the wall clock also avoids interval
   * drift under browser throttling.
   */
  private startTimerCountUp(timer: Text, capSeconds: number): void {
    this.clearTimerInterval();

    if (!this.timerTaskActive) {
      // The inline `_TimerTick(0)` that seeds 00:00:00 lives in the branch that
      // builds the task, so a slot whose clock is still alive is merely re-based
      // by `SetCountDown` and keeps showing its current value.
      this.timerTaskActive = true;
      timer.text = this.formatTimer(0);
    }

    const startMs = Date.now();
    this.timerStickerInterval = setInterval(
      () => {
        const elapsedSeconds = Math.min(
          capSeconds,
          // `Math.Max(..., 0)`: a wall clock can step backwards.
          Math.max(0, Math.floor((Date.now() - startMs) / 1000)),
        );
        const timerText = this.timerStickerText;
        if (!timerText) return;

        const text = this.formatTimer(elapsedSeconds);
        if (timerText.text !== text) timerText.text = text;
        if (elapsedSeconds >= capSeconds) {
          this.clearTimerInterval();
          this.timerTaskActive = false;
        }
      },
      // 200ms mirrors the native CountDownTask internal tick; the wall-clock
      // math makes extra fires harmless (same floor value, no text rewrite).
      200,
    );
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
    // Centered anchor: the persistent inverse flip (localScale = -1) mirrors
    // the quad around its center, exactly like the native stretch-anchored
    // RectTransform, so coverage stays the full 1280x720 either sign.
    blocker.anchor.set(0.5);
    blocker.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    blocker.width = STORY_WIDTH;
    blocker.height = STORY_HEIGHT;
    blocker.tint = 0x00_00_00;
    blocker.alpha = 0;

    this.blockerSprite = blocker;
    // Native hierarchy: panel_blocker (sibling 1) renders *below*
    // panel_curtains (sibling 3), so curtains cover the blocker when both are
    // up (black-mask pass, 2.7.61 scene layout). Insert just below the
    // curtains container instead of appending on top of it. `indexOf` rather
    // than `getChildIndex`, which throws when curtains has no parent yet
    // (LayerGraph.attach runs in mount, so only an un-mounted harness hits
    // that) -- there, appending is the right fallback.
    const curtainIndex = this.worldLayer.children.indexOf(this.curtainLayer);
    this.worldLayer.addChildAt(
      blocker,
      curtainIndex === -1 ? this.worldLayer.children.length : curtainIndex,
    );

    return blocker;
  }

  /**
   * Push the persistent localScale sign onto the sprite and the wipe shader.
   * Called after every width/height write, which recomputes the scale
   * magnitude from the new texture's local bounds (PIXI's size setters do
   * carry the existing sign across, so this is a no-op re-assert there; it is
   * load-bearing when `blockerScaleSign` itself just changed, and it is the
   * single place SlideMaskFilter's uFlip stays in sync).
   */
  private applyBlockerScaleSign(blocker: Sprite): void {
    blocker.scale.x = this.blockerScaleSign.x * Math.abs(blocker.scale.x);
    blocker.scale.y = this.blockerScaleSign.y * Math.abs(blocker.scale.y);
    this.blockerSlideFilter?.setFlip(
      this.blockerScaleSign.x < 0,
      this.blockerScaleSign.y < 0,
    );
  }

  /**
   * `_SetMaterial(slide_mask)` + ENABLE_VERTICAL keyword equivalent. Loads the
   * bundled `slide_left` mask once; on failure the wipe degrades to the plain
   * whole-surface veil (warning) instead of blocking playback.
   */
  private async attachBlockerSlideFilter(
    blocker: Sprite,
    style: "slider" | "verticalslider",
  ): Promise<void> {
    if (!this.blockerMaskSource && !this.blockerMaskSourceFailed) {
      try {
        const texture = await Assets.load<Texture>(SLIDE_MASK_TEXTURE_URL);
        // Native sampler: bilinear + clamp wrap (Texture2D slide_left
        // settings), which is PIXI's default texture style.
        this.blockerMaskSource = texture.source;
      } catch {
        this.blockerMaskSourceFailed = true;
        this.onWarning?.("missing blocker slide mask texture");
      }
    }
    const source = this.blockerMaskSource;
    if (!source) return;

    this.blockerSlideMaterial ??= new SlideMaskFilter(source);
    this.blockerSlideFilter = this.blockerSlideMaterial;
    this.blockerSlideFilter.setVertical(style === "verticalslider");
    this.applyBlockerScaleSign(blocker);
    blocker.filters = [this.blockerSlideFilter];
  }

  /** `_CleanMaterial` (set_material(null)) equivalent for default styles. */
  private detachBlockerSlideFilter(blocker: Sprite): void {
    if (!this.blockerSlideFilter) return;
    blocker.filters = [];
    // Null the mount so writeBlockerColor returns to sprite.alpha blending;
    // blockerSlideMaterial keeps the instance for the next slider command,
    // the way native re-assigns the same cached Material asset.
    this.blockerSlideFilter = null;
    // While mounted, sprite.alpha was pinned to 1 and the wipe owned the
    // alpha. Hand it straight back here: the caller's next color write is a
    // tween step one frame away, so leaving 1 in place flashes a fully opaque
    // blocker for that frame.
    blocker.alpha = clamp01(this.blockerColor.a);
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
    // feeds the face through `_HGDynamicTex`), so alpha (`DOColor` on the fore
    // Image's vertex colour) and `_BlackStart`/`_BlackEnd` multiply the
    // already-composited pixels. The web port must bake the face onto the body
    // up front for the same reason: two stacked sprites would each carry the
    // fade alpha separately, making the face region's effective opacity
    // 1-(1-p)^2 instead of p -- the face would fade in ahead of the body.
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

      const texture = this.bakeFaceOverlayTexture(
        group.base,
        item.face,
        baseTexture,
        faceTexture,
        group.faceRect,
      );
      if (!texture) return null;

      const sprite = new Sprite(texture);
      sprite.anchor.set(0, 0);
      content.addChild(sprite);
      contentSprites.push(sprite);
      this.retainFaceOverlay(
        visual,
        faceOverlayCacheKey(group.base, item.face),
      );
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
        outgoingVisual: null,
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
        zoomSessionId: 0,
        zoomShiftX: 0,
        zoomShiftY: 0,
      };
      this.updateCharacterState(state);
      this.updateCharacterOpacity(state);
      this.characterSlots.set(slot, state);
      this.charLayer.addChild(root);
      return state;
    }

    const previousVisual = current.visual;
    // Native keeps one back Image; a swap mid-crossfade replaces it outright.
    if (current.outgoingVisual && current.outgoingVisual !== previousVisual)
      this.discardCharacterVisual(current.outgoingVisual);
    current.outgoingVisual = null;

    // `AVGCharacterSpriteHub._SetImage` (0x183ec8f50) and its HubGroup twin
    // (0x183ec8020) both open with `GUIUtils.AssignLocalSettings(
    // m_image.rectTransform, hub.rectTransform)` (0x181f02c70), which copies
    // the hub prefab's sizeDelta/pivot/localScale/localRotation/localPosition
    // onto the fore Image on every successful load -- exactly the pivot and
    // localScale CharZoom's setter animates. A named swap therefore resets
    // the zoom while the `_offset` move survives (resetOffsetPos=false). The
    // outgoing Image keeps its own transform as it fades, so the previous
    // visual carries the old zoom on itself (scaled back through the base
    // ratio because the motion layer now holds the incoming art's base).
    if (previousVisual !== built.visual) {
      previousVisual.scale.set(
        (current.scaleX * current.baseScaleX) / Math.max(1e-6, baseScaleX),
        (current.scaleY * current.baseScaleY) / Math.max(1e-6, baseScaleY),
      );
      previousVisual.position.set(
        current.zoomShiftX / Math.max(1e-6, baseScaleX),
        -current.zoomShiftY / Math.max(1e-6, baseScaleY),
      );
    }
    current.zoomSessionId += 1;
    current.scaleX = 1;
    current.scaleY = 1;
    current.zoomShiftX = 0;
    current.zoomShiftY = 0;

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

    // Native crossfade: `_SlotSetCharInternal` runs the outgoing sprite's
    // fade-out immediately, while the incoming sprite's afrom->ato tween (the
    // same tween `applyCharacterSlotOpacity` drives through contentAlpha) is
    // the crossfade itself. Its length is `duration` -- `fadetime` is not a
    // charslot key. The incoming visual therefore starts at the current
    // contentAlpha (set to `afrom` right after by the caller) and only the
    // outgoing visual gets a dedicated fade here.
    const fadeMs = Math.max(0, Math.round(input.replaceFadeMs ?? 0));
    built.visual.alpha = clamp01(current.contentAlpha);
    if (previousVisual && previousVisual !== built.visual && fadeMs > 0) {
      const sessionId = ++current.replaceFadeSessionId;
      const previousAlpha = previousVisual.alpha;
      current.outgoingVisual = previousVisual;
      void this.tween(
        fadeMs,
        (progress) => {
          if (
            !this.isActiveCharacterState(current) ||
            current.replaceFadeSessionId !== sessionId
          )
            return;
          previousVisual.alpha = previousAlpha * (1 - progress);
        },
        () => {
          if (
            !this.isActiveCharacterState(current) ||
            current.replaceFadeSessionId !== sessionId
          )
            return;
          if (current.outgoingVisual === previousVisual)
            current.outgoingVisual = null;
          this.discardCharacterVisual(previousVisual);
        },
      );
    } else if (previousVisual && previousVisual !== built.visual) {
      this.discardCharacterVisual(previousVisual);
    }

    return current;
  }

  /**
   * Web approximation of the greenscreen black band. Native feeds bstart/bend
   * through `CharacterParam` into `AVGCharacterSlot._LoadImage` (0x183eb4f60)
   * -> `AVGCharacterSpriteHub._SetImage` -> `AlphaSplitImageHolder.SetSprite`
   * (0x183ec5e60), which writes the material floats as
   * `_BlackStart = 1 - bstart` and `_BlackEnd = 1 - bend` -- the same 1-x the
   * dead `charslotmask` channel (`SlotChangeMask`) tweens, so both channels
   * hand the shader identical values and one mapping serves both. The band
   * geometry itself lives in the greenscreen shader, which the DLL cannot
   * show; this static top-down gradient was matched against the client
   * visually and is the approximation.
   */
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

  /**
   * Flattens a `face_overlay` group (body + expression face) into a single
   * texture. Native renders both through one `avgCharSplitShader` material
   * (`AlphaSplitImageHolder.SetSprite` 0x183ec5e60: the body is the Image's
   * own sprite, the face rides the same material's `_HGDynamicTex` with the
   * `faceOffset` UV transform), so the face is composited *inside* the shader
   * before the vertex colour multiplies the result. Keeping two stacked Pixi
   * sprites instead would fade each layer with its own copy of the alpha
   * (`1-(1-p)^2` over the face) and double-apply `_BlackStart` shading, so the
   * composite is baked once per (base, face) pair and cached (bounded by
   * `FACE_OVERLAY_CACHE_LIMIT`, refcounted by the visuals drawing it).
   *
   * The face texture is stretched to `faceRect` as-is (no aspect-ratio
   * preservation): the CDN face PNG matches what native maps through the
   * `faceOffset` scale/offset, verified against the official client.
   */
  private bakeFaceOverlayTexture(
    baseKey: string,
    faceKey: string,
    baseTexture: Texture,
    faceTexture: Texture,
    faceRect: { x: number; y: number; w: number; h: number },
  ): Texture | null {
    const cacheKey = faceOverlayCacheKey(baseKey, faceKey);
    const cached = this.faceOverlayTextures.get(cacheKey);
    if (cached) {
      // Refresh recency: the Map's insertion order is the eviction order.
      this.faceOverlayTextures.delete(cacheKey);
      this.faceOverlayTextures.set(cacheKey, cached);
      return cached.texture;
    }

    const baseResource = baseTexture.source?.resource as
      CanvasImageSource | undefined;
    const faceResource = faceTexture.source?.resource as
      CanvasImageSource | undefined;
    // Mirrors bakeDarkenedCharacterTexture: a texture we cannot draw has to
    // fail the whole bake rather than silently drop the face or the body.
    if (!baseResource || !faceResource) return null;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(baseTexture.width));
    canvas.height = Math.max(1, Math.round(baseTexture.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const baseFrame = baseTexture.frame;
    ctx.drawImage(
      baseResource,
      baseFrame.x,
      baseFrame.y,
      baseFrame.width,
      baseFrame.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    const faceFrame = faceTexture.frame;
    ctx.drawImage(
      faceResource,
      faceFrame.x,
      faceFrame.y,
      faceFrame.width,
      faceFrame.height,
      faceRect.x,
      faceRect.y,
      faceRect.w,
      faceRect.h,
    );

    const texture = new Texture({
      source: new CanvasSource({ resource: canvas }),
    });
    this.faceOverlayTextures.set(cacheKey, { refs: 0, texture });
    this.trimFaceOverlayCache();
    return texture;
  }

  /** Pins a cached bake for as long as `visual` is on stage. */
  private retainFaceOverlay(visual: Container, cacheKey: string): void {
    const entry = this.faceOverlayTextures.get(cacheKey);
    if (!entry) return;
    entry.refs += 1;
    this.faceOverlayVisualKeys.set(visual, cacheKey);
  }

  private releaseCharacterVisual(visual: Container): void {
    const cacheKey = this.faceOverlayVisualKeys.get(visual);
    if (cacheKey === undefined) return;
    this.faceOverlayVisualKeys.delete(visual);
    const entry = this.faceOverlayTextures.get(cacheKey);
    if (entry) entry.refs = Math.max(0, entry.refs - 1);
    this.trimFaceOverlayCache();
  }

  /** Takes a character visual off stage and drops its hold on its bake. */
  private discardCharacterVisual(visual: Container): void {
    visual.removeFromParent();
    this.releaseCharacterVisual(visual);
  }

  /**
   * Evicts the least recently baked entries nobody draws any more until the
   * cache is back under `FACE_OVERLAY_CACHE_LIMIT`. Entries still on stage
   * are skipped, so the cap is soft.
   */
  private trimFaceOverlayCache(): void {
    for (const [key, entry] of this.faceOverlayTextures) {
      if (this.faceOverlayTextures.size <= FACE_OVERLAY_CACHE_LIMIT) return;
      if (entry.refs > 0) continue;
      this.faceOverlayTextures.delete(key);
      entry.texture.destroy(true);
    }
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

  private applyCharacterSlotFocus(focusSlots: string[]): void {
    // Native focus is a full re-resolve on every charslot:
    // `_ProcessFocusArray` (0x183e50b30) clears all four flags, then lights
    // only the listed slots; unrecognized values light nothing. Brightness
    // changes are tweens in the Sequence (SetFocus), applied instantly here.
    const active = new Set(
      focusSlots.map((value) => this.normalizeCharacterSlot(value)),
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

    // `contentAlpha` mirrors the fore Image's vertex alpha, which native lets
    // overshoot below 0 (a nameless `afrom` fades toward ato = -1); it is only
    // clamped at the write in updateCharacterOpacity, so a resumed fade starts
    // from the visible value.
    const fromAlpha = hasFrom ? input.alphaFrom! : clamp01(state.contentAlpha);
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
    state.motionLayer.x = state.actionX + state.zoomShiftX + state.shakeOffsetX;
    state.motionLayer.y =
      state.shakeOffsetY - state.actionY - state.zoomShiftY - state.jumpOffsetY;
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
    // Unity's Color -> Color32 conversion clamps the vertex alpha, so a tween
    // toward a negative `ato` reads as fully transparent once it crosses 0.
    state.visual.alpha = clamp01(state.contentAlpha);
  }

  private disposeCharacterState(state: CharacterRenderState): void {
    state.opacitySessionId += 1;
    state.replaceFadeSessionId += 1;
    state.transformSessionId += 1;
    state.zoomSessionId += 1;
    state.jumpSessionId += 1;
    this.stopRotateAction(state);
    this.stopShakeAction(state);
    state.root.removeFromParent();
    // The current visual and any still-fading previous one both hold a
    // face-overlay bake.
    for (const child of state.rotationLayer.children)
      this.releaseCharacterVisual(child as Container);
    state.outgoingVisual = null;
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

  private readBlockerColor(): {
    a: number;
    b: number;
    g: number;
    r: number;
  } {
    // Native `_ExecuteBlocker` reads the current `Color` (float32) for the
    // omitted `*From` channels (2.7.61 VA 0x183e30318). Returning the raw
    // float mirror keeps full precision and preserves 0-255-scale values
    // across commands, instead of re-reading the quantized 8-bit tint.
    return { ...this.blockerColor };
  }

  private writeBlockerColor(
    blocker: Sprite,
    color: { a: number; b: number; g: number; r: number },
  ): void {
    // Native stores the raw GetFloat values straight into `Color` (float32,
    // components may exceed 1) and DOColor tweens that raw color; only the GPU
    // clamps at render time. So a 0-255 endpoint (r=255) saturates the channel
    // for essentially the whole tween -- the visible fade is the alpha ramp.
    // Mirror that: keep the raw floats, and clamp just this 8-bit tint write.
    // (The old per-value `value > 1 ? value / 255 : value` heuristic re-scaled
    // every intermediate frame, halving mid-fade brightness.)
    this.blockerColor = { a: color.a, b: color.b, g: color.g, r: color.r };
    blocker.tint =
      (tintChannel(color.r) << 16) |
      (tintChannel(color.g) << 8) |
      tintChannel(color.b);
    if (this.blockerSlideFilter) {
      // SlideMask replaces Image.alpha with the per-pixel wipe: the sprite
      // stays opaque so the filter input keeps the untinted-dimmed rgb, and
      // the raw alpha drives the shader's reveal progress directly.
      this.blockerSlideFilter.alpha = color.a;
      blocker.alpha = 1;
    } else {
      blocker.alpha = clamp01(color.a);
    }
    blocker.visible = color.a > 0;
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
    // `_TimerTick` formats `TimeSpan.FromMilliseconds(...)`; `TimeSpan.Hours`
    // wraps at 24, so time >= 86400 displays modulo a day (100000 -> 03:46:40).
    const hours = Math.floor(totalSeconds / 3600) % 24;
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
      newChars: RichChar[];
      onTypingComplete?: () => void;
      prevChars: RichChar[];
      widthPx: number;
    },
  ): Promise<void> {
    for (let index = 0; index < input.newChars.length; index += 1) {
      if (!this.app || this.subtitleTypingSessionId !== sessionId) return;

      await new Promise((resolve) => setTimeout(resolve, input.delayMs));

      if (!this.app || this.subtitleTypingSessionId !== sessionId) return;

      // The transparent tail keeps the full-text line layout fixed while the
      // visible prefix grows (native BeginText hidden-string port).
      subtitle.text = richCharsToTaggedText([
        ...input.prevChars,
        ...input.newChars.slice(0, index + 1),
        ...subtitleHiddenTail(input.newChars.slice(index + 1)),
      ]);
      this.layoutSubtitle(
        subtitle,
        input.baseX,
        input.widthPx,
        input.alignment,
      );
    }

    if (this.subtitleTypingSessionId === sessionId) {
      this.subtitleTypingTarget = null;
      // Native `SubtitlePanel._OnTypeWriterEnd` (2.7.61 VA 0x183e94e80):
      // typing that finishes on its own raises the auto click; without this,
      // auto mode would sit on the subtitle waiting for a manual click.
      input.onTypingComplete?.();
    }
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

  /**
   * The sizeDelta `Image.SetNativeSize()` writes in the CN client:
   * `sprite.rect / ppu * 100` (canvas.referencePixelsPerUnit = 100), plus it
   * collapses the prefab's stretch anchors so sizeDelta becomes the real
   * rect. AVG background art ships a tuned per-asset ppu (80 / 100 /
   * 68.2464 / ...), so this is generally NOT the texture's pixel size --
   * e.g. bg_cher_1 (1024x576, ppu 68.2464) natively renders 1500.44x844,
   * a 17% centered overscan. Web PNGs are texture-sized with no ppu
   * metadata, so the per-key ppu comes from the `avg/background.json`
   * sidecar (context.backgroundPpuMap). For keys missing from the sidecar
   * every 16:9 background added since 2023 ships a ppu tuned to exactly the
   * 1280x720 canvas, so a 16:9 texture maps to that and anything else keeps
   * its texture size.
   */
  private nativeBackgroundRect(
    key: string,
    texture: Texture,
  ): readonly [number, number] {
    const width = Math.max(1, texture.width);
    const height = Math.max(1, texture.height);
    // Sidecar keys are the lowercase bundle container names (= web asset
    // URLs); normalize defensively in case a story references a key with
    // different casing than the bundle.
    const ppu = this.context.backgroundPpuMap?.[key.toLowerCase()];
    if (ppu !== undefined && ppu > 0) {
      return [(width / ppu) * 100, (height / ppu) * 100];
    }
    if (Math.abs(width / height - STORY_WIDTH / STORY_HEIGHT) < 0.01) {
      return [STORY_WIDTH, STORY_HEIGHT];
    }
    return [width, height];
  }

  /**
   * Native port: `AVGImagePanel._LoadImage` sizes the Image in three steps.
   * (1) `Image.SetNativeSize()` resets sizeDelta to the sprite's native
   * display rect (see nativeBackgroundRect -- confirmed called at
   * 0x183e58688 in build 2761 right after `image.sprite` is assigned).
   * (2) sizeDelta is multiplied by the `width`/`height` params
   * (GetOrDefault<float>(..., 1.0); mulss at 0x183e587b0/0x183e587b4).
   * (3) An optional SCREEN_ADAPT_FUNCTION_MAP entry maps that multiplied
   * rect against the 1280x720 reference -- the ratio checks read the
   * post-multiplier sizeDelta too. With screenadapt omitted the rect keeps
   * the multiplied native size, which still covers the canvas for ppu-tuned
   * art (most backgrounds) and reveals the backing color only around art
   * whose native rect is smaller than 1280x720 (e.g. 33_g4_srctheater).
   */
  private layoutImageForScreenAdapt(
    sprite: Sprite | TilingSprite,
    mode?: BackgroundInput["screenAdapt"],
    multipliers?: { height: number; width: number },
    nativeRect?: readonly [number, number],
  ): void {
    const nativeWidth = nativeRect?.[0] ?? Math.max(1, sprite.texture.width);
    const nativeHeight = nativeRect?.[1] ?? Math.max(1, sprite.texture.height);
    const sourceWidth = nativeWidth * (multipliers?.width ?? 1);
    const sourceHeight = nativeHeight * (multipliers?.height ?? 1);
    let width = sourceWidth;
    let height = sourceHeight;

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
