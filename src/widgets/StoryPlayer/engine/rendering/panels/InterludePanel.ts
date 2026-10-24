import {
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type InterludeInput } from "../../types";

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
  type TemplateNodes,
} from "./interludeTemplates";

type TextureLoader = (input: InterludeInput) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;
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
 *   top; natively a blocking element update then never gets its callback, the
 *   Web completes when the clip and the element tweens end.
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
 * fall back to the legacy plain rectangle; type 1 on a dialog only feeds the
 * portrait (the parallel `_ProcessElement` on the channel element is not
 * ported; corpus has no such command); type 3 avatars keep the texture's
 * native size centred on the element (the `cutin_charslot` bottom anchor is
 * not ported).
 */
export class InterludePanel {
  private readonly channels = new Map<number, ChannelState>();

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  async run(input: InterludeInput): Promise<void> {
    if (input.clear) {
      await this.clear(input);
      return;
    }
    if (input.channel < 0) {
      this.onWarning?.("interlude has no channel and is not a clear command");
      return;
    }

    const existing = this.channels.get(input.channel);
    if (existing) await this.update(existing, input);
    else await this.begin(input);
  }

  async clearAll(): Promise<void> {
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
  }

  destroy(): void {
    void this.clearAll();
  }

  /** `CutinChannel.OnCutinBegin`。 */
  private async begin(input: InterludeInput): Promise<void> {
    const state = await this.createChannel(input);
    const template = state.template;
    let showMs = 0;
    if (template?.dialog) {
      showMs = this.playDialogIntro(state, template.dialog, input);
      await this.refreshDialog(state, template.dialog, input);
    } else if (template) {
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
    // _TryPlayAnimation runs after ShowCutinMask; its clip never gates begin.
    void this.playDirection(state, input);
    if (input.block && showMs > 0) await this.tween(showMs, () => {});
  }

  /** `CutinChannel.OnCutinUpdate`。 */
  private async update(
    state: ChannelState,
    input: InterludeInput,
  ): Promise<void> {
    const template = state.template;
    if (template?.dialog) {
      // ConsumesAvatar/BackgroundUpdates: type 3/2 skip _ProcessElement and
      // complete at once; UpdateCutinMask refreshes the dialog images.
      await this.refreshDialog(state, template.dialog, input);
      return;
    }

    // UpdateCutinMask (base): _emptyImg on name change + deco Render.
    if (template) {
      if (this.cacheName(state, input.name) && template.emptyImage)
        template.emptyImage.visible = isEmptyName(input.name);
      this.renderDeco(state, input);
    } else {
      this.renderFallbackLabel(state, input);
    }

    // Type 0/unknown never reaches _ProcessElement; natively a blocking one
    // hangs on a plain template, we complete immediately instead.
    if (input.type < 1 || input.type > 3) return;
    await this.processElement(state, input);
  }

  private async createChannel(input: InterludeInput): Promise<ChannelState> {
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
      cachedName: "",
      dialogCharOffset: { x: 0, y: 0 },
      dialogCharScale: { x: 1, y: 1 },
    };
    const offsetX = input.offset.x;
    const offsetY = -input.offset.y;

    if (input.maskId && KNOWN_MASK_IDS.has(input.maskId)) {
      try {
        const tex = await loadInterludeTextures();
        const template = buildTemplate(input.maskId, tex);
        if (template) {
          state.template = template;
          let anchorX = 0;
          if (template.anchor === "left") anchorX = -STORY_WIDTH / 2;
          else if (template.anchor === "right") anchorX = STORY_WIDTH / 2;
          template.root.position.set(anchorX + offsetX, offsetY);
          if (!template.dialog) {
            const size =
              input.size.x * input.size.x + input.size.y * input.size.y >= 1e-10
                ? input.size
                : template.defaultSize;
            template.resize(size.x, size.y);
            content.mask = template.maskGraphics;
            const deco = buildDeco(input.maskId, tex);
            if (deco) {
              deco.root.position.set(offsetX, offsetY);
              decoContainer.addChild(deco.root);
              state.deco = deco;
            }
          }
          state.ratio = { ...template.initialScale };
          this.applyRatio(state);
          maskContainer.addChild(template.root);
        }
      } catch (error) {
        this.onWarning?.(
          `interlude template build failed for ${input.maskId}: ${String(error)}`,
        );
      }
    }

    if (!state.template) {
      const fallback = new Graphics();
      fallback.position.set(offsetX, offsetY);
      maskContainer.addChild(fallback);
      content.mask = fallback;
      state.fallbackMask = fallback;
      this.applyRatio(state);
    }

    this.channels.set(input.channel, state);
    return state;
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
      void this.tween(seconds * 1000, (progress) => {
        if (state.root.destroyed) return;
        applySquareShow(nodes, progress * seconds);
      });
    }

