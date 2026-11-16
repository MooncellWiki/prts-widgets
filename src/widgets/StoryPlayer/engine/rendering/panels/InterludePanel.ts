import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
  type ObservablePoint,
} from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
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
}

interface ChannelState {
  /** `cutin_channel`:画布中心(anchoredPosition 恒 0),`_group` CanvasGroup。 */
  root: Container;
  /** `mask_container`:模板挂点。 */
  maskContainer: Container;
  /** stencil 读取层(root_bkg_* + root_char_*),整体由模板 mask 裁切。 */
  content: Container;
  bkgScale: Container;
  bkgPoz: Container;
  charScale: Container;
  charPoz: Container;
  /** `deco_container`。 */
  decoContainer: Container;
  template: TemplateNodes | null;
  deco: DecoNodes | null;
  /** `CutinTemplateDecoView.m_cachedName`。 */
  decoName: string;
  /** 未知 maskid 的矩形回落(native 加载模板失败即无窗口;Web 兜底)。 */
  fallbackMask: Graphics | null;
  /** 回落路径的文字标签。 */
  label: Text | null;
  elements: Map<string, ElementState>;
  /** The single CutinAVGCharacterSlot owned by this channel. */
  avatar?: CharacterSlotView;
  avatarLoadId: number;
  /** AVGCharacterSlot.m_currentKey, set when the portrait loads. */
  avatarName: string;
  /** 回落矩形的尺寸。 */
  size: Vec2;
  fallbackScale: Vec2;
  /** 通道 animWrapper 上 direction clip 的世代(重播即替换)。 */
  directionGen: number;
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
  if (input.type === 2) return "\u0000bg";
  if (input.slot === "right" || input.slot === "r") return "r";
  if (input.slot === "left" || input.slot === "l") return "l";
  return "m";
}

/**
 * Port scope: `Torappu.AVG.AVGCharacterCutinPanel._ExecuteInterlude` /
 * `CutinController` / `CutinChannel` / `CutinTemplate` (2.7.81, build 2781):
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
 *   `ato` over `aduration` (0.5s default). Running element/clip tweens are not
 *   reachable by the native DOKills and stop with the recycled channel.
 *
 * Web adaptations: stencil channels are PIXI Graphics masks; unknown maskids
 * fall back to the legacy plain rectangle; a dialog displays its own
 * portrait while type 1 runs the channel element sequence. The regular
 * type 3 branch uses the prefab's bottom anchor and the portrait hub rect.
 */
export class InterludePanel {
  private readonly channels = new Map<number, ChannelState>();
  private readonly pending = new Map<ExecutionHandle, ChannelState | null>();

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
      "run" | "start" | "killTarget" | "afterUpdate"
    >,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  run(input: InterludeInput, onComplete?: () => void): ExecutionHandle | void {
    if (!input.clear && input.channel < 0) {
      this.onWarning?.("interlude has no channel and is not a clear command");
      return;
    }

    const animation = createExecutionHandle(true, () =>
      this.pending.delete(animation),
    );
    const complete = () => {
      if (animation.endReason !== undefined) return;
      animation.end();
      onComplete?.();
    };
    try {
      if (input.clear) {
        // A clear command can span several channels.
        this.pending.set(animation, null);
        this.clear(input, complete);
      } else {
        const existing = this.channels.get(input.channel);
        const state = existing ?? this.createChannel(input);
        this.pending.set(animation, state);
        const preparation = existing
          ? this.update(state, input, complete)
          : this.begin(state, input, complete);
        if (preparation)
          void preparation.catch((error: unknown) => animation.fail(error));
      }
    } catch (error) {
      animation.fail(error);
    }
    return animation.endReason === "complete" ? undefined : animation;
  }

  clearAll(): void {
    for (const animation of this.pending.keys()) animation.end("reset");
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
  }

  destroy(): void {
    this.clearAll();
  }

