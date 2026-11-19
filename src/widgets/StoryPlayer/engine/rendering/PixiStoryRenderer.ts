import {
  Application,
  Assets,
  CanvasSource,
  Container,
  Point,
  Sprite,
  type Text,
  TextStyle,
  Texture,
  type Ticker,
  type TilingSprite,
  UPDATE_PRIORITY,
} from "pixi.js";

import { DIALOG_FRAME_URL, SHOWITEM_PHOTO_FRAME_URL } from "../../assets";
import {
  nativeBundleKey,
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryCharacterAssetByKey,
  type StoryAssetFamily,
} from "../asset";
import { describeCharacterPortrait } from "../characterPortrait";
import { resolveNativeCharacterRef } from "../characterRef";
import {
  browserAnimationClock,
  createExecutionHandle,
  type ExecutionHandle,
} from "../execution";
import { DIALOG_FONT_FAMILY, DIALOG_FONT_WEIGHT } from "../font";
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
  type CgItemShakeInput,
  type CharacterActionInput,
  type CharacterCutinInput,
  type CharacterSlotInput,
  type CurtainInput,
  type DecisionSelection,
  type DialogueLayout,
  type FocusOutInput,
  type FocusParamInput,
  type GridBackgroundInput,
  type ImageRotateInput,
  type ImageTweenInput,
  type InterludeInput,
  type LargeBackgroundTweenInput,
  type PlaybackFrame,
  type SpellStickerInput,
  type StickerInput,
  type StickerTweenInput,
  type StoryRenderer,
  type StoryShowItemSlot,
  type OverlayTextLayout,
  type TimerClearInput,
  type TimerStickerInput,
  type TypewriterText,
} from "../types";

import { SceneEffectManager } from "./SceneEffectManager";
import {
  CharacterArtLoader,
  type CharacterArt,
  type CharacterArtLoad,
} from "./characters/CharacterArt";
import { guardClaimedClicks } from "./core/ClickClaim";
import { dotweenEaseCurve, type EaseCurve } from "./core/DotweenEase";
import { createImageSprite } from "./core/ImageSprite";
import { LayerGraph } from "./core/LayerGraph";
import {
  applyCenteredTransform as applyCenteredTransformToRoot,
  readCenteredTransform as readRootTransform,
} from "./core/SceneGeometry";
import { buildShakePath, sampleShakePath } from "./core/ShakePath";
import { getCachedTexture, type TextureLoad } from "./core/TextureAsset";
import { TweenRunner, type TweenRunOptions } from "./core/TweenRunner";
import { AnimTextPanel } from "./panels/AnimTextPanel";
import { AvgDisplayPanel } from "./panels/AvgDisplayPanel";
import { BlockerView } from "./panels/BlockerView";
import { CgItemView } from "./panels/CgItemView";
import { CharacterCutinPanel } from "./panels/CharacterCutinPanel";
import { CurtainView } from "./panels/CurtainView";
import { DecisionView } from "./panels/DecisionView";
import { DialogView } from "./panels/DialogView";
import { ImageView } from "./panels/ImageView";
import { InterludePanel } from "./panels/InterludePanel";
import { LargeBackgroundView } from "./panels/LargeBackgroundView";
import { ShowItemCutinSlot } from "./panels/ShowItemCutinSlot";
import { ShowItemPhotoSlot } from "./panels/ShowItemPhotoSlot";
import { SpellStickerPanel } from "./panels/SpellStickerPanel";
import { StickerView } from "./panels/StickerView";
import { SubtitleView } from "./panels/SubtitleView";
import { TimerView } from "./panels/TimerView";
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
 * (setter `<CharZoom>b__1` 0x183ed95a0 lerp-drives both from one 0→1 float,
 * Ease.Linear), both absolute -- re-issuing the same zoom lands on the same
 * transform instead of stacking. Returns null when the command is not a zoom
 * or CharZoom would reject the pivot.
 */
function characterSlotZoom(
  state: CharacterRenderState,
  input: CharacterSlotInput,
): { from: CharacterSlotZoomState; to: CharacterSlotZoomState } | null {
  if (input.action !== "zoom") return null;
  // CharZoom validates the pivot first: x/y outside [0,1] => return null,
  // skipping the whole zoom (scale change included). An absent poszoom
  // defaults to (1,1), which is inside the valid range; the Web port keeps
  // treating an absent pivot as (0.5,0.5) ("no pivot move"). Every zoom in
  // the 2.7.61 corpus writes poszoom, so the native (1,1) default is
  // unobservable there.
  const zoom = input.posZoom;
  const pivotValid =
    !zoom || (zoom.x >= 0 && zoom.x <= 1 && zoom.y >= 0 && zoom.y <= 1);
  if (!pivotValid) return null;

  // `CharZoom(zoomPos.x, zoomPos.y, options.scale, duration)` always tweens
  // to `options.scale`, whose GetOrDefault falls back to 1.0 (0x183e4dcea)
  // -- a zoom without `scale` resets it.
  const toScaleX = isFiniteNumber(input.scaleX) ? input.scaleX : 1;
  const toScaleY = isFiniteNumber(input.scaleY) ? input.scaleY : 1;
  // anchoredPosition is not tweened, and every character prefab ships pivot
  // (0.5,0.5) / localScale 1 / sizeDelta = character.json size (verified on
  // avg_npc_2227_1, avg_4225_tanya_1, avg_npc_820_1), so the pivot point
  // stays where the resting rect was centred: the rect grows `scale`x
  // around the fixed point at zoomPos, and its centre lands at
  // `T + scale * (0.5 - zoomPos) * size` (Unity axes). The motion layer
  // instead scales around the rect's top-left corner, so the shift must
  // both move the scaled centre there and cancel that corner-origin growth:
  //   (0.5 - z) * scale * size - (scale - 1) * size / 2
  // (shiftY is stored in Unity's y-up and negated on apply). Tweening the
  // shift linearly makes the endpoints exact and leaves a small mid-tween
  // gap versus native's lerp(scale)*lerp(0.5-pivot) product curve.
  const pivotX = zoom?.x ?? 0.5;
  const pivotY = zoom?.y ?? 0.5;
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
      shiftX:
        (0.5 - pivotX) * toScaleX * state.width -
        ((toScaleX - 1) * state.width) / 2,
      shiftY:
        (0.5 - pivotY) * toScaleY * state.height +
        ((toScaleY - 1) * state.height) / 2,
    },
  };
}

/**
 * `_GenPosition`'s per-slot term: it cancels each slot's own offset from the
 * panel centre so a horizontal enter starts at the same absolute x everywhere.
 */
const SLOT_ENTER_COMPENSATION: Record<string, number> = { l: 200, r: -200 };

/**
 * DOTween `Ease.OutCubic`, used by `AVGCharacterSlot.SetCharPos` and
 * `AVGCharacterSlot.MoveChar` (both `DOLocalMove(...).SetEase(Ease.OutCubic)`;
 * 2.7.81 MoveChar @ 0x184029e30, SetCharPos @ 0x18402a1e0), and the sequence
 * ease `AVGCharacterSlot.CharJump` chains on DOLocalJump. `easeOutQuad` below
 * is DOLocalJump's arc and y-displacement ease (2.7.81 DOLocalJump @
 * 0x184257a20; same formula as `dotweenDefaultEase` in core/DotweenEase).
 */
function easeOutCubic(progress: number): number {
  const remaining = 1 - progress;
  return 1 - remaining * remaining * remaining;
}