    if (style === 3 && template.animatorClip === "hori_mask_open") {
      const seconds = CLIP_SECONDS.horiMaskOpen;
      applyHoriMaskOpen(template.maskNode, 0);
      void this.tween(seconds * 1000, (progress) => {
        if (state.root.destroyed) return;
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
    void this.tween(input.templateSizeDurationMs, (progress) => {
      if (state.scaleGen !== gen || state.root.destroyed) return;
      this.setRatio(state, {
        x: lerp(from.x, to.x, progress),
        y: lerp(from.y, to.y, progress),
      });
    });
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

  /** `CutinChannel._ProcessElement`. */
  private async processElement(
    state: ChannelState,
    input: InterludeInput,
  ): Promise<void> {
    const element = this.ensureElement(state, elementKeyFor(input), input.type);
    const node = element.node;
    const runs: Array<Promise<void>> = [];

    // SetCutinElement (name present): sprite + SetNativeSize; aFrom/aTo are
    // normalised by _ProcessElement (<0 → 0 / 1); aDuration > 0 fades
    // aFrom→aTo, otherwise alpha is set to aTo at once.
    if (input.name) {
      const texture = await this.loadTexture(input);
      if (!texture) {
        this.onWarning?.(`interlude element asset is missing: ${input.name}`);
        return;
      }
      if (node.destroyed) return;
      element.sprite.texture = texture;
      node.visible = true;
      const from = Math.max(input.alphaFrom, 0);
      const to = input.alphaTo >= 0 ? input.alphaTo : 1;
      const gen = ++element.alphaGen;
      if (input.alphaDurationMs > 0) {
        node.alpha = from;
        runs.push(
          this.tween(input.alphaDurationMs, (progress) => {
            if (element.alphaGen !== gen || node.destroyed) return;
            node.alpha = lerp(from, to, progress);
          }),
        );
      } else {
        node.alpha = to;
      }
    } else if (node.destroyed) {
      return;
    }

    if (input.positionFrom && input.positionTo) {
      const from = input.positionFrom;
      const to = input.positionTo;
      const gen = ++element.moveGen;
      node.position.set(from.x, -from.y);
      runs.push(
        this.tween(input.durationMs, (progress) => {
          if (element.moveGen !== gen || node.destroyed) return;
          node.position.set(
            lerp(from.x, to.x, progress),
            -lerp(from.y, to.y, progress),
          );
        }),
      );
    }
    if (input.scaleFrom && input.scaleTo) {
      const from = input.scaleFrom;
      const to = input.scaleTo;
      const gen = ++element.scaleGen;
      node.scale.set(from.x, from.y);
      runs.push(
        this.tween(input.scaleDurationMs, (progress) => {
          if (element.scaleGen !== gen || node.destroyed) return;
          node.scale.set(
            lerp(from.x, to.x, progress),
            lerp(from.y, to.y, progress),
          );
        }),
      );
    }

    const direction = this.playDirection(state, input);
    if (!input.block) return;
    await Promise.all(direction ? [direction, ...runs] : runs);
  }

  /**
   * `_TryPlayAnimation`: `direction=rin/lin` restarts the channel animWrapper
   * clip (SampleClipAtBegin + Play). Returns null when there is no direction.
   */
  private playDirection(
    state: ChannelState,
    input: InterludeInput,
  ): Promise<void> | null {
    const direction =
      input.direction === "rin" || input.direction === "lin"
        ? input.direction
        : null;
    if (!direction) return null;
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
    return this.tween(seconds * 1000, (progress) => {
      if (state.directionGen !== gen || state.root.destroyed) return;
      applyDirectionClip(nodes, direction, progress * seconds);
    });
  }

  /**
   * `_PlayDialogIntro`: style 3 only; speed = ClipLength / duration, so the clip
   * is remapped onto the command `duration`; `NeedSkipAnimation(duration)`
   * samples the end pose. Returns the intro length in ms (0 = no tween).
   */
  private playDialogIntro(
    state: ChannelState,
    dialog: DialogNodes,
    input: InterludeInput,
  ): number {
    if (input.style !== 3) return 0;
    const seconds = dialog.right
      ? CLIP_SECONDS.dialogIntroRight
      : CLIP_SECONDS.dialogIntroLeft;
    if (input.durationMs <= 0) {
      applyDialogIntro(dialog, seconds);
      return 0;
    }
    applyDialogIntro(dialog, 0);
    const gen = ++state.introGen;
    void this.tween(input.durationMs, (progress) => {
      if (state.introGen !== gen || state.root.destroyed) return;
      applyDialogIntro(dialog, progress * seconds);
    });
    return input.durationMs;
  }

  /**
   * `_RefreshDialogBackground` (type 2) / `_RefreshDialogChar` (type 3 and 1).
   */
  private async refreshDialog(
    state: ChannelState,
    dialog: DialogNodes,
    input: InterludeInput,
  ): Promise<void> {
    if (input.type === 2) {
      if (isEmptyName(input.name)) {
        setDialogBackground(dialog, null);
        return;
      }
      const texture = await this.loadTexture(input);
      if (state.root.destroyed) return;
      if (texture) setDialogBackground(dialog, texture);
      else
        this.onWarning?.(
          `interlude dialog background is missing: ${input.name}`,
        );
      return;
    }
    if (input.type !== 3 && input.type !== 1) return;

    if (input.dialogCharPos)
      state.dialogCharOffset = { ...input.dialogCharPos };
    if (input.dialogCharScale)
      state.dialogCharScale = { ...input.dialogCharScale };
    const image = dialog.charImage;
    if (this.cacheName(state, input.name)) {
      if (isEmptyName(input.name)) {
        image.visible = false;
      } else {
        const texture = await this.loadTexture(input);
        if (state.root.destroyed) return;
        if (texture) {
          image.texture = texture;
          image.visible = true;
        } else {
          image.visible = false;
          this.onWarning?.(`interlude dialog avatar is missing: ${input.name}`);
        }
      }
    }
    if (image.visible)
      layoutDialogChar(dialog, state.dialogCharOffset, state.dialogCharScale);
  }

  private async clear(input: InterludeInput): Promise<void> {
    const states =
      input.channel < 0
        ? [...this.channels.entries()]
        : [...this.channels.entries()].filter(
            ([channel]) => channel === input.channel,
          );
    // Native _ProcessChannelClean clear-all invokes the completion callback
    // once per recycled channel (and never when there are none); we aggregate
    // into a single completion on purpose.
    if (input.channel < 0 && input.block && states.length > 1)
      this.onWarning?.(
        `interlude clear-all aggregates ${states.length} channel completions into one (native fires per channel)`,
      );
    const tasks = states.map(async ([channel, state]) => {
      const run = this.hide(state, input, () => {
        if (!state.root.destroyed) state.root.destroy({ children: true });
        if (this.channels.get(channel) === state) this.channels.delete(channel);
      });
      if (input.block) await run;
      else void run;
    });
    if (input.block) await Promise.all(tasks);
  }

  /** `CutinChannel.OnCutinEnd` → `HideCutinMask`; `done` recycles the channel. */
  private hide(
    state: ChannelState,
    input: InterludeInput,
    done: () => void,
  ): Promise<void> {
    const template = state.template;
    if (template?.dialog) {
      const group = template.dialog.group;
      state.introGen += 1;
      const from = group.alpha;
      const to = input.alphaTo >= 0 ? input.alphaTo : 0;
      const durationMs =
        input.alphaDurationMs > 0 ? input.alphaDurationMs : 500;
      return this.tween(
        durationMs,
        (progress) => {
          if (state.root.destroyed) return;
          group.alpha = lerp(from, to, progress);
        },
        done,
      );
    }

    if (state.deco) {
      const deco = state.deco.root;
      void this.tween(500, (progress) => {
        if (!deco.destroyed) deco.alpha = 1 - progress;
      });
    }
    const scaleOut = (complete?: () => void): Promise<void> => {
      const from = { ...state.ratio };
      const to = { ...input.templateSizeTo };
      const gen = ++state.scaleGen;
      return this.tween(
        input.templateSizeDurationMs,
        (progress) => {
          if (state.scaleGen !== gen || state.root.destroyed) return;
          this.setRatio(state, {
            x: lerp(from.x, to.x, progress),
            y: lerp(from.y, to.y, progress),
          });
        },
        complete,
      );
    };
    // Style Scale (and the Web fallback rectangle): DOScale from the current
    // ratio to tsTo (tsFrom is not reused), completing the hide.
    if (!template || input.style === 0) return scaleOut(done);
    // Both: the DOScale runs alongside the _imgMask fade without a callback.
    if (input.style === 2) void scaleOut();
    // Other styles complete on DOFade(_imgMask → ato, aduration): only the
    // timing is visible since _imgMask writes stencil only.
    return this.tween(input.alphaDurationMs, () => {}, done);
  }
}
