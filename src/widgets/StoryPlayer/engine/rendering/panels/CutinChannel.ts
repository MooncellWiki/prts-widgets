import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type ObservablePoint,
} from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type InterludeInput } from "../../types";
import { CharacterSlotView } from "../characters/CharacterSlotView";
import {
  dotweenDefaultEase,
  dotweenEaseCurve,
  linearEase,
} from "../core/DotweenEase";
import { Sequence } from "../core/Sequence";

import {
  CLIP_SECONDS,
  applyDialogIntro,
  applyDirectionClip,
  applyHoriMaskOpen,
  applySquareShow,
  buildDeco,
  buildTemplate,
  layoutDialogChar,
  loadInterludeTextures,
  setDialogBackground,
  type DecoNodes,
  type DialogNodes,
  type InterludeTextureSet,
  type TemplateNodes,
} from "./interludeTemplates";

import type { ExecutionHandle } from "../../execution";
import type {
  CharacterArt,
  CharacterArtLoad,
} from "../characters/CharacterArt";
import type { TextureLoad } from "../core/TextureAsset";
import type {
  TweenHandle,
  TweenRunner,
  TweenStartOptions,
} from "../core/TweenRunner";

type Preparation = void | Promise<void>;
type Vec2 = { x: number; y: number };

type ElementArt =
  | { kind: "image"; texture: Texture | null }
  | { kind: "avatar"; art: CharacterArt | null };

/** CutinImageElement for _leftChar, _middleChar, _rightChar or _imgBg. */
interface ElementState {
  node: Container;
  sprite: Sprite;
  readChannel?: number;
}

interface ChannelView {
  /** `cutin_channel`:画布中心(anchoredPosition 恒 0),`_group` CanvasGroup。 */
  root: Container;
  /** `mask_container`:模板挂点。 */
  maskContainer: Container;
  /** stencil 读取层(root_bkg_* + root_char_*),整体由模板 mask 裁切。 */
  content: Container;
  /** `deco_container`。 */
  decoContainer: Container;
  bkgScale: Container;
  bkgPoz: Container;
  charScale: Container;
  charPoz: Container;
  elements: Map<string, ElementState>;
}

/** Per-allocation state, with references to the persistent channel view. */
interface ChannelState extends ChannelView {
  disposed: boolean;
  template: TemplateNodes | null;
  deco: DecoNodes | null;
  /** `CutinTemplateDecoView.m_cachedName`。 */
  decoName: string;
  /** 未知 maskid 的矩形回落(native 加载模板失败即无窗口;Web 兜底)。 */
  fallbackMask: Graphics | null;
  /** 回落路径的文字标签。 */
  label: Text | null;
  /** Cache-miss waits that would otherwise have completed before recycle. */
  assetWaits: Set<ExecutionHandle>;
  /** The most recent char, background and avatar sequences in CutinChannel. */
  elementSequences: Map<InterludeInput["type"], TweenHandle>;
  /** The single CutinAVGCharacterSlot owned by this channel. */
  avatar?: CharacterSlotView;
  avatarLoadId: number;
  /** AVGCharacterSlot.m_currentKey, set when the portrait loads. */
  avatarName: string;
  /** 回落矩形的尺寸。 */
  size: Vec2;
  fallbackScale: Vec2;
  /** 通道 animWrapper 上当前 direction clip。 */
  direction?: { name: "rin" | "lin"; tween: TweenHandle };
  /** dialog 入场 clip 的句柄(HideCutinMask 先 _KillDialogIntroTween)。 */
  dialogIntro?: TweenHandle;
  /** `CutinTemplate.m_cachedName`。 */
  cachedName: string;
  /** `m_dialogCharPosOffset` / `m_dialogCharScaleMul`(只在给出时覆盖)。 */
  dialogCharOffset: Vec2;
  dialogCharScale: Vec2;
  dialogCharRelease?: () => void;
}

/** 有 prefab 模板的 maskid(热更包 `avg/[uc]common.ab`)。 */
const KNOWN_MASK_IDS = new Set([
  "group_interclude_vertical_common",
  "group_interclude_square_common",
  "ui_cutin_mask_vertical",
  "ui_cutin_mask_horizon",
  "interlude_dialog_left",
  "interlude_dialog_right",
]);

// MathUtil.IsZero and GT(a, 0) use a tolerance of 1e-5 seconds.
const TWEEN_ZERO_MS = 0.01;
const avatarMoveEase = dotweenEaseCurve("OutCubic");
const BACKGROUND_ELEMENT_KEY = "\u0000bg";

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** DOTween reads the start value from the target when the tween first advances. */
function tweenAlpha(target: Container, to: number): (progress: number) => void {
  let from: number | undefined;
  return (progress) => {
    from ??= target.alpha;
    target.alpha = lerp(from, to, progress);
  };
}