  /** CutinChannel.OnCutinBegin (2791 @ 0x1814F9270). */
  private begin(
    state: ChannelState,
    input: InterludeInput,
    complete: () => void,
  ): Preparation {
    const start = (textures?: InterludeTextureSet): Preparation => {
      if (state.root.destroyed) return;
      this.buildChannel(state, input, textures);
      const template = state.template;
      if (template?.dialog) {
        const dialog = template.dialog;
        // Seed the entry pose before the Web texture load can yield a frame.
        if (input.style === 3 && input.durationMs > 0)
          applyDialogIntro(dialog, 0);
        const show = () => {
          if (state.root.destroyed) return;
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

    if (!KNOWN_MASK_IDS.has(input.maskId)) return start();
    const textures = loadInterludeTextures();
    return textures instanceof Promise
      ? textures.then(start, (error: unknown) => {
          if (state.root.destroyed) return;
          this.onWarning?.(
            `interlude template load failed for ${input.maskId}: ${String(error)}`,
          );
          return start();
        })
      : start(textures);
  }

  /** CutinChannel.OnCutinUpdate (2791 @ 0x1814F9820). */
  private update(
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
        if (input.type === 2 || input.type === 3 || !input.block) complete();
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

  private createChannel(input: InterludeInput): ChannelState {
    const root = new Container();
    root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    const maskContainer = new Container();
    const bkgScale = new Container();
    const bkgPoz = new Container();
    bkgScale.addChild(bkgPoz);
    const charScale = new Container();
    const charPoz = new Container();
    charScale.addChild(charPoz);
    const content = new Container();
    content.addChild(bkgScale, charScale);
    const decoContainer = new Container();
    root.addChild(maskContainer, content, decoContainer);
    this.layer.addChild(root);

    const state: ChannelState = {
      root,
      maskContainer,
      content,
      bkgScale,
      bkgPoz,
      charScale,
      charPoz,
      decoContainer,
      template: null,
      deco: null,
      decoName: "",
      fallbackMask: null,
      label: null,
      elements: new Map(),
      avatarLoadId: 0,
      avatarName: "",
      size: { ...input.size },
      fallbackScale: { x: 1, y: 1 },
      directionGen: 0,
      cachedName: "",
      dialogCharOffset: { x: 0, y: 0 },
      dialogCharScale: { x: 1, y: 1 },
    };
    this.channels.set(input.channel, state);
    return state;
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
    // cutin_channel prefab: char_img_right sits at (-140, 63) until a DoMove.
    if (key === "r") node.position.set(-140, -63);
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
        if (input.type === 2 && resource.texture) {
          // Image.SetNativeSize applies the background's PPU to the image
          // rect. DoScale applies the script's scale to the outer element.
          const [width, height] = this.nativeBackgroundRect(
            input.name,
            resource.texture,
          );
          element.sprite.setSize(width, height);
        }
        root.visible = true;
        alphaTarget = root;
      }
    }
    let sequence: Sequence | undefined;
    const tracks = () =>
      (sequence ??= new Sequence(this.tweens.run.bind(this.tweens)));

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
        tracks().append({
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
        tracks().join({
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
      tracks().join({
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
    if (onComplete) tracks();
    void sequence?.play({
      deferZeroDuration: true,
      isAlive: () => state.root.parent === this.layer,
      onComplete,
    });
    if (!input.block) complete();
  }

  /** TryPlayAnimation @ 0x1814FABE0 restarts a direction clip. */
  private playDirection(state: ChannelState, input: InterludeInput): boolean {
    const direction = input.direction;
    if (direction !== "rin" && direction !== "lin") return false;
    const nodes = {
      alphaTarget: state.root,
      bkgScale: state.bkgScale,
      bkgPoz: state.bkgPoz,
      charScale: state.charScale,
      charPoz: state.charPoz,
    };
    const seconds = CLIP_SECONDS.direction;
    const gen = ++state.directionGen;
    applyDirectionClip(nodes, direction, 0);
    this.runTween(state, seconds * 1000, (progress) => {
      if (state.directionGen === gen)
        applyDirectionClip(nodes, direction, progress * seconds);
    });
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
    if (input.durationMs <= 0) {
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
      if (!state.root.destroyed) use(resolved);
    };
    return asset instanceof Promise
      ? asset.then(apply, () => apply(null))
      : apply(asset);
  }

  private clear(input: InterludeInput, complete: () => void): void {
    if (input.channel < 0) {
      this.hideAllChannels(input);
      if (!input.block) complete();
      return;
    }

    const state = this.channels.get(input.channel);
    if (state) {
      this.hide(state, input, () => {
        this.recycleChannel(input.channel, state);
        if (input.block && state.template) complete();
      });
    }
    if (!input.block || !state?.template) complete();
  }

  private hideAllChannels(input: InterludeInput): void {
    // _ProcessChannelClean (2791 @ 0x1814FB710) leaves the shared callback's
    // channel unset. b__1 (0x181507EC0) faults before recycling or finishing
    // the command. DOTween catches callback failures in Safe Mode
    // (0x18443D780). An inline OnCutinEnd propagates the error.
    const message = "interlude clear-all completion received an unset channel";
    const done = (fromTween: boolean) => {
      if (!fromTween) throw new Error(message);
      this.onWarning?.(message);
    };
    for (const state of this.channels.values()) {
      if (state.template) this.hide(state, input, done);
      else done(false);
    }
  }

  private recycleChannel(id: number, state: ChannelState): void {
    if (this.channels.get(id) !== state) return;
    this.channels.delete(id);
    state.root.removeFromParent();
    // OnRecycle (2791 @ 0x1814F9CD0) kills the element sequences. Web
    // settles their waits here, as well as any unfinished texture loads.
    for (const [animation, owner] of this.pending) {
      if (owner === state) animation.end("reset");
    }
    // Destroy(template) takes effect after Update. Other mask tweens
    // can still complete in this update before the target is destroyed.
    this.tweens.afterUpdate(() => state.root.destroy({ children: true }));
  }

  /** CutinChannel.OnCutinEnd -> HideCutinMask. */
  private hide(
    state: ChannelState,
    input: InterludeInput,
    done: (fromTween: boolean) => void,
  ): void {
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

    const template = state.template;
    if (template?.dialog) {
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
    if (!template || input.style === 0) {
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
      isAlive: () => !state.root.destroyed && options?.isAlive?.() !== false,
    });
  }
}
