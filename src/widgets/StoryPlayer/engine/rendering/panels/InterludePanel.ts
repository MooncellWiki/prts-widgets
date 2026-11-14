import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import { STORY_HEIGHT, STORY_WIDTH, type InterludeInput } from "../../types";
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

import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";

type Preparation = void | Promise<void>;
type Vec2 = { x: number; y: number };

/** `_leftChar`/`_middleChar`/`_rightChar`/`_imgBg`/缓存的 charslot。 */
interface ElementState {
  /** 元素节点:DoMove(`_offset`)、DoScale(`_img`)与淡入淡出的共同目标。 */
  node: Container;
  sprite: Sprite;
  /**
   * 按属性的 tween 世代。native `_ProcessElement` 每条命令新建 Sequence,
   * 开头的 `DOKill(element)` 杀不到嵌在旧 Sequence 里的 tween(DOTween 的
   * defaultAutoPlay = All,旧 Sequence 照常跑完),只有同一属性的新 tween
   * 会在播放期间盖过它。所以只作废新命令写到的属性:第 13 章
   * `aduration=2, block=false` 淡入后紧跟同元素位移的写法依赖淡入继续。
   */
  alphaGen: number;
  moveGen: number;
  scaleGen: number;
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
  /** 模板 scaleNode 的当前比例(clear 从这里收缩到 tsto)。 */
  ratio: Vec2;
  /** 回落矩形的尺寸。 */
  size: Vec2;
  /** scaleNode 上 DOScale 的世代(clear 的收缩接管入场)。 */
  scaleGen: number;
  /** 通道 animWrapper 上 direction clip 的世代(重播即替换)。 */
  directionGen: number;
  /** dialog 入场 clip 的世代(HideCutinMask 先 _KillDialogIntroTween)。 */
  introGen: number;
  hideGen: number;
  /** `CutinTemplate.m_cachedName`。 */
  cachedName: string;
  /** `m_dialogCharPosOffset` / `m_dialogCharScaleMul`(只在给出时覆盖)。 */
  dialogCharOffset: Vec2;
  dialogCharScale: Vec2;
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

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** `CutinTemplate._ShowEmptyImage`:空名或 `char_empty`(忽略大小写)。 */
function isEmptyName(name: string): boolean {
  return !name || name.toLowerCase() === "char_empty";
}

/**
 * Native `_GetImgElementByParam`: type 2 is always the channel `_imgBackground`
 * and type 3 a single cached `CutinAVGCharacterSlot` (slot ignored); type 1
 * maps "right"/"r" and "left"/"l", everything else (empty or unknown) to
 * `_middleChar` without any error. Keys are uncollidable across types.
 */
function elementKeyFor(input: InterludeInput): string {
  if (input.type === 2) return "\u0000bg";
  if (input.type === 3) return "\u0000avatar";
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
 *   alpha/pos/scale tweens in parallel with their own durations; earlier
 *   sequences keep running (see ElementState) and a blocking command waits
 *   for its own tweens.
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
 * portrait while type 1 runs the channel element sequence; type 3 avatars
 * keep the texture's native size centred on the element.
 */
export class InterludePanel {
  private readonly channels = new Map<number, ChannelState>();
  private readonly pending = new Set<ExecutionHandle>();

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: (input: InterludeInput) => TextureLoad,
    private readonly tween: TweenRunner["run"],
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
    this.pending.add(animation);
    const complete = () => {
      if (animation.endReason === "reset" || animation.failure) return;
      animation.end();
      onComplete?.();
    };
    try {
      const state = this.channels.get(input.channel);
      const preparation = input.clear
        ? this.clear(input, complete)
        : state
          ? this.update(state, input, complete)
          : this.begin(input, complete);
      if (preparation)
        void preparation.catch((error: unknown) => animation.fail(error));
    } catch (error) {
      animation.fail(error);
    }
    return animation.endReason === "complete" ? undefined : animation;
  }

  clearAll(): void {
    for (const animation of this.pending) animation.end("reset");
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
  }

  destroy(): void {
    this.clearAll();
  }

  /** CutinChannel.OnCutinBegin (2791 @ 0x1814F9270). */
  private begin(input: InterludeInput, complete: () => void): Preparation {
    const state = this.createChannel(input);
    const start = (textures?: InterludeTextureSet): Preparation => {
      if (state.root.destroyed) return;
      this.buildChannel(state, input, textures);
      const template = state.template;
      if (template?.dialog) {
        const dialog = template.dialog;
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
        this.runTween(state, showMs, () => {}, complete);
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
        return this.prepareTexture(
          state,
          input.name ? this.loadTexture(input) : null,
          (texture) => {
            this.processElement(state, input, texture, complete);
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
    return this.prepareTexture(
      state,
      input.name ? this.loadTexture(input) : null,
      (texture) => this.processElement(state, input, texture, complete),
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
      ratio: { x: 1, y: 1 },
      size: { ...input.size },
      scaleGen: 0,
      directionGen: 0,
      introGen: 0,
      hideGen: 0,
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
          state.ratio = { ...template.initialScale };
          this.applyRatio(state);
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
    this.applyRatio(state);
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
      this.setRatio(state, { x: 1, y: 1 });

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
    const from = { ...input.templateSizeFrom };
    const to = { ...input.templateSizeTo };
    this.setRatio(state, from);
    const gen = ++state.scaleGen;
    this.runTween(
      state,
      input.templateSizeDurationMs,
      (progress) => {
        if (state.scaleGen !== gen) return;
        this.setRatio(state, {
          x: lerp(from.x, to.x, progress),
          y: lerp(from.y, to.y, progress),
        });
      },
      undefined,
      Boolean(state.template),
    );
  }

  private setRatio(state: ChannelState, ratio: Vec2): void {
    state.ratio = { x: ratio.x, y: ratio.y };
    this.applyRatio(state);
  }

  /** 模板:ratio 即 scaleNode.localScale;回落:按 ratio 重画矩形。 */
  private applyRatio(state: ChannelState): void {
    if (state.template) {
      state.template.scaleNode.scale.set(state.ratio.x, state.ratio.y);
      return;
    }
    const w = state.size.x * state.ratio.x;
    const h = state.size.y * state.ratio.y;
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
    // Inactive until SetCutinElement assigns a sprite.
    node.visible = false;
    // cutin_channel prefab: char_img_right sits at (-140, 63) until a DoMove.
    if (key === "r") node.position.set(-140, -63);
    (type === 2 ? state.bkgPoz : state.charPoz).addChild(node);
    const element: ElementState = {
      node,
      sprite,
      alphaGen: 0,
      moveGen: 0,
      scaleGen: 0,
    };
    state.elements.set(key, element);
    return element;
  }

  /** CutinChannel._ProcessElement (2791 @ 0x1814FA570). */
  private processElement(
    state: ChannelState,
    input: InterludeInput,
    texture: Texture | null,
    complete: () => void,
  ): void {
    const element = this.ensureElement(state, elementKeyFor(input), input.type);
    const node = element.node;
    let sequence: Sequence | undefined;
    const tracks = () => (sequence ??= new Sequence(this.tween));

    // SetCutinElement sets the sprite and the start value. The native
    // sequence appends its alpha tween and joins the position/scale tweens.
    if (input.name) {
      if (texture) {
        element.sprite.texture = texture;
        node.visible = true;
        const from = Math.max(input.alphaFrom, 0);
        const to = input.alphaTo >= 0 ? input.alphaTo : 1;
        const gen = ++element.alphaGen;
        if (input.alphaDurationMs > 0) {
          node.alpha = from;
          tracks().append({
            durationMs: input.alphaDurationMs,
            update: (progress) => {
              if (element.alphaGen === gen)
                node.alpha = lerp(from, to, progress);
            },
          });
        } else {
          node.alpha = to;
        }
      } else {
        this.onWarning?.(`interlude element asset is missing: ${input.name}`);
      }
    }

    if (input.positionFrom && input.positionTo) {
      const from = input.positionFrom;
      const to = input.positionTo;
      const gen = ++element.moveGen;
      node.position.set(from.x, -from.y);
      tracks().join({
        durationMs: input.durationMs,
        update: (progress) => {
          if (element.moveGen !== gen) return;
          node.position.set(
            lerp(from.x, to.x, progress),
            -lerp(from.y, to.y, progress),
          );
        },
      });
    }
    if (input.scaleFrom && input.scaleTo) {
      const from = input.scaleFrom;
      const to = input.scaleTo;
      const gen = ++element.scaleGen;
      node.scale.set(from.x, from.y);
      tracks().join({
        durationMs: input.scaleDurationMs,
        update: (progress) => {
          if (element.scaleGen !== gen) return;
          node.scale.set(
            lerp(from.x, to.x, progress),
            lerp(from.y, to.y, progress),
          );
        },
      });
    }

    if (this.playDirection(state, input)) {
      // TryPlayAnimation plays the channel clip instead of starting the
      // element sequence, so a blocking update has no completion callback.
      if (!input.block) complete();
      return;
    }

    // Sequence.DoStartup @ 0x18442C6F0 takes an empty sequence with OnComplete.
    if (input.block) tracks();
    void sequence?.play({
      deferZeroDuration: true,
      isAlive: () => !state.root.destroyed,
      onComplete: input.block ? complete : undefined,
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
    applyDialogIntro(dialog, 0);
    const gen = ++state.introGen;
    this.runTween(
      state,
      input.durationMs,
      (progress) => {
        if (state.introGen === gen)
          applyDialogIntro(dialog, progress * seconds);
      },
      input.block ? complete : undefined,
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
      return this.prepareTexture(state, loadTexture(), (texture) => {
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
    if (this.cacheName(state, input.name)) {
      if (isEmptyName(input.name)) {
        image.visible = false;
      } else {
        return this.prepareTexture(state, loadTexture(), (texture) => {
          if (texture) {
            image.texture = texture;
            image.visible = true;
          } else {
            image.visible = false;
            this.onWarning?.(
              `interlude dialog avatar is missing: ${input.name}`,
            );
          }
          layoutChar();
        });
      }
    }
    layoutChar();
  }

  private prepareTexture(
    state: ChannelState,
    texture: TextureLoad,
    use: (texture: Texture | null) => void,
  ): Preparation {
    const apply = (resolved: Texture | null) => {
      if (!state.root.destroyed) use(resolved);
    };
    return texture instanceof Promise
      ? texture.then(apply, () => apply(null))
      : apply(texture);
  }

  private clear(input: InterludeInput, complete: () => void): void {
    const channel = this.channels.get(input.channel);
    const states =
      input.channel < 0
        ? [...this.channels]
        : channel
          ? [[input.channel, channel] as const]
          : [];

    // CutinController._ProcessChannelClean (2791 @ 0x1814FB710) registers a
    // callback per channel. Recycle each Web view independently and release
    // on the first completion.
    for (const [id, state] of states) {
      const gen = ++state.hideGen;
      const isCurrent = () => state.hideGen === gen;
      this.hide(state, input, isCurrent, () => {
        if (state.hideGen !== gen || state.root.destroyed) return;
        this.channels.delete(id);
        state.root.destroy({ children: true });
        if (input.block && state.template) complete();
      });
      if (input.block && !state.template) complete();
    }
    // An absent explicit channel finishes immediately. An empty clear-all
    // has no channel callback to release a blocking command.
    if (!input.block || (input.channel >= 0 && !channel)) complete();
  }

  /** CutinChannel.OnCutinEnd -> HideCutinMask. */
  private hide(
    state: ChannelState,
    input: InterludeInput,
    isCurrent: () => boolean,
    done: () => void,
  ): void {
    const template = state.template;
    if (template?.dialog) {
      const group = template.dialog.group;
      state.introGen += 1;
      const from = group.alpha;
      const to = input.alphaTo >= 0 ? input.alphaTo : 0;
      const durationMs =
        input.alphaDurationMs > 0 ? input.alphaDurationMs : 500;
      this.runTween(
        state,
        durationMs,
        (progress) => {
          if (isCurrent()) group.alpha = lerp(from, to, progress);
        },
        done,
      );
      return;
    }

    if (state.deco) {
      const deco = state.deco.root;
      this.runTween(state, 500, (progress) => {
        if (isCurrent()) deco.alpha = 1 - progress;
      });
    }
    const scaleOut = (complete?: () => void): void => {
      const from = { ...state.ratio };
      const to = { ...input.templateSizeTo };
      const gen = ++state.scaleGen;
      this.runTween(
        state,
        input.templateSizeDurationMs,
        (progress) => {
          if (state.scaleGen !== gen) return;
          this.setRatio(state, {
            x: lerp(from.x, to.x, progress),
            y: lerp(from.y, to.y, progress),
          });
        },
        complete,
        Boolean(template),
      );
    };
    if (!template) {
      // The legacy fallback rectangle has no native CutinTemplate. Recycle
      // it on its own tween and release the command inline.
      scaleOut(done);
      return;
    }
    if (input.style === 0) {
      scaleOut(done);
      return;
    }
    if (input.style === 2) scaleOut();
    if (template.hasImgMask)
      this.runTween(state, input.alphaDurationMs, () => {}, done, true);
    else done();
  }

  private runTween(
    state: ChannelState,
    durationMs: number,
    update: (progress: number) => void,
    onComplete?: () => void,
    deferZeroDuration = false,
  ): void {
    const isAlive = () => !state.root.destroyed;
    void this.tween(
      durationMs,
      (progress) => {
        if (isAlive()) update(progress);
      },
      () => {
        if (isAlive()) onComplete?.();
      },
      { deferZeroDuration, isAlive },
    );
  }
}