function tweenPoint(
  target: ObservablePoint,
  toX: number,
  toY: number,
): (progress: number) => void {
  let fromX: number | undefined;
  let fromY: number | undefined;
  return (progress) => {
    fromX ??= target.x;
    fromY ??= target.y;
    target.set(lerp(fromX, toX, progress), lerp(fromY, toY, progress));
  };
}

/** `CutinTemplate._ShowEmptyImage`:空名或 `char_empty`(忽略大小写)。 */
function isEmptyName(name: string): boolean {
  return !name || name.toLowerCase() === "char_empty";
}

/**
 * CutinChannel._GetImgElementByParam (2791 @ 0x1814FA130). Type 2 uses
 * _imgBackground. Type 1 chooses a left, right or default middle image.
 */
function elementKeyFor(input: InterludeInput): string {
  if (input.type === 2) return BACKGROUND_ELEMENT_KEY;
  if (input.slot === "right" || input.slot === "r") return "r";
  if (input.slot === "left" || input.slot === "l") return "l";
  return "m";
}

/**
 * Port scope: `Torappu.UI.CutinChannel` / `CutinTemplate` (2791).
 *
 * - Channel layout (`cutin_channel` prefab): the channel sits at the canvas
 *   centre (`_ProcessChannel` zeroes anchoredPosition); `mask_container`,
 *   `root_bkg_*`/`root_char_*` and `deco_container` are siblings. `offset`
 *   only moves the template and the deco (ShowCutinMask), never the
 *   elements — the corpus bakes the offset into `pfrom/pto` itself.
 * - Channel begin (`OnCutinBegin` → `ShowCutinMask`, then `_TryPlayAnimation`)
 *   builds the `maskid` prefab tree (see `interludeTemplates.ts`), writes
 *   size (|size|² > ε) and offset once, renders the deco and `_emptyImg`, and
 *   owns completion: the sequence has a 1s `AppendInterval` floor, Fade/Both
 *   join a 3s DOFade of `_imgMask` (an invisible stencil writer, so only the
 *   timing is ported) and Scale/Both run an independent tsFrom→tsTo DOScale
 *   on `_scaleTrans`. ANIMATOR completes immediately only when the template
 *   has an `_animWrapper` (horizon); square's show clip is a
 *   `playAutomatically` Animation that runs for every style. Begin never
 *   reaches `_ProcessElement`; an unknown maskid completes immediately.
 * - Channel update (`OnCutinUpdate`): type 1/2/3 run `_ProcessElement`, then
 *   `UpdateCutinMask` re-checks `_emptyImg` on name changes only (empty names
 *   are ignored) and re-renders the deco: `char` text only when non-empty and
 *   changed, `switch` (default false) every time on the `TwoStateToggle` that
 *   flips the wave between `wave_active` (speaking) and `wave_stop`. `switch`
 *   never touches content visibility.
 * - Elements (`_ProcessElement` → `SetCutinElement`/`DoMove`/`DoScale`) run
 *   alpha/pos/scale tweens in parallel with their own durations. Earlier
 *   sequences keep running even when a later sequence writes the same element.
 * - `direction=rin/lin` (`_TryPlayAnimation`) plays the 2.083s channel clip on
 *   top; a blocking element update then waits for SkipStory because it never
 *   attaches a completion callback to its sequence.
 * - 2.7.61 `CutinTemplateDialogView` (`interlude_dialog_left/right`) overrides
 *   Show/Update/Hide without calling the base: no deco/`_emptyImg`/size/ts;
 *   type 2 refreshes `img_bg`, type 3/1 refresh `img_char` (type 3 from the AVG
 *   portrait, type 1 from Cutin/Characters) with `icharpos`/`icharscale`; the
 *   intro clip only plays for style 3, remapped to the command `duration`.
 * - Clear (`OnCutinEnd` → `HideCutinMask`): base templates fade the deco out
 *   (0.5s) and DOScale `_scaleTrans` from its current ratio to `tsto` (style 0)
 *   or wait the `_imgMask` fade (other styles); dialogs fade the group to
 *   `ato` over `aduration` (0.5s default). OnRecycle kills the sequence
 *   currently stored for each element type. Earlier sequences can still
 *   write to pooled image elements.
 *
 * Web adaptations: stencil channels are PIXI Graphics masks; unknown maskids
 * fall back to the legacy plain rectangle; a dialog displays its own
 * portrait while type 1 runs the channel element sequence. The regular
 * type 3 branch uses the prefab's bottom anchor and the portrait hub rect.
 */
