import {
  Application,
  Assets,
  Container,
  Point,
  type Sprite,
  type Text,
  TextStyle,
  type Texture,
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
import { guardClaimedClicks } from "./core/ClickClaim";
import { dotweenEaseCurve } from "./core/DotweenEase";
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
import { CharacterView } from "./panels/CharacterView";
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
  private readonly characterView: CharacterView;
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
      this.updatePhaseTweenRunner,
      (opacity) => this.layers.setVideoOpacity(opacity),
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
    this.sceneEffects = new SceneEffectManager(
      this.layers,
      (...args) => this.updatePhaseTweenRunner.run(...args),
      now,
    );
    this.characterView = new CharacterView(
      this.layers.characters,
      context.linkMap,
      (key) => this.textureForCharacterKey(key),
      this.updatePhaseTweenRunner,
      this.sceneEffects,
      onWarning,
    );
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
          return this.characterView.loadArt(
            avatarCharacterKey,
            avatarExpression,
          );
        const ref = resolveNativeCharacterRef(this.context.linkMap, name);
        if (ref.kind === "native_throws")
          throw new Error(
            `interlude avatar exceeds its sprite hub bounds: ${name}`,
          );
        return ref.kind === "found"
          ? this.characterView.loadArt(
              ref.selection.base,
              ref.selection.expression,
            )
          : null;
      },
      this.updatePhaseTweenRunner,
      onWarning,
    );
    this.cutinPanel = new CharacterCutinPanel(
      this.cutinLayer,
      (input) =>
        this.characterView.loadArt(input.characterKey, input.expression),
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
      backgroundAlpha: 0,
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
    app.canvas.style.position = "relative";
    this.videoPanel.mount(host);
    host.append(app.canvas);

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
    this.characterView.destroy();
    this.resetCameraEffects();
    this.backgroundRoot = null;
    this.backgroundSprite = null;
    this.backgroundTweenSessionId += 1;
    this.backgroundLayer.removeChildren();
    this.layers.showItems.removeChildren();
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

  setCharacter(input: CharacterSlotInput): ExecutionHandle | void {
    return this.characterView.show(input);
  }

  setCharacterSlot(input: CharacterSlotInput): ExecutionHandle | void {
    return this.characterView.updateSlot(input);
  }

  runCharacterAction(
    input: CharacterActionInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.characterView.runAction(input, onComplete);
  }

  clearCharacters(slot?: string, fadeMs?: number): ExecutionHandle | void {
    return this.characterView.clear(slot, fadeMs);
  }

  cancelCharacterPreparation(): void {
    this.characterView.cancelPreparation();
  }

  resetCharacters(): void {
    this.characterView.reset();
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