function easeOutQuad(progress: number): number {
  return 1 - (1 - progress) * (1 - progress);
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

/**
 * 对话框顶部/底部黑条用到的同一张渐变纹理（APK 中 `sprite_avg_cutscene`，
 * 4×310 RGBA，自上而下 alpha 0→1）。放在 `public/` 下由 Vite 直接服务，
 * 预加载由 preload.ts 把该 URL 加入预加载集来预热 pixi Assets 缓存。
 */

interface CharacterBuiltVisual extends Pick<
  CharacterArt,
  "width" | "height" | "pos"
> {
  sourceHeight: number;
  sourceWidth: number;
  visual: Container;
}

type CharacterSlot = "l" | "m" | "r";

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
  slot: CharacterSlot;
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

/**
 * Web/PIXI renderer for the AVG command surfaces. Each command method ports
 * the documented observable state and blocking boundaries, while containers,
 * filters, and browser timing are adaptations rather than a Unity scene port.
 * Command-specific native provenance is recorded at the behavior boundaries.
 */
export class PixiStoryRenderer implements StoryRenderer {
  private app: Application | null = null;
  private releaseClickGuard: (() => void) | null = null;
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
  private readonly characterArt = new CharacterArtLoader((key) =>
    this.textureForCharacterKey(key),
  );
  private readonly cutinLayer = this.layers.cutins;
  private readonly interludeLayer = new Container({
    label: "Channel_Container",
  });
  private readonly cutinPanel: CharacterCutinPanel;

  private readonly largeBackgroundView: LargeBackgroundView;
  private readonly largeImageView: LargeBackgroundView;
  private readonly imageView: ImageView;
  private readonly blockerView: BlockerView;
  private readonly curtainView: CurtainView;
  /**
   * Bundled nine-slice texture of the serialized `sprite_avg_showItem_photo`
   * photo frame (native scene asset; CDN and the PRTS mirror do not carry
   * it). Cached once like the blocker slide mask; on load failure the item
   * renders without the frame instead of blocking playback.
   */
  private showItemFrameTexture: Texture | null = null;
  private showItemFrameTextureFailed = false;
  /**
   * Dialog gradient texture, shared with DialogView and reused by the cutin
   * slot's `header` strip (`sprite_avg_cutscene` tinted black at 0.706).
   */
  private dialogFrameTexture: Texture | null = null;
  private dialogFrameTextureFailed = false;
  private readonly onWarning?: (detail: string) => void;
  private readonly sceneLayer = this.layers.scene;
  private readonly uiLayer = this.layers.ui;
  private readonly tweenRunner = new TweenRunner(() => Boolean(this.app));
  private readonly tweenUpdates = new Set<(deltaMs: number) => void>();
  private stopTweenUpdates: (() => void) | null = null;
  // 2791 runs DOTween.Update before AVGController._DoExecuteCommands polls
  // its blockers. Use the update phase for tweens whose completion the runtime
  // polls before rendering. Focusout uses TimeManager's frame tick in 2791.
  private readonly updatePhaseTweenRunner = new TweenRunner(
    () => Boolean(this.app),
    (advance) => this.subscribeTweenUpdate(advance),
  );
  private readonly videoPanel: VideoPanel;
  private readonly dialogView: DialogView;
  private readonly subtitleView: SubtitleView;
  private readonly decisionView: DecisionView;
  private readonly interludePanel: InterludePanel;
  private readonly animTextPanel: AnimTextPanel;
  private readonly avgDisplayPanel: AvgDisplayPanel;
  private readonly spellStickerPanel: SpellStickerPanel;
  private readonly sceneEffects: SceneEffectManager;
  private readonly cgItemView: CgItemView;

  private cameraShake?: {
    animation: ExecutionHandle;
    infinite: boolean;
    onComplete?: () => void;
  };
  private readonly stickerViews = new Map<string, StickerView>();
  private timerView: TimerView | null = null;

  constructor(
    context: Context,
    onWarning?: (detail: string) => void,
    now = browserAnimationClock.now,
  ) {
    this.context = context;
    this.onWarning = onWarning;
    this.blockerView = new BlockerView(
      this.layers.blocker,
      this.updatePhaseTweenRunner,
      onWarning,
    );
    this.curtainView = new CurtainView(
      this.layers.curtains,
      this.updatePhaseTweenRunner,
      onWarning,
    );
    this.videoPanel = new VideoPanel(
      this.uiLayer,
      this.updatePhaseTweenRunner,
      onWarning,
    );
    this.dialogView = new DialogView(this.uiLayer, onWarning, (...args) =>
      this.updatePhaseTweenRunner.run(...args),
    );
    this.subtitleView = new SubtitleView(this.uiLayer, {
      createTextStyle: (size, width) =>
        this.createOverlayTextStyle(size, width),
      layoutText: (text, x, width, alignment) =>
        this.layoutSubtitle(text, x, width, alignment),
      tween: (...args) => this.updatePhaseTweenRunner.run(...args),
    });
    this.decisionView = new DecisionView(this.uiLayer);
    // RunStory calls AVGCharacterCutinPanel.OnReset before its first command
    // (2791 @ 0x18416DD17). The controller is the first child of the slot parent.
    this.cutinLayer.addChild(this.interludeLayer);
    this.interludePanel = new InterludePanel(
      this.interludeLayer,
      (input) => this.textureForInterlude(input),
      (key, texture) =>
        this.nativeBackgroundRect(nativeBundleKey(key), texture, "texture"),
      ({ name, avatarCharacterKey, avatarExpression }) => {
        // Regular OnCutinBegin and OnCutinEnd never look up the avatar.
        if (avatarCharacterKey && avatarExpression)
          return this.loadCharacterArt(avatarCharacterKey, avatarExpression);
        const ref = resolveNativeCharacterRef(this.context.linkMap, name);
        if (ref.kind === "native_throws")
          throw new Error(
            `interlude avatar exceeds its sprite hub bounds: ${name}`,
          );
        return ref.kind === "found"
          ? this.loadCharacterArt(ref.selection.base, ref.selection.expression)
          : null;
      },
      this.updatePhaseTweenRunner,
      onWarning,
    );
    this.cutinPanel = new CharacterCutinPanel(
      this.cutinLayer,
      (input) => this.loadCharacterArt(input.characterKey, input.expression),
      (key) => this.textureForImageKey(key, "background", true),
      () => this.loadDialogFrameTexture(),
      this.updatePhaseTweenRunner,
    );
    this.animTextPanel = new AnimTextPanel(
      this.layers.animTexts,
      (...args) => this.updatePhaseTweenRunner.run(...args),
      onWarning,
    );
    this.avgDisplayPanel = new AvgDisplayPanel(
      {
        bgover: this.layers.avgDisplayBackground,
        cgover: this.layers.avgDisplayCg,
        charover: this.layers.avgDisplayCharacter,
      },
      (name) => this.textureForImageKey(name, "background"),
      (...args) => this.updatePhaseTweenRunner.run(...args),
      onWarning,
    );
    this.spellStickerPanel = new SpellStickerPanel(this.uiLayer, onWarning);
    this.sceneEffects = new SceneEffectManager(
      this.layers,
      (...args) => this.updatePhaseTweenRunner.run(...args),
      now,
    );
    this.imageView = new ImageView(
      this.layers.images,
      (key) => this.textureForImageKey(key, "image"),
      this.updatePhaseTweenRunner,
      this.sceneEffects,
    );
    this.largeBackgroundView = new LargeBackgroundView(
      this.layers.gridBackground,
      {
        bindFocusTargets: (targets) =>
          this.sceneEffects.setLargeBackgroundFocusTargets(targets),
        kind: "background",
        loadTexture: (key, kind) => this.textureForImageKey(key, kind),
        onWarning,
        tweens: this.updatePhaseTweenRunner,
      },
    );
    this.largeImageView = new LargeBackgroundView(this.layers.images, {
      kind: "image",
      loadTexture: (key, kind) => this.textureForImageKey(key, kind),
      tweens: this.updatePhaseTweenRunner,
    });
    this.cgItemView = new CgItemView(
      this.layers.cgItems,
      (key) => this.textureForImageKey(key, "image"),
      (...args) => this.updatePhaseTweenRunner.run(...args),
      onWarning,
      {
        disposed: (key, root) => this.sceneEffects.releaseCgItem(key, root),
        registered: (key, root) => this.sceneEffects.bindCgItem(key, root),
      },
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
    this.onFrameUpdate(({ deltaMs }) =>
      this.interludePanel.advanceTime(deltaMs),
    );
    // Decision options claim their own press (see ClickClaim): only a click
    // pressed on no interactive canvas object reaches the host's advance.
    this.releaseClickGuard = guardClaimedClicks(
      app.canvas,
      (clientX, clientY) => {
        const events = app.renderer.events;
        const point = new Point();
        events.mapPositionToPoint(point, clientX, clientY);
        return Boolean(events.rootBoundary.hitTest(point.x, point.y));
      },
    );
    this.watchDisplayResolution(host);

    await this.createUi();
    this.layers.attach(app.stage);
  }

  onFrameEnd(callback: () => void): () => void {
    const ticker = this.app?.ticker;
    if (!ticker) throw new Error("Story renderer is not mounted");
    // Pixi's TickerPlugin draws the scene at LOW. UTILITY runs after that draw.
    ticker.addOnce(callback, undefined, UPDATE_PRIORITY.UTILITY);
    return () => {
      if (this.app?.ticker === ticker) ticker.remove(callback);
    };
  }

  onFrameUpdate(
    callback: (frame: PlaybackFrame) => void,
    phase: "update" | "afterUpdate" = "update",
  ): () => void {
    const ticker = this.app?.ticker;
    if (!ticker) throw new Error("Story renderer is not mounted");
    // Unity's WaitUntil checks after component updates. Run it before LOW draws.
    const priority =
      phase === "afterUpdate"
        ? UPDATE_PRIORITY.NORMAL - 1
        : UPDATE_PRIORITY.NORMAL;
    const update = (tick: Ticker) =>
      callback({
        deltaMs: tick.elapsedMS,
        nowMs: tick.lastTime + tick.elapsedMS,
      });
    ticker.add(update, undefined, priority);
    return () => {
      if (this.app?.ticker === ticker) ticker.remove(update);
    };
  }

  private subscribeTweenUpdate(advance: (deltaMs: number) => void): () => void {
    this.tweenUpdates.add(advance);
    this.stopTweenUpdates ??= this.onFrameUpdate(({ deltaMs }) => {
      // TweenManager.Update (2791 @ 0x184467690) captures the upper bound
      // before walking active tweens. Tweens made by an OnComplete start
      // on the following update, even when Pixi is still walking listeners.
      for (const update of [...this.tweenUpdates]) update(deltaMs);
    });
    return () => {
      this.tweenUpdates.delete(advance);
      if (this.tweenUpdates.size === 0) {
        this.stopTweenUpdates?.();
        this.stopTweenUpdates = null;
      }
    };
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
    this.videoPanel.destroy();
    this.decisionView.destroy();
    this.cutinPanel.destroy();
    this.interludePanel.destroy();
    this.interludeLayer.destroy();
    this.animTextPanel.destroy();
    this.avgDisplayPanel.destroy();
    this.spellStickerPanel.destroy();
    for (const view of this.stickerViews.values()) view.destroy();
    this.stickerViews.clear();
    this.timerView?.destroy();
    this.timerView = null;
    this.cgItemView.destroy();
    this.largeBackgroundView.reset();
    this.largeImageView.clear();
    this.imageView.destroy();
    this.blockerView.reset();
    this.curtainView.reset();
    this.resetCameraEffects();
    this.backgroundRoot = null;
    this.backgroundSprite = null;
    this.backgroundTweenSessionId += 1;
    this.backgroundLayer.removeChildren();
    this.layers.showItems.removeChildren();
    for (const state of this.characterSlots.values())
      this.disposeCharacterState(state);
    this.characterSlots.clear();
    this.characterSlotSeqDeadlines.clear();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.resizeListener?.();
    this.resizeListener = null;
    this.resizeHost = null;
    this.releaseClickGuard?.();
    this.releaseClickGuard = null;
    this.stopTweenUpdates?.();
    this.stopTweenUpdates = null;
    const app = this.app;
    this.app = null;
    // Settle the runner's teardown callbacks before destroying the stage.
    const remainingTweens = [...this.tweenUpdates];
    this.tweenUpdates.clear();
    for (const update of remainingTweens) update(0);
    app?.destroy(true, { children: true });
    this.characterArt.destroy();
    this.dialogView.destroy();
    this.subtitleView.destroy();
  }

  playVideo(url: string, onEnd: () => void): void {
    this.videoPanel.play(url, onEnd);
  }

  setAnimText(input: AnimTextInput, onComplete?: () => void) {
    return this.animTextPanel.show(input, onComplete);
  }

  setAvgDisplay(input: AvgDisplayInput, onComplete?: () => void) {
    return this.avgDisplayPanel.display(input, onComplete);
  }

  clearAvgDisplays(): void {
    this.avgDisplayPanel.clear();
  }

  clearAnimTexts(): void {
    this.animTextPanel.clear();
  }

  stopVideo(fadeOutDelayMs?: number): void {
    this.videoPanel.stop(fadeOutDelayMs);
  }

  finishStickerTyping(id: string): boolean {
    return this.stickerViews.get(id)?.finishTyping() ?? false;
  }

  setDialogue(
    speaker: string,
    text: TypewriterText,
    layout?: DialogueLayout,
  ): void {
    this.dialogView.setDialogue(speaker, text, layout);
  }

  hideDialogue(): void {
    this.dialogView.hide();
  }

  finishDialogueCommand(): void {
    this.dialogView.restoreMessageWidth();
  }

  showDecision(
    options: string[],
    values: number[],
    disabled: boolean[],
    onSelect: (selection: DecisionSelection) => void,
  ): void {
    this.decisionView.show(options, values, disabled, onSelect);
  }

  settleDecision(): void {
    this.decisionView.clear();
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
    const sprite = createImageSprite(
      texture,
      input,
      this.nativeBackgroundRect(key, texture),
    );
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
    this.sceneEffects.setImageFocusTargets(
      "bg",
      root,
      fadeMs > 0 ? (previous ?? undefined) : undefined,
    );
    root.alpha = fadeMs > 0 ? 0 : 1;
    if (fadeMs <= 0) {
      previous?.removeFromParent();
      return;
    }
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = progress),
      () => {
        if (!previous) return;
        previous.removeFromParent();
        this.sceneEffects.releaseFixedFocusTarget(previous);
      },
    );
    if (input?.block) await run;
    else void run;
  }

  async clearBackground(fadeMs = 0, block = false): Promise<void> {
    this.backgroundTweenSessionId += 1;
    const root = this.backgroundRoot;
    this.backgroundRoot = null;
    this.backgroundSprite = null;
    this.sceneEffects.setImageFocusTargets(
      "bg",
      undefined,
      fadeMs > 0 ? (root ?? undefined) : undefined,
    );
    if (!root) return;
    if (fadeMs <= 0) {
      root.removeFromParent();
      return;
    }
    const startAlpha = root.alpha;
    const run = this.tween(
      fadeMs,
      (progress) => (root.alpha = startAlpha * (1 - progress)),
      () => {
        root.removeFromParent();
        this.sceneEffects.releaseFixedFocusTarget(root);
      },
    );
    if (block) await run;
    else void run;
  }

  /**
   * Port of `Torappu.AVG.AVGImagePanel._ExecuteImageTween`'s foreground
   * transform semantics (2.7.71 VA 0x183f055b0): From/To defaults read the
   * current transform, `duration <= 0` snaps to To, and the move + scale
   * DOTween pair shares one ease and loop count, so a single merged
   * interpolation is frame-equivalent. `ease` resolves the command's
   * GetEnum<Ease> value and `loop` maps SetLoops(2*!loop-1) to an infinite
   * Restart loop that replays from the From pose each cycle and never
   * completes (block is dropped upstream for loops). Browser interpolation
   * replaces the DOTween sequence.
   *
   * The zero-duration snap holds for loops too, though not via Complete:
   * `TweenManager.Complete` @ 0x1841f4830 refuses `loops == -1`, but
   * `Tweener.DoStartup` @ 0x184893ce0 forces `Ease.INTERNAL_Zero` on any
   * `duration <= 0` tween, so every update evaluates to the To pose.
   */
  async setBackgroundTween(input: BackgroundTweenInput): Promise<void> {
    // Native's `_foreImage` is a serialized panel field that always exists,
    // so the tween (and a blocking one's full-duration wait) would run even
    // with no background loaded; real scripts always precede this command
    // with `background`, so returning early here is a Web adaptation.
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
      {
        ease: dotweenEaseCurve(input.ease),
        // The step/done guards already mute a retired session; this also
        // stops its frames, which an infinite loop would otherwise request
        // for as long as the renderer lives.
        isAlive: () => this.isActiveBackground(root, sessionId),
        loops: input.loop ? -1 : 1,
      },
    );

    if (input.block) await run;
    else void run;
  }

  setGridBackground(
    input: GridBackgroundInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (this.app) return this.largeBackgroundView.show(input, onComplete);
  }

  clearGridBackground(
    fadeMs?: number,
    block?: boolean,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (fadeMs === undefined) this.largeBackgroundView.resetPanel();
    else if (this.app)
      return this.largeBackgroundView.clear(fadeMs, block, onComplete);
  }

  resetGridBackground(): void {
    this.largeBackgroundView.reset();
  }

  cancelGridBackgroundPreparation(): void {
    this.largeBackgroundView.cancelPreparation();
  }

  setLargeImage(input: GridBackgroundInput): ExecutionHandle | void {
    if (this.app) return this.largeImageView.show(input);
  }

  clearLargeImage(fadeMs?: number, block?: boolean): ExecutionHandle | void {
    return this.largeImageView.clear(fadeMs, block);
  }

  cancelLargeImagePreparation(): void {
    this.largeImageView.cancelPreparation();
  }

  setImage(
    key: string,
    input?: BackgroundInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.imageView.show(key, input, onComplete);
  }

  clearImage(
    fadeMs?: number,
    block?: boolean,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.imageView.clear(fadeMs, block, onComplete);
  }

  setImageTween(
    input: ImageTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.imageView.move(input, onComplete);
  }

  setImageRotate(
    input: ImageRotateInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.imageView.rotate(input, onComplete);
  }

  cancelImagePreparation(): void {
    this.imageView.cancelPreparation();
  }

  resetImage(): void {
    this.imageView.reset();
  }

  clearCharacterCutin(widgetId?: string): void {
    this.cutinPanel.clear(widgetId);
  }

  clearInterludes(): void {
    this.interludePanel.clearAll();
  }

  setInterlude(
    input: InterludeInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.interludePanel.run(input, onComplete);
  }

  /**
   * Native port: `Torappu.AVG.AVGCharacterCutinPanel` (build 2761 IDA review):
   * `GetExecutors` @ 0x183e48f70 registers `charactercutin` ->
   * `_ExecuteCharacterCutin` @ 0x183e49440, whose five widgetID/name branches
   * (show / SlotUpdate / hide) live in CharacterCutinPanel together with the
   * `AVGCharacterCutinSlot` Show/SlotUpdate/Hide geometry.
   */
  setCharacterCutin(
    input: CharacterCutinInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (!this.app) return;
    return this.cutinPanel.run(input, onComplete);
  }

  private loadCharacterArt(
    base: string | undefined,
    expression: string | undefined,
  ): CharacterArtLoad {
    if (!base || !expression) return null;
    const link = this.context.linkMap[base];
    if (!link) {
      this.onWarning?.(`missing character base: ${base}`);
      return null;
    }
    const portrait = describeCharacterPortrait(link, expression);
    if (!portrait) {
      this.onWarning?.(`invalid character expression: ${base}#${expression}`);
      return null;
    }
    return this.characterArt.load(portrait);
  }

  /** Loads the bundled photo-frame texture once; null after a failure. */
  private loadShowItemFrameTexture(): TextureLoad {
    this.showItemFrameTexture ??=
      getCachedTexture(SHOWITEM_PHOTO_FRAME_URL) ?? null;
    if (this.showItemFrameTexture || this.showItemFrameTextureFailed)
      return this.showItemFrameTexture;
    return Assets.load<Texture>(SHOWITEM_PHOTO_FRAME_URL).then(
      (texture) => (this.showItemFrameTexture = texture),
      () => {
        this.showItemFrameTextureFailed = true;
        this.onWarning?.("missing show item frame texture");
        return null;
      },
    );
  }

  /** Loads the shared dialog gradient once; null after a failure. */
  private loadDialogFrameTexture(): TextureLoad {
    this.dialogFrameTexture ??= getCachedTexture(DIALOG_FRAME_URL) ?? null;
    if (this.dialogFrameTexture || this.dialogFrameTextureFailed)
      return this.dialogFrameTexture;
    return Assets.load<Texture>(DIALOG_FRAME_URL).then(
      (texture) => (this.dialogFrameTexture = texture),
      () => {
        this.dialogFrameTextureFailed = true;
        this.onWarning?.("missing cut-in header texture");
        return null;
      },
    );
  }

  createShowItemSlot(style: string): StoryShowItemSlot | null {
    const host = {
      layer: this.layers.showItems,
      loadImage: (key: string) => this.textureForImageKey(key, "image"),
      tween: this.updatePhaseTweenRunner.run.bind(this.updatePhaseTweenRunner),
    };
    switch (style) {
      case "photo":
        return new ShowItemPhotoSlot({
          ...host,
          loadDecoration: () => this.loadShowItemFrameTexture(),
        });
      case "cutin":
        return new ShowItemCutinSlot({
          ...host,
          loadDecoration: () => this.loadDialogFrameTexture(),
        });
      default:
        return null;
    }
  }

  showCgItem(input: CgItemInput, onComplete?: () => void) {
    return this.cgItemView.show(input, onComplete);
  }

  clearCgItems(
    key?: string,
    fadeMs = 130,
    ease = "Linear",
    _block = false,
    onComplete?: () => void,
  ) {
    return this.cgItemView.hide(key, fadeMs, ease, onComplete);
  }

  resetCgItems(): void {
    this.cgItemView.clear();
  }

  shakeCgItem(input: CgItemShakeInput, onComplete?: () => void) {
    return this.cgItemView.shake(input, onComplete);
  }

  stopCgItemShakes(key?: string): void {
    this.cgItemView.stopShakes(key);
  }

  setLargeBackgroundTween(
    input: LargeBackgroundTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.largeBackgroundView.move(input, onComplete);
  }

  setLargeImageTween(input: LargeBackgroundTweenInput): ExecutionHandle | void {
    return this.largeImageView.move(input);
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

    const {
      height: sizeY,
      pos,
      sourceHeight,
      sourceWidth,
      visual,
      width: sizeX,
    } = built;

    // Match legacy char layout semantics in 1280x720 space.
    const targetX = slotBaseX[slot] - sizeX / 2 + pos.x;
    const targetY = STORY_HEIGHT - sizeY / 2 - pos.y;
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
    // AVGCharacterSlot.Set (2791 @ 0x184237BC0) swaps holders on key changes.
    this.sceneEffects.setImageFocusTargets(
      slot,
      visual,
      imageFadeMs > 0 ? previous?.visual : undefined,
      !previous ||
        (previous.nativeKey ?? previous.fadeIdentity) !==
          (input.nativeKey ?? fadeIdentity),
    );
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
          if (visual.destroyed) return;
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
        randomness: input.randomness ?? 10,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        slot,
        stop: Boolean(input.stop),
        times: input.times ?? 0,
        type: "shake",
        xOffset: 0,
        yOffset: 0,
      });
    }

    if (input.action === "jump")
      this.startJumpAction(
        state,
        Math.max(0, input.power ?? 0),
        input.times ?? 0,
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
   * move/jump/shake/zoom/exit handlers (build 2761). Browser tween sampling
   * adapts DOTween, but keeps the per-action state and the completion
   * boundary: every branch funnels through `_AddFinishCommand`, so a blocking
   * command awaits the full native tween duration (shake included, and jump's
   * move+bounce sequence, not just the move segment).
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
        // Native CharJump builds one DOLocalJump Sequence of total durationMs
        // and blocks on the whole sequence. Inside it x is Linear, the y
        // displacement is DOVirtual.EasedValue(..., Ease.OutQuad) over the
        // arc tween's elapsed percentage (`<DOLocalJump>b__7` @ 0x184265320),
        // and CharJump's SetEase(OutCubic) warps the whole sequence timeline
        // (`Sequence.DoApplyTween` @ 0x1842525c0 evaluates the sequence's own
        // ease before ApplyInternalCycle), so every axis sees OutCubic time.
        const moveRun = this.startMoveAction(
          state,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          easeOutCubic,
          (progress) => easeOutQuad(easeOutCubic(progress)),
        );
        const jumpRun = this.startJumpAction(
          state,
          input.power,
          input.times,
          input.durationMs,
        );
        if (input.block && input.durationMs > 0) {
          await Promise.all([moveRun, jumpRun]);
        }
        return;
      }
      case "shake": {
        // Native CharShake returns the DOShakePosition waypoint tween of
        // durationMs and _AddFinishCommand blocks on it; the runtime already
        // degenerated durationMs<=0 to a move, so the tween always exists
        // here. `stop` is a web extension with no tween to wait for.
        const shakeRun = this.startShakeAction(state, input);
        if (input.block && !input.stop) await shakeRun;
        return;
      }
      case "zoom": {
        await this.runScaleAction(
          state,
          input.scaleX,
          input.scaleY,
          input.pivot,
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
          input.absolutePosition,
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
      this.sceneEffects.setImageFocusTargets(
        normalized,
        undefined,
        fadeMs > 0 ? state.visual : undefined,
      );
      if (fadeMs > 0)
        await this.fadeOutAndRemove(state.root, fadeMs, () =>
          this.disposeCharacterState(state),
        );
      else this.disposeCharacterState(state);
      return;
    }

    const states = [...this.characterSlots.values()];
    this.characterSlots.clear();
    for (const state of states) {
      this.sceneEffects.setImageFocusTargets(
        state.slot,
        undefined,
        fadeMs > 0 ? state.visual : undefined,
      );
    }
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

  clearCurtains(fadeMs = 0): void {
    this.curtainView.clear(fadeMs);
  }

  recycleCurtains(): void {
    this.curtainView.recycle();
  }

  resetCurtains(): void {
    this.curtainView.reset();
  }

  setCurtain(
    input: CurtainInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.curtainView.show(input, onComplete);
  }

  setBlocker(
    input: BlockerInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.blockerView.show(input, onComplete);
  }

  cancelBlockerPreparation(): void {
    this.blockerView.cancelPreparation();
  }

  resetBlocker(): void {
    this.blockerView.reset();
  }

  clearSubtitle(fadeMs = 0): Promise<void> | void {
    return this.subtitleView.clear(fadeMs);
  }

  /**
   * Native port: the `_ExecuteSticker` hide branch, which runs
   * `AVGStickerTextView.TryFinishType` before `HideSticker` — in-flight typing
   * completes instantly, so the full text is what fades out, not the
   * partially typed prefix.
   */
  clearSticker(id?: string, fadeMs = 0): void {
    if (!id) {
      this.clearStickers(fadeMs);
      return;
    }

    this.stickerViews.get(id)?.hide(fadeMs, true);
  }

  /**
   * Native port: `StickerPanel._RecycleStickers` (stickerclear and the skip
   * reset) calls `ResetStickerTransform` + `HideSticker(0)` on every view
   * without `TryFinishType`, so typing is not completed before the fade, and
   * then StickerPanel nulls `m_currentSticker`.
   */
  clearStickers(fadeMs = 0): void {
    for (const view of this.stickerViews.values()) view.recycle(fadeMs);
  }

  clearSpellStickers(): void {
    this.spellStickerPanel.clear();
  }

  hideSpellSticker(id: string): void {
    this.spellStickerPanel.hide(id);
  }

  clearTimerSticker(input?: TimerClearInput): void {
    this.timerView?.stop(input);
  }

  setCameraEffect(
    effect: "Colorinverse" | "Grayscale",
    amount: number,
    durationMs: number,
    block: boolean,
    keep: boolean,
    initialAmount?: number,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.sceneEffects.setCameraEffect(
      effect,
      amount,
      durationMs,
      block,
      keep,
      initialAmount,
      onComplete,
    );
  }

  resetCameraEffects(): void {
    // AVGCameraEffect.OnReset clears scene-root shakes and camera effects;
    // ShouldResetOnSkip (2791 @ 0x184186430) leaves them live at segment jumps.
    this.stopCameraShake();
    // AVGController.OnStoryCommitted (2791 @ 0x18416B750) disposes the
    // scene effect manager, which owns focus tweens and PostDisplay bindings.
    this.sceneEffects.reset();
  }

  setFocusOut(
    input: FocusOutInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.sceneEffects.setFocusOut(input, onComplete);
  }

  setFocusParam(input: FocusParamInput): void {
    this.sceneEffects.setFocusParam(input);
  }

  /**
   * Port of `Torappu.AVG.AVGCameraEffect._ExecuteCameraShake`: it moves the
   * scene root, not independent visual layers. The Vector3-strength
   * DOShakePosition overload runs the vectorBased branch of DOTween's shake
   * (`0x18424e2d0` inner overload on 2.7.81), where the per-axis
   * ClampMagnitude chain only biases direction — each waypoint keeps the
   * full |(xStrength, yStrength)| magnitude (see ShakePath). Sampling and
   * scheduling are a Web/PIXI adaptation of the same tween.
   */
  shakeCamera(
    input: CameraShakeInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    // _ExecuteCameraShake (2791 @ 0x1841874E0) kills the previous tween
    // first. An infinite tween does not run OnComplete, so a replacement
    // starts at the current offset. The stop branch also resets position.
    this.endCameraShake("force_end");
    if (input.stop) {
      this.sceneLayer.position.set(0, 0);
      return;
    }
    if (input.durationMs <= 0) return;

    const { x: startX, y: startY } = this.sceneLayer.position;
    const animation = createExecutionHandle(input.block);
    this.cameraShake = { animation, infinite: input.infinite, onComplete };
    const isCurrent = () => this.cameraShake?.animation === animation;
    const path = buildShakePath(input.durationMs, {
      ...input,
      vectorBased: true,
    });
    void this.updatePhaseTweenRunner.run(
      input.durationMs,
      (progress) => {
        const offset = sampleShakePath(path, progress);
        this.sceneLayer.position.set(startX + offset.x, startY + offset.y);
      },
      () => {
        if (isCurrent()) this.endCameraShake("complete");
      },
      { isAlive: isCurrent, loops: input.infinite ? -1 : 1 },
    );
    return animation;
  }

  setSubtitle(text: TypewriterText, layout?: OverlayTextLayout): void {
    this.subtitleView.render(text, layout);
  }

  /** StickerPanel supplies command inputs; each view owns its visual state. */
  setSticker(input: StickerInput): void {
    this.ensureStickerView(input.id).show(input);
  }

  setStickerTypeWriterDelay(id: string, delayMs: number): void {
    this.stickerViews.get(id)?.setTypeWriterDelay(delayMs);
  }

  setSpellSticker(input: SpellStickerInput): number | undefined {
    return this.spellStickerPanel.show(input);
  }

  stickerTween(input: StickerTweenInput): void {
    this.stickerViews.get(input.id)?.executeTween(input);
  }

  setTimerSticker(input: TimerStickerInput): void {
    // StickerPanel._ExcuteTimerSticker (2791 VA 0x1841e2910) lazily creates
    // and reuses a single AVGTimerView under the shared sticker parent.
    if (!this.timerView) {
      this.timerView = new TimerView({
        createOverlayTextStyle: (size, width) =>
          this.createOverlayTextStyle(size, width),
        onFrameUpdate: (update) => this.onFrameUpdate(update),
        tween: (...args) => this.updatePhaseTweenRunner.run(...args),
      });
      this.uiLayer.addChild(this.timerView.root);
    }
    this.timerView.show(input);
  }

  private async createUi(): Promise<void> {
    await this.dialogView.mount();
    this.subtitleView.mount();
  }

  /** Builds the scene holder from the same artwork used by cut-in slots. */
  private async buildCharacterVisual(
    characterKey: string,
    expression: string,
    blackStart?: number,
    blackEnd?: number,
  ): Promise<CharacterBuiltVisual | null> {
    const art = await this.loadCharacterArt(characterKey, expression);
    const mounted = art?.acquire();
    if (!art || !mounted) return null;

    const visual = new Container();
    const content = new Container();
    const sprite = new Sprite(mounted.texture);
    sprite.anchor.set(0, 0);
    if (mounted.release) sprite.once("destroyed", mounted.release);
    content.addChild(sprite);
    visual.addChild(content);

    const sourceWidth = mounted.texture.width;
    const sourceHeight = mounted.texture.height;
    this.applyCharacterBlackGradient(
      content,
      [sprite],
      sourceWidth,
      sourceHeight,
      blackStart,
      blackEnd,
    );
    return {
      height: art.height,
      pos: art.pos,
      sourceHeight,
      sourceWidth,
      visual,
      width: art.width,
    };
  }

  private async buildCharacterSlotState(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    current?: CharacterRenderState,
  ): Promise<CharacterRenderState | null> {
    if (!input.characterKey || !input.expression) return current ?? null;

    const built = await this.buildCharacterVisual(
      input.characterKey,
      input.expression,
      input.blackStart,
      input.blackEnd,
    );
    if (!built) return null;

    const slotBaseX: Record<string, number> = { l: 440, m: 640, r: 840 };
    const { height: sizeY, width: sizeX, pos } = built;
    const baseX = slotBaseX[slot] - sizeX / 2 + pos.x;
    const baseY = STORY_HEIGHT - sizeY / 2 - pos.y;
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
      this.sceneEffects.setImageFocusTargets(slot, built.visual);
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
    this.sceneEffects.setImageFocusTargets(
      slot,
      built.visual,
      fadeMs > 0 && previousVisual !== built.visual
        ? previousVisual
        : undefined,
    );
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
    for (const sprite of contentSprites) sprite.destroy();
    const darkened = new Sprite(texture);
    darkened.once("destroyed", () => texture.destroy(true));
    darkened.anchor.set(0, 0);
    content.addChild(darkened);
  }

  private discardCharacterVisual(visual: Container): void {
    this.sceneEffects.releaseFixedFocusTarget(visual);
    visual.destroy({ children: true });
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
    const active = new Set<string>(
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
    for (const child of [...state.rotationLayer.children])
      this.discardCharacterVisual(child);
    state.outgoingVisual = null;
  }

  private normalizeCharacterSlot(slot?: string): CharacterSlot {
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

  /**
   * Native port: AVGCharacterSlot.MoveChar (0x184029e30 on 2.7.81). Relative
   * displacement (cur + (x, y)); a zero fadeTime applies it instantly and
   * returns a null tween, which is why `block` only waits when there is a
   * tween to wait for. The tween runs `DOLocalMove(...).SetEase(Ease.OutCubic)`,
   * so the move branch eases with OutCubic; the jump branch passes its own
   * per-axis curves (see `runCharacterAction`'s jump case).
   */
  private startMoveAction(
    state: CharacterRenderState,
    xOffset: number,
    yOffset: number,
    durationMs: number,
    ease: EaseCurve,
    easeY: EaseCurve = ease,
  ): Promise<void> {
    const fromX = state.actionX;
    const fromY = state.actionY;
    const toX = fromX + xOffset;
    const toY = fromY + yOffset;
    const sessionId = ++state.transformSessionId;

    return this.tween(
      durationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = fromX + (toX - fromX) * ease(progress);
        state.actionY = fromY + (toY - fromY) * easeY(progress);
        this.updateCharacterState(state);
      },
      () => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        state.actionX = toX;
        state.actionY = toY;
        this.updateCharacterState(state);
      },
    );
  }

  private async runMoveAction(
    state: CharacterRenderState,
    xOffset: number,
    yOffset: number,
    durationMs: number,
    block: boolean,
  ): Promise<void> {
    const run = this.startMoveAction(
      state,
      xOffset,
      yOffset,
      durationMs,
      easeOutCubic,
    );
    if (block && durationMs > 0) await run;
  }

  /**
   * Native port: AVGCharacterSlot.CharZoom (0x183EB2B50) as reached from
   * `_ExecuteCharacterAction`. xpos/ypos are the [0,1] pivot of the character
   * image (runtime already rejected out-of-range values, which native turns
   * into a whole-command no-op); an absent pivot keeps the (0.5,0.5) center.
   * The pivot point stays where the resting rect was centred while localScale
   * tweens, so the motion layer gets the same shift compensation the
   * `charslot` zoom uses (see `characterSlotZoom`):
   *   (0.5 - pivot) * scale * size - (scale - 1) * size / 2
   * (shiftY is stored in Unity's y-up and negated on apply). Zoom runs on its
   * own session so it supersedes a running zoom without touching a move.
   */
  private async runScaleAction(
    state: CharacterRenderState,
    scaleX: number | undefined,
    scaleY: number | undefined,
    pivot: { x: number; y: number } | undefined,
    durationMs: number,
    block: boolean,
  ): Promise<void> {
    const fromScaleX = state.scaleX;
    const fromScaleY = state.scaleY;
    const fromShiftX = state.zoomShiftX;
    const fromShiftY = state.zoomShiftY;
    const toScaleX = isFiniteNumber(scaleX) ? scaleX : state.scaleX;
    const toScaleY = isFiniteNumber(scaleY) ? scaleY : state.scaleY;
    const pivotX = pivot?.x ?? 0.5;
    const pivotY = pivot?.y ?? 0.5;
    const toShiftX =
      (0.5 - pivotX) * toScaleX * state.width -
      ((toScaleX - 1) * state.width) / 2;
    const toShiftY =
      (0.5 - pivotY) * toScaleY * state.height +
      ((toScaleY - 1) * state.height) / 2;
    const sessionId = ++state.zoomSessionId;

    const run = this.tween(
      durationMs,
      (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.zoomSessionId !== sessionId
        )
          return;
        state.scaleX = fromScaleX + (toScaleX - fromScaleX) * progress;
        state.scaleY = fromScaleY + (toScaleY - fromScaleY) * progress;
        state.zoomShiftX = fromShiftX + (toShiftX - fromShiftX) * progress;
        state.zoomShiftY = fromShiftY + (toShiftY - fromShiftY) * progress;
        this.updateCharacterState(state);
      },
      () => {
        if (
          !this.isActiveCharacterState(state) ||
          state.zoomSessionId !== sessionId
        )
          return;
        state.scaleX = toScaleX;
        state.scaleY = toScaleY;
        state.zoomShiftX = toShiftX;
        state.zoomShiftY = toShiftY;
        this.updateCharacterState(state);
      },
    );

    // Native CharZoom has no instant branch: DOTween.To with a zero duration
    // still returns a tween (it completes on the first update), so a blocking
    // zoom stays blocking even at durationMs 0 — unlike move/exit whose
    // instant branch returns a null tween and never blocks.
    if (block) await run;
  }

  /**
   * Native port: CharacterPanel._ExecuteCharacterExit (0x183fd6f20 on 2.7.81)
   * → _GenExitPosition (0x183fd8980) → AVGCharacterSlot.SetCharPos
   * (0x18402a1e0). The exit table below is verbatim native: displacements
   * from each slot's rest anchor (l=440/m=640/r=840 in 1280x720 story space;
   * actionX/actionY are exactly that displacement). Both coordinates are set
   * absolutely, so a horizontal exit also snaps the vertical drift back to 0.
   * An unknown direction resolves to (0,0) — the rest anchor. An explicit
   * xpos/ypos pair replaces the table lookup but lands in the same
   * `_offset.localPosition` space. SetCharPos runs
   * `DOLocalMove(...).SetEase(Ease.OutCubic)` (same tween as the character
   * enter slide), so the exit path eases with OutCubic too.
   */
  private async runExitAction(
    state: CharacterRenderState,
    durationMs: number,
    direction: CharacterActionInput["direction"],
    position: { x: number; y: number } | undefined,
    block: boolean,
  ): Promise<void> {
    const exitTable: Record<string, Record<string, [number, number]>> = {
      l: { left: [-952, 0], right: [1352, 0] },
      m: { left: [-1152, 0], right: [1152, 0] },
      r: { left: [-1352, 0], right: [952, 0] },
    };
    const verticalTable: Record<string, [number, number]> = {
      down: [0, -1072],
      up: [0, 1072],
    };

    let toX: number;
    let toY: number;
    if (position) {
      // Both xpos & ypos present: SetCharPos(xpos, ypos) writes them straight
      // into `_offset.localPosition` (0x18402a1e0), the same slot-anchor
      // displacement the table rows use (actionY is up-positive).
      toX = position.x;
      toY = position.y;
    } else if (direction === "up" || direction === "down") {
      [toX, toY] = verticalTable[direction];
    } else if (direction === "left" || direction === "right") {
      [toX, toY] = (exitTable[state.slot] ?? exitTable.m)[direction] ?? [0, 0];
    } else {
      [toX, toY] = [0, 0];
    }

    const fromX = state.actionX;
    const fromY = state.actionY;
    const sessionId = ++state.transformSessionId;

    const run = this.tween(
      durationMs,
      (progress) => {
        if (!this.isActiveCharacterState(state, sessionId)) return;
        const eased = easeOutCubic(progress);
        state.actionX = fromX + (toX - fromX) * eased;
        state.actionY = fromY + (toY - fromY) * eased;
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

  /**
   * Native port: AVGCharacterSlot.CharJump (0x1840294f0 on 2.7.81) →
   * DOTween DOLocalJump (0x184257a20), which is a Sequence of three tweens
   * that all start together and last fadeTime in total:
   * - x: `DOLocalMove`-style tween, `SetEase(Ease.Linear)`, cur.x → cur.x+xpos
   *   over the whole duration (the horizontal move of the jump);
   * - y: relative `+jumpPower` tween of duration/(2*times) with
   *   `SetEase(Ease.OutQuad).SetLoops(2*times, LoopType.Yoyo)` — each jump
   *   rises OutQuad to jumpPower in half a jump period and replays the same
   *   eased arc backwards on the way down (`times < 1` clamps to 1);
   * - z: Linear tween to the unchanged z (a no-op here).
   * This method drives only the arc; the x/y displacement is the move tween
   * started next to it. CharJump chains `SetEase(Ease.OutCubic)` on the
   * returned Sequence, and `Sequence.DoApplyTween` (0x1842525c0) evaluates
   * that ease on the sequence position before ApplyInternalCycle hands it to
   * the nested tweens, so the yoyo samples OutCubic-warped time (the bounces
   * bunch up early). `_GenCharslotJump` reaches the same CharJump, so the
   * charslot jump shares this arc.
   */
  private startJumpAction(
    state: CharacterRenderState,
    power: number,
    times: number,
    durationMs: number,
  ): Promise<void> {
    const sessionId = ++state.jumpSessionId;
    state.jumpOffsetY = 0;
    this.updateCharacterState(state);

    // Native DOLocalJump always creates the y arc tween; a power of 0 is a
    // flat arc (visual no-op) and a negative power bounces downward, so only
    // a non-positive duration skips it (the runtime degenerates that case to
    // a move anyway — this is a defensive guard).
    if (durationMs <= 0) return Promise.resolve();

    const cycles = Math.max(1, times);
    const halfCycleProgress = 1 / (cycles * 2);
    return this.tween(
      durationMs,
      (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.jumpSessionId !== sessionId
        )
          return;
        // Position inside the 2*times yoyo cycle list; even cycles play the
        // OutQuad arc forward, odd cycles replay it backwards.
        const cyclePos =
          Math.min(easeOutCubic(progress), 1) / halfCycleProgress;
        const cycle = Math.floor(cyclePos);
        const frac = cyclePos - cycle;
        const arc = cycle % 2 === 0 ? easeOutQuad(frac) : easeOutQuad(1 - frac);
        state.jumpOffsetY = power * arc;
        this.updateCharacterState(state);
      },
      () => {
        if (
          !this.isActiveCharacterState(state) ||
          state.jumpSessionId !== sessionId
        )
          return;
        state.jumpOffsetY = 0;
        this.updateCharacterState(state);
      },
    );
  }

  /**
   * Native port: AVGCharacterSlot.CharShake (0x184029850 on 2.7.81) →
   * ShortcutExtensions.DOShakePosition float overload (0x18425cda0) →
   * DOTween.Shake float overload (0x18424eb10, expands strength to
   * (s, s, s)) → inner DOTween.Shake (0x18424e2d0) with
   * `ignoreZAxis = false`, `vectorBased = false`, Full randomness mode and
   * fadeOut — the non-vectorBased waypoint walk `buildShakePath` also ports
   * (vibrato = `times` per second, radius = power).
   * CharShake chains SetEase(OutCubic), but DOShakePosition marks the tween
   * `SpecialStartupMode.SetShake`, whose startup hook
   * (`SpecialPluginsUtils.SetShake` @ 0x18427f590) forces `easeType =
   * Linear` after SetPunch; Vector3ArrayPlugin then eases each segment on its
   * own (0x184282330), so every segment interpolates linearly.
   * X keeps Unity's right-positive axis; Y is stored negated because
   * motionLayer consumes screen-down-positive y.
   */
  private startShakeAction(
    state: CharacterRenderState,
    input: CharacterActionInput,
  ): Promise<void> {
    this.stopShakeAction(state);
    // `stop` is a web extension: native has no such key, so it only needs to
    // cancel above without producing a tween.
    if (input.stop) return Promise.resolve();

    const sessionId = state.shakeSessionId;
    const durationMs = Math.max(input.durationMs, 0);
    // Random.Range(-r, r) with a negative r still spans [-|r|, |r|].
    const path = buildShakePath(durationMs, {
      fadeOut: true,
      randomness: Math.abs(input.randomness),
      vectorBased: false,
      vibrato: input.times,
      xStrength: input.power,
      yStrength: input.power,
    });

    return this.tween(
      durationMs,
      (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.shakeSessionId !== sessionId
        )
          return;
        const offset = sampleShakePath(path, progress);
        state.shakeOffsetX = offset.x;
        state.shakeOffsetY = -offset.y;
        this.updateCharacterState(state);
      },
      () => {
        if (
          !this.isActiveCharacterState(state) ||
          state.shakeSessionId !== sessionId
        )
          return;
        state.shakeOffsetX = 0;
        state.shakeOffsetY = 0;
        this.updateCharacterState(state);
      },
    );
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

  stopCameraShake(): void {
    this.endCameraShake("force_end");
    this.sceneLayer.position.set(0, 0);
  }

  private endCameraShake(reason: "complete" | "force_end"): void {
    const shake = this.cameraShake;
    if (!shake) return;
    this.cameraShake = undefined;
    // TweenManager.Complete (2791 @ 0x184462630) skips infinite loops.
    if (reason === "force_end" && shake.infinite) {
      shake.animation.end(reason);
      return;
    }
    this.sceneLayer.position.set(0, 0);
    shake.animation.end();
    shake.onComplete?.();
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
      // panel_subtitle and the sticker / timer prefabs use the dialog font too.
      fontFamily: [DIALOG_FONT_FAMILY, "sans-serif"],
      fontSize,
      fontWeight: DIALOG_FONT_WEIGHT,
      whiteSpace: "pre-line",
      wordWrap: true,
      wordWrapWidth: widthPx,
    });
  }

  private ensureStickerView(id: string): StickerView {
    const existing = this.stickerViews.get(id);
    if (existing) return existing;
    const view = new StickerView({
      createOverlayTextStyle: (size, width) =>
        this.createOverlayTextStyle(size, width),
      layoutSubtitle: (text, x, width, alignment) =>
        this.layoutSubtitle(text, x, width, alignment),
      onFrameUpdate: (update) => this.onFrameUpdate(update),
      tween: (...args) => this.updatePhaseTweenRunner.run(...args),
    });
    this.stickerViews.set(id, view);
    this.uiLayer.addChild(view.root);
    return view;
  }

  private layoutSubtitle(
    subtitle: Text,
    baseX: number,
    widthPx: number,
    alignment: OverlayTextLayout["alignment"],
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

  /**
   * The sizeDelta `Image.SetNativeSize()` writes in the CN client:
   * `sprite.rect / ppu * 100` (canvas.referencePixelsPerUnit = 100), plus it
   * collapses the prefab's stretch anchors so sizeDelta becomes the real
   * rect. AVG background art ships a tuned per-asset ppu (80 / 100 /
   * 68.2464 / ...), so this is generally NOT the texture's pixel size --
   * e.g. bg_cher_1 (1024x576, ppu 68.2464) natively renders 1500.44x844,
   * a 17% centered overscan. Web PNGs are texture-sized with no ppu
   * metadata, so the per-key ppu comes from the `avg/background.json`
   * sidecar (context.backgroundPpuMap). Standalone 16:9 backgrounds missing
   * sidecar metadata fall back to 1280x720. Interlude elements keep their
   * texture size when the sidecar has no entry.
   */
  private nativeBackgroundRect(
    key: string,
    texture: Texture,
    fallback: "widescreen" | "texture" = "widescreen",
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
    if (
      fallback === "widescreen" &&
      Math.abs(width / height - STORY_WIDTH / STORY_HEIGHT) < 0.01
    ) {
      return [STORY_WIDTH, STORY_HEIGHT];
    }
    return [width, height];
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

  private textureForImageKey(
    key: string,
    kind: StoryAssetFamily,
    useBundlePath = kind === "cutin",
  ): TextureLoad {
    const rawUrl = resolveStoryAssetByKey(key, kind, useBundlePath);
    if (!rawUrl) {
      this.onWarning?.(`missing ${kind}: ${key}`);
      return null;
    }

    return this.textureForUrl(rawUrl, kind, key);
  }

  private textureForCharacterKey(key: string): TextureLoad {
    const rawUrl = resolveStoryCharacterAssetByKey(key);
    if (!rawUrl) {
      this.onWarning?.(`missing character: ${key}`);
      return null;
    }

    return this.textureForUrl(rawUrl, "character", key);
  }

  private textureForInterlude(input: InterludeInput): TextureLoad {
    // CutinImageElement.SetCutinElement (2791 @ 0x1814FC3D0) routes
    // uichar through Cutin/Characters and bg through AVG/Backgrounds.
    const kind = input.type === 2 ? "background" : "cutin";
    return this.textureForImageKey(input.name, kind, true);
  }

  private textureForUrl(
    rawUrl: string,
    kind: string,
    key: string,
  ): TextureLoad {
    const url = resolveAssetUrl(rawUrl);
    return (
      getCachedTexture(url) ??
      Assets.load<Texture>(url).catch(() => {
        this.onWarning?.(`failed ${kind}: ${key}`);
        return null;
      })
    );
  }

  private tween(
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
    options?: TweenRunOptions,
  ): Promise<void> {
    return this.tweenRunner.run(durationMs, step, done, options);
  }
}

export { DIALOG_FRAME_URL } from "../../assets";