export class CutinChannel {
  private readonly view: ChannelView = {
    root: new Container(),
    content: new Container(),
    maskContainer: new Container(),
    decoContainer: new Container(),
    bkgScale: new Container(),
    bkgPoz: new Container(),
    charScale: new Container(),
    charPoz: new Container(),
    elements: new Map(),
  };
  private state?: ChannelState;
  private recycled = false;

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: (input: InterludeInput) => TextureLoad,
    private readonly nativeBackgroundRect: (
      key: string,
      texture: Texture,
    ) => readonly [number, number],
    private readonly loadAvatar: (input: InterludeInput) => CharacterArtLoad,
    private readonly tweens: Pick<
      TweenRunner,
      "start" | "killTarget" | "afterUpdate"
    >,
    private readonly onWarning?: (detail: string) => void,
  ) {
    const {
      bkgScale,
      bkgPoz,
      charScale,
      charPoz,
      content,
      maskContainer,
      decoContainer,
      root,
    } = this.view;
    bkgScale.addChild(bkgPoz);
    charScale.addChild(charPoz);
    content.addChild(bkgScale, charScale);
    root.addChild(maskContainer, content, decoContainer);
  }

  /** _ProcessChannel and OnCutinBegin (2791 @ 0x1814FBAD0 / 0x1814F9270). */
  allocate(input: InterludeInput): void {
    const { root, content, elements } = this.view;
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    root.scale.set(1);
    root.alpha = 1;
    // A recycled Image can already be active while Web mask textures load.
    content.visible = false;
    // Reused Images keep their stencil read channel until SetCutinElement.
    // Pixi clips locally, so a reader for another channel stays out of this mask.
    for (const element of elements.values())
      element.node.renderable = element.readChannel === input.channel;

    this.state = {
      ...this.view,
      disposed: false,
      template: null,
      deco: null,
      decoName: "",
      fallbackMask: null,
      label: null,
      assetWaits: new Set(),
      elementSequences: new Map(),
      avatarLoadId: 0,
      avatarName: "",
      size: { ...input.size },
      fallbackScale: { x: 1, y: 1 },
      cachedName: "",
      dialogCharOffset: { x: 0, y: 0 },
      dialogCharScale: { x: 1, y: 1 },
    };
    this.layer.addChild(root);
  }

  /** CutinChannel.OnRecycle (2791 @ 0x1814F9CD0). */
  recycle(): void {
    const state = this.state;
    if (!state) return;
    this.state = undefined;
    this.recycled = true;
    state.root.removeFromParent();
    // OnDisable stops the direction clip while retaining its sampled pose.
    state.direction?.tween.kill();
    // ClearElement (0x1814FC0C0) clears the Sprite and offset. An active
    // Unity Image with a null Sprite draws a solid quad at its retained rect.
    for (const { node, sprite } of state.elements.values()) {
      const { width, height } = sprite;
      sprite.texture = Texture.WHITE;
      sprite.setSize(width, height);
      node.position.set(0, 0);
    }
    for (const sequence of state.elementSequences.values()) sequence.kill();
    state.elementSequences.clear();
    for (const animation of state.assetWaits) animation.end("reset");
    state.assetWaits.clear();

    state.content.mask = null;
    const { avatar, maskContainer, decoContainer } = state;
    const retired = [
      ...maskContainer.removeChildren(),
      ...decoContainer.removeChildren(),
    ];
    avatar?.root.removeFromParent();
    // Only these objects belong to the retiring allocation. Its other
    // HideCutinMask tweens can still complete in this update.
    this.tweens.afterUpdate(() => {
      state.disposed = true;
      for (const node of retired)
        if (!node.destroyed) node.destroy({ children: true });
      avatar?.root.destroy({ children: true });
    });
  }

  destroy(): void {
    this.recycle();
    this.view.root.destroy({ children: true });
  }

  private activeState(): ChannelState {
    if (!this.state) throw new Error("CutinChannel is not allocated");
    return this.state;
  }

  private trackPreparation(
    state: ChannelState,
    preparation: Preparation,
    animation: ExecutionHandle,
    releaseOnRecycle: boolean,
  ): void {
    if (!preparation) return;
    if (releaseOnRecycle) state.assetWaits.add(animation);
    void preparation
      .catch((error: unknown) => {
        if (this.state === state) animation.fail(error);
      })
      .finally(() => state.assetWaits.delete(animation));
  }

  /** CutinChannel.OnCutinBegin (2791 @ 0x1814F9270). */
  begin(
    input: InterludeInput,
    animation: ExecutionHandle,
    complete: () => void,
  ): void {
    const state = this.activeState();
    const start = (textures?: InterludeTextureSet): Preparation => {
      if (this.state !== state) return;
      this.buildChannel(state, input, textures);
      const template = state.template;
      if (template?.dialog) {
        const dialog = template.dialog;
        // Seed the entry pose before the Web texture load can yield a frame.
        if (input.style === 3 && input.durationMs > TWEEN_ZERO_MS)
          applyDialogIntro(dialog, 0);
        const show = () => {
          if (this.state !== state) return;
          this.playDialogIntro(state, dialog, input, complete);
          this.playDirection(state, input);
        };
        const portrait = this.refreshDialog(state, dialog, input);
        return portrait ? portrait.then(show) : show();
      }

      let showMs = 0;
      if (template) {
        this.renderDeco(state, input);
        state.cachedName = input.name;
        if (template.emptyImage)
          template.emptyImage.visible = isEmptyName(input.name);
        showMs = this.showTemplate(state, template, input);
      } else {
        this.renderFallbackLabel(state, input);
        if (
          input.style === 0 &&
          (input.templateSizeTo.x > 0 || input.templateSizeTo.y > 0)
        )
          this.startScaleEntry(state, input);
      }
      // TryPlayAnimation runs after ShowCutinMask without gating begin.
      this.playDirection(state, input);
      if (input.block && showMs > 0)
        this.runTween(state, showMs, () => {}, { onComplete: complete });
      else complete();
    };

    const textures = KNOWN_MASK_IDS.has(input.maskId)
      ? loadInterludeTextures()
      : undefined;
    const preparation =
      textures instanceof Promise
        ? textures.then(start, (error: unknown) => {
            if (this.state !== state) return;
            this.onWarning?.(
              `interlude template load failed for ${input.maskId}: ${String(error)}`,
            );
            return start();
          })
        : start(textures);
    this.trackPreparation(state, preparation, animation, !input.block);
  }

  /** CutinChannel.OnCutinUpdate (2791 @ 0x1814F9820). */
  update(
    input: InterludeInput,
    animation: ExecutionHandle,
    complete: () => void,
  ): void {
    const state = this.activeState();
    const completesInline =
      state.template?.dialog != null && (input.type === 2 || input.type === 3);
    this.trackPreparation(
      state,
      this.updateView(state, input, complete),
      animation,
      !input.block || completesInline,
    );
  }

  private updateView(
    state: ChannelState,
    input: InterludeInput,
    complete: () => void,
  ): Preparation {
    const template = state.template;
    if (template?.dialog) {
      const dialog = template.dialog;
      if (input.type === 1) {
        // Type 1 still creates a channel element sequence. The dialog has
        // its own portrait, so keep the channel content hidden.
        return this.prepareAsset(
          state,
          input.name ? this.loadTexture(input) : null,
          (texture) => {
            this.processElement(
              state,
              input,
              { kind: "image", texture },
              complete,
            );
            this.refreshDialog(state, dialog, input, () => texture);
          },
        );
      }

      const finish = () => {
        // Only the consumed background/avatar update invokes cb inline.
        if (
          this.state === state &&
          (input.type === 2 || input.type === 3 || !input.block)
        )
          complete();
      };
      const preparation = this.refreshDialog(state, dialog, input);
      return preparation ? preparation.then(finish) : finish();
    }

    if (template) {
      if (this.cacheName(state, input.name) && template.emptyImage)
        template.emptyImage.visible = isEmptyName(input.name);
      this.renderDeco(state, input);
    } else {
      this.renderFallbackLabel(state, input);
    }

    // Type 0/unknown updates the template without calling completion.
    if (input.type < 1 || input.type > 3) {
      if (!input.block) complete();
      return;
    }
    if (input.type === 3) {
      const loadId = input.name ? ++state.avatarLoadId : state.avatarLoadId;
      return this.prepareAsset(
        state,
        input.name ? this.loadAvatar(input) : null,
        (art) => {
          if (input.name && state.avatarLoadId !== loadId) complete();
          else
            this.processElement(
              state,
              input,
              { kind: "avatar", art },
              complete,
            );
        },
      );
    }
    return this.prepareAsset(
      state,
      input.name ? this.loadTexture(input) : null,
      (texture) =>
        this.processElement(state, input, { kind: "image", texture }, complete),
    );
  }

  private buildChannel(
    state: ChannelState,
    input: InterludeInput,
    textures?: InterludeTextureSet,
  ): void {
    const { content, decoContainer, maskContainer } = state;
    const offsetX = input.offset.x;
    const offsetY = -input.offset.y;

    if (textures) {
      try {
        const template = buildTemplate(input.maskId, textures);
        if (template) {
          state.template = template;
          let anchorX = 0;
          if (template.anchor === "left") anchorX = -STORY_WIDTH / 2;
          else if (template.anchor === "right") anchorX = STORY_WIDTH / 2;
          template.root.position.set(anchorX + offsetX, offsetY);
          if (template.dialog) {
            content.visible = false;
            template.dialog.charImage.once("destroyed", () => {
              state.dialogCharRelease?.();
              state.dialogCharRelease = undefined;
            });
          } else {
            const size =
              input.size.x * input.size.x + input.size.y * input.size.y >= 1e-10
                ? input.size
                : template.defaultSize;
            template.resize(size.x, size.y);
            content.mask = template.maskGraphics;
            content.visible = true;
            const deco = buildDeco(input.maskId, textures);
            if (deco) {
              deco.root.position.set(offsetX, offsetY);
              decoContainer.addChild(deco.root);
              state.deco = deco;
            }
          }
          this.setScale(state, template.initialScale);
          maskContainer.addChild(template.root);
          return;
        }
      } catch (error) {
        this.onWarning?.(
          `interlude template build failed for ${input.maskId}: ${String(error)}`,
        );
      }
    }

    const fallback = new Graphics();
    fallback.position.set(offsetX, offsetY);
    maskContainer.addChild(fallback);
    content.mask = fallback;
    content.visible = true;
    state.fallbackMask = fallback;
    this.setScale(state, state.fallbackScale);
  }

  /**
   * Base `CutinTemplate.ShowCutinMask` timing and template visuals; returns the
   * completion floor of the show sequence in ms.
   */
  private showTemplate(
    state: ChannelState,
    template: TemplateNodes,
    input: InterludeInput,
  ): number {
    const style = input.style;
    const tsEntry = input.templateSizeTo.x > 0 || input.templateSizeTo.y > 0;
    if ((style === 0 || style === 2) && tsEntry)
      this.startScaleEntry(state, input);
    else if (style === 1 && template.hasImgMask)
      this.setScale(state, { x: 1, y: 1 });

    if (template.autoClip === "square_show") {
      const seconds = CLIP_SECONDS.squareShow;
      const nodes = {
        setBackShadowSize: template.setBackShadowSize,
        backShadowGroup: template.backShadowGroup,
        frameGroup: state.deco?.frameGroup ?? null,
        nameGroup: state.deco?.nameGroup ?? null,
        waveGroup: state.deco?.waveGroup ?? null,
      };
      applySquareShow(nodes, 0);
      this.runTween(state, seconds * 1000, (progress) => {
        applySquareShow(nodes, progress * seconds);
      });
    }

    if (style === 3 && template.animatorClip === "hori_mask_open") {
      const seconds = CLIP_SECONDS.horiMaskOpen;
      applyHoriMaskOpen(template.maskNode, 0);
      this.runTween(state, seconds * 1000, (progress) => {
        applyHoriMaskOpen(template.maskNode, progress * seconds);
      });
      return 0;
    }
    if ((style === 1 || style === 2) && template.hasImgMask) return 3000;
    return 1000;
  }

  /** Style Scale/Both: localScale = tsFrom, DOScale to tsTo (not gating). */
  private startScaleEntry(state: ChannelState, input: InterludeInput): void {
    this.setScale(state, input.templateSizeFrom);
    this.tweenScale(state, input);
  }

  private tweenScale(
    state: ChannelState,
    input: InterludeInput,
    onComplete?: () => void,
  ): void {
    const { x, y } = input.templateSizeTo;
    if (state.template) {
      // Native ShowCutinMask / HideCutinMask (2791 @ 0x181501750 /
      // 0x1815013A0) start independent DOScale tweens on the same transform.
      const target = state.template.scaleNode;
      this.runTween(
        state,
        input.templateSizeDurationMs,
        tweenPoint(target.scale, x, y),
        {
          deferZeroDuration: true,
          ease: dotweenDefaultEase,
          onComplete,
          target,
        },
      );
      return;
    }

    // The Web fallback rectangle replaces its previous scale tween.
    const target = state.fallbackMask ?? state.maskContainer;
    this.tweens.killTarget(target);
    const from = state.fallbackScale;
    this.runTween(
      state,
      input.templateSizeDurationMs,
      (progress) => {
        this.setScale(state, {
          x: lerp(from.x, x, progress),
          y: lerp(from.y, y, progress),
        });
      },
      {
        ease: dotweenDefaultEase,
        onComplete,
        target,
      },
    );
  }

  private setScale(state: ChannelState, scale: Vec2): void {
    if (state.template) {
      state.template.scaleNode.scale.set(scale.x, scale.y);
      return;
    }
    state.fallbackScale = { ...scale };
    const w = state.size.x * scale.x;
    const h = state.size.y * scale.y;
    state.fallbackMask
      ?.clear()
      .rect(-w / 2, -h / 2, w, h)
      .fill(0xff_ff_ff);
  }

  /** `CutinTemplate._CacheName`:空名不算变化;忽略大小写比较。 */
  private cacheName(state: ChannelState, name: string): boolean {
    if (!name) return false;
    const changed = state.cachedName.toLowerCase() !== name.toLowerCase();
    state.cachedName = name;
    return changed;
  }

  /** `CutinTemplateDecoView.Render`(ShowCutinMask 与每次 UpdateCutinMask)。 */
  private renderDeco(state: ChannelState, input: InterludeInput): void {
    const deco = state.deco;
    if (!deco) return;
    if (deco.label && input.charName && input.charName !== state.decoName) {
      deco.label.text = input.charName;
      state.decoName = input.charName;
    }
    deco.setSwitch(input.switchOn);
  }

  /** 回落路径(无模板、无 deco)沿用旧的文字标签;空 `char` 保留旧文字。 */
  private renderFallbackLabel(
    state: ChannelState,
    input: InterludeInput,
  ): void {
    if (!input.charName) return;
    if (!state.label) {
      const label = new Text({
        style: new TextStyle({ fill: 0xff_ff_ff, fontSize: 24 }),
        text: input.charName,
      });
      label.label = "interlude-char";
      label.anchor.set(0.5);
      if (state.fallbackMask)
        label.position.copyFrom(state.fallbackMask.position);
      state.decoContainer.addChild(label);
      state.label = label;
    }
    state.label.text = input.charName;
  }

  private ensureElement(
    state: ChannelState,
    key: string,
    type: number,
  ): ElementState {
    const existing = state.elements.get(key);
    if (existing) return existing;
    const node = new Container();
    const sprite = new Sprite();
    sprite.anchor.set(0.5);
    node.addChild(sprite);
    const element: ElementState = { node, sprite };
    // Inactive until SetCutinElement assigns a sprite.
    node.visible = false;
    // The prefab's right slot starts at (-140, 63). OnRecycle
    // (2791 @ 0x1814F9CD0) zeroes its offset even if it never held a sprite.
    if (key === "r" && !this.recycled) node.position.set(-140, -63);
    (type === 2 ? state.bkgPoz : state.charPoz).addChild(node);
    state.elements.set(key, element);
    return element;
  }

  /** CutinChannel._ProcessElement (2791 @ 0x1814FA570). */
  private processElement(
    state: ChannelState,
    input: InterludeInput,
    resource: ElementArt,
    complete: () => void,
  ): void {
    let root: Container;
    let offset: Container;
    let alphaTarget: Container | null = null;
    const isAvatar = resource.kind === "avatar";
    const from = Math.max(input.alphaFrom, 0);
    const to = input.alphaTo >= 0 ? input.alphaTo : 1;
    if (isAvatar) {
      // CutinAVGCharacterSlot (2791 @ 0x1814F8E50 / 0x1814F8C20 /
      // 0x1814F8D20). The cutin_charslot prefab is anchored at the canvas
      // bottom. Move targets _offset and scale targets the slot transform.
      const avatar = (state.avatar ??= new CharacterSlotView(
        state.charPoz,
        0,
        STORY_HEIGHT / 2,
      ));
      root = avatar.root;
      offset = avatar.offset;
      if (input.name) {
        // The normal SetCutinElement branch passes resetOffsetPos=true.
        // _SlotSetCharInternal (2791 @ 0x18423A040) preserves the offset
        // when the previous key is char_empty.
        if (state.avatarName.toLowerCase() !== "char_empty")
          offset.position.set(0, 0);
        const { front, isAlive, outgoing } = avatar.swap(resource.art, from);
        state.avatarName = front ? input.name : "";
        alphaTarget = front;
        // The back Image fade is independent of the element sequence.
        if (outgoing)
          this.runTween(state, input.alphaDurationMs, outgoing.update, {
            deferZeroDuration: true,
            ease: linearEase,
            isAlive,
            onComplete: outgoing.finish,
          });
      }
    } else {
      const element = this.ensureElement(
        state,
        elementKeyFor(input),
        input.type,
      );
      root = offset = element.node;
      if (input.name) {
        // CutinImageElement.SetCutinElement (2791 @ 0x1814FC3D0) assigns
        // a missing sprite to the image and still sets up the alpha tween.
        element.sprite.texture = resource.texture ?? Texture.EMPTY;
        if (resource.texture) {
          // Image.SetNativeSize applies the background's PPU to the image
          // rect. DoScale applies the script's scale to the outer element.
          const [width, height] =
            input.type === 2
              ? this.nativeBackgroundRect(input.name, resource.texture)
              : [resource.texture.width, resource.texture.height];
          element.sprite.setSize(width, height);
        }
        element.readChannel = input.channel;
        root.renderable = true;
        root.visible = true;
        alphaTarget = root;
      }
    }
    // OnCutinUpdate (2791 @ 0x1814F9820) stores the new sequence even
    // when it has no tracks. OnRecycle can kill only the stored sequence.
    const sequence = new Sequence((durationMs, update, done, options) => {
      const handle = this.tweens.start(durationMs, update, {
        ...options,
        onComplete: done,
      });
      state.elementSequences.set(input.type, handle);
      return handle.completion;
    });

    // SetCutinElement sets the sprite and the start value. The native
    // sequence appends its alpha tween and joins the position/scale tweens.
    // DOKill(element) leaves the child tweens in earlier sequences active.
    if (input.name && (!alphaTarget || (!isAvatar && !resource.texture)))
      this.onWarning?.(`interlude element asset is missing: ${input.name}`);
    if (alphaTarget) {
      // _GenForeImageTween uses the AVGCharacterSlot prefab's Linear ease
      // even at zero duration. CutinImageElement uses the DOTween default.
      if (isAvatar || input.alphaDurationMs > TWEEN_ZERO_MS) {
        alphaTarget.alpha = from;
        sequence.append({
          durationMs: input.alphaDurationMs,
          ease: isAvatar ? linearEase : dotweenDefaultEase,
          update: tweenAlpha(alphaTarget, to),
        });
      } else {
        alphaTarget.alpha = to;
      }
    }

    if (input.positionFrom && input.positionTo) {
      const from = input.positionFrom;
      const to = input.positionTo;
      // SlotMoveChar (2791 @ 0x1842389E0) applies a near-zero move inline.
      if (isAvatar && Math.abs(input.durationMs) <= TWEEN_ZERO_MS) {
        offset.position.set(to.x, -to.y);
      } else {
        offset.position.set(from.x, -from.y);
        sequence.join({
          durationMs: input.durationMs,
          ease: isAvatar ? avatarMoveEase : dotweenDefaultEase,
          update: tweenPoint(offset.position, to.x, -to.y),
        });
      }
    }
    if (input.scaleFrom && input.scaleTo) {
      const from = input.scaleFrom;
      const to = input.scaleTo;
      root.scale.set(from.x, from.y);
      sequence.join({
        durationMs: input.scaleDurationMs,
        ease: dotweenDefaultEase,
        update: tweenPoint(root.scale, to.x, to.y),
      });
    }

    // 2791 enables DOTween AutoPlay.All. The element sequence plays alongside
    // the direction clip, and _ProcessElement omits OnComplete in that branch.
    const playsDirection = this.playDirection(state, input);
    const onComplete = input.block && !playsDirection ? complete : undefined;
    // Sequence.DoStartup @ 0x18442C6F0 takes an empty sequence with OnComplete.
    void sequence.play({
      deferZeroDuration: true,
      isAlive: () => !root.destroyed,
      onComplete,
    });
    if (!input.block) complete();
  }

  /** TryPlayAnimation @ 0x1814FABE0 restarts a direction clip. */
  private playDirection(state: ChannelState, input: InterludeInput): boolean {
    const direction = input.direction;
    if (this.state !== state || (direction !== "rin" && direction !== "lin"))
      return false;
    const nodes = {
      alphaTarget: state.root,
      bkgScale: state.bkgScale,
      bkgPoz: state.bkgPoz,
      charScale: state.charScale,
      charPoz: state.charPoz,
    };
    // SampleClipAtBegin still runs for a playing clip. Play declines to
    // restart that state in _SetupOnAnimationStart (2791 @ 0x181511CB0).
    applyDirectionClip(nodes, direction, 0);
    const current = state.direction;
    if (current?.name === direction && current.tween.endReason === undefined)
      return true;
    current?.tween.kill();
    const seconds = CLIP_SECONDS.direction;
    state.direction = {
      name: direction,
      tween: this.runTween(state, seconds * 1000, (progress) =>
        applyDirectionClip(nodes, direction, progress * seconds),
      ),
    };
    return true;
  }

  /** CutinTemplateDialogView._PlayDialogIntro remaps clip time to duration. */
  private playDialogIntro(
    state: ChannelState,
    dialog: DialogNodes,
    input: InterludeInput,
    complete: () => void,
  ): void {
    if (input.style !== 3) {
      complete();
      return;
    }
    const seconds = dialog.right
      ? CLIP_SECONDS.dialogIntroRight
      : CLIP_SECONDS.dialogIntroLeft;
    // _PlayDialogIntro (2791 @ 0x1814FFB50) samples the end pose
    // when AVGUtils.NeedSkipAnimation considers the duration zero.
    if (input.durationMs <= TWEEN_ZERO_MS) {
      applyDialogIntro(dialog, seconds);
      complete();
      return;
    }
    state.dialogIntro = this.runTween(
      state,
      input.durationMs,
      (progress) => applyDialogIntro(dialog, progress * seconds),
      { onComplete: input.block ? complete : undefined },
    );
    if (!input.block) complete();
  }

  /** CutinTemplateDialogView._RefreshDialogBackground / _RefreshDialogChar. */
  private refreshDialog(
    state: ChannelState,
    dialog: DialogNodes,
    input: InterludeInput,
    loadTexture = () => this.loadTexture(input),
  ): Preparation {
    if (input.type === 2) {
      if (isEmptyName(input.name)) {
        setDialogBackground(dialog, null);
        return;
      }
      return this.prepareAsset(state, loadTexture(), (texture) => {
        if (texture) setDialogBackground(dialog, texture);
        else
          this.onWarning?.(
            `interlude dialog background is missing: ${input.name}`,
          );
      });
    }
    if (input.type !== 3 && input.type !== 1) return;

    if (input.dialogCharPos)
      state.dialogCharOffset = { ...input.dialogCharPos };
    if (input.dialogCharScale)
      state.dialogCharScale = { ...input.dialogCharScale };
    const image = dialog.charImage;
    const layoutChar = () => {
      if (image.visible)
        layoutDialogChar(dialog, state.dialogCharOffset, state.dialogCharScale);
    };
    if (!this.cacheName(state, input.name)) {
      layoutChar();
      return;
    }

    const loadId = ++state.avatarLoadId;
    const setPortrait = (texture: Texture | null, release?: () => void) => {
      image.texture = texture ?? Texture.EMPTY;
      image.visible = texture !== null;
      state.dialogCharRelease?.();
      state.dialogCharRelease = release;
      layoutChar();
    };
    if (isEmptyName(input.name)) {
      setPortrait(null);
      return;
    }
    // 2791 CutinTemplateDialogView._LoadAvgPortrait (0x1814FEE50) loads
    // the same hub layers as AVGCharacterSlot. img_char uses its prefab rect.
    const portrait = input.type === 3 ? this.loadAvatar(input) : loadTexture();
    return this.prepareAsset<Texture | CharacterArt>(state, portrait, (art) => {
      if (state.avatarLoadId !== loadId) return;
      const mounted =
        art instanceof Texture
          ? { texture: art, release: undefined }
          : art?.acquire();
      setPortrait(mounted?.texture ?? null, mounted?.release);
      if (!mounted)
        this.onWarning?.(`interlude dialog avatar is missing: ${input.name}`);
    });
  }

  private prepareAsset<T>(
    state: ChannelState,
    asset: T | null | Promise<T | null>,
    use: (asset: T | null) => void,
  ): Preparation {
    const apply = (resolved: T | null) => {
      if (this.state === state) use(resolved);
    };
    return asset instanceof Promise
      ? asset.then(apply, () => apply(null))
      : apply(asset);
  }

  /** CutinChannel.OnCutinEnd -> HideCutinMask. */
  end(input: InterludeInput, done: (fromTween: boolean) => void): void {
    const state = this.activeState();
    const template = state.template;
    // OnCutinEnd (2791 @ 0x1814F9650) calls back inline without a
    // template. Release the channel before the next command can reuse its ID.
    if (!template) {
      done(false);
      return;
    }

    const finish = (fromTween: boolean) => {
      // _HideOncomplete (2791 @ 0x181502120) schedules destruction of the
      // deco before calling the controller's channel completion callback.
      const deco = state.deco;
      if (deco) {
        this.tweens.afterUpdate(() => {
          if (state.deco !== deco) return;
          state.deco = null;
          this.tweens.killTarget(deco.root);
          if (!deco.root.destroyed) deco.root.destroy({ children: true });
        });
      }
      done(fromTween);
    };
    const onComplete = () => finish(true);

    if (template.dialog) {
      const group = template.dialog.group;
      // CutinTemplateDialogView.HideCutinMask (2791 @ 0x1814FD2C0) kills
      // the intro and the previous fade before starting a new one.
      state.dialogIntro?.kill();
      this.tweens.killTarget(group);
      const to = input.alphaTo >= 0 ? input.alphaTo : 0;
      const durationMs =
        input.alphaDurationMs > 0 ? input.alphaDurationMs : 500;
      this.runTween(state, durationMs, tweenAlpha(group, to), {
        ease: dotweenDefaultEase,
        onComplete,
        target: group,
      });
      return;
    }

    if (state.deco) {
      this.runTween(state, 500, tweenAlpha(state.deco.root, 0), {
        ease: dotweenDefaultEase,
        target: state.deco.root,
      });
    }
    if (input.style === 0) {
      this.tweenScale(state, input, onComplete);
      return;
    }
    if (input.style === 2) this.tweenScale(state, input);
    if (template.hasImgMask) {
      this.runTween(state, input.alphaDurationMs, () => {}, {
        deferZeroDuration: true,
        onComplete,
        target: template.maskNode,
      });
    } else finish(false);
  }

  private runTween(
    state: ChannelState,
    durationMs: number,
    update: (progress: number) => void,
    options?: TweenStartOptions,
  ): TweenHandle {
    return this.tweens.start(durationMs, update, {
      ...options,
      isAlive: () =>
        !state.root.destroyed &&
        !state.disposed &&
        options?.isAlive?.() !== false,
    });
  }
}
