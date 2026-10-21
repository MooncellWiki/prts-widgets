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
  loadInterludeTextures,
  type DecoNodes,
  type TemplateNodes,
} from "./interludeTemplates";

type TextureLoader = (input: InterludeInput) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;

interface ChannelState {
  /** 通道根(`cutin_channel` prefab 的近似):位置 = 画布中心 + offset。 */
  root: Container;
  /** mask 模板(`CutinTemplate` prefab);null = 未知 maskid 的矩形回落。 */
  template: TemplateNodes | null;
  /** deco(`group_interclude_*_deco` prefab)。 */
  deco: DecoNodes | null;
  elements: Map<string, Container>;
  label: Text | null;
  /** 裁切图形:模板 maskNode 下的 Graphics,或回落路径自己的 Graphics。 */
  maskGraphics: Graphics;
  /** 回落路径:按 ratio 重画矩形(native 无此分支,是 Web 的兜底)。 */
  fallbackMask: boolean;
  /** `root_bkg_scale`/`root_bkg_poz`(type 2 背景挂点,direction 动画目标)。 */
  bkgScale: Container;
  bkgPoz: Container;
  /** `root_char_scale`/`root_char_poz`(type 1/3 元素挂点,direction 动画目标)。 */
  charScale: Container;
  charPoz: Container;
  /** Current template scale ratio (tracked through ts tweens for clear). */
  ratio: { x: number; y: number };
  /** Guards the clear tween; element tweens use per-element sessions. */
  sessionId: number;
  /** direction 动画独立守卫(原生 animWrapper 动画不被元素命令打断)。 */
  directionId: number;
  size: { x: number; y: number };
  /**
   * Guards the template show/scale tween separately: native element commands
   * DOKill only the element tweens, never the template DOScale, so element
   * sessions must not cancel it (only clear/recreate does).
   */
  templateSessionId: number;
  /**
   * Guards the wrapper/visual clip tweens (dialog intro, square/hori show,
   * 3s visuals fade): native OnCutinEnd DOKills the animWrapper tweens when
   * the channel starts hiding, so clear() must kill these too.
   */
  clipSessionId: number;
  /** 模板 `m_cachedName`:`_emptyImg`(占位立绘)只在 name 变化时重判。 */
  cachedName: string;
}

/** 有 prefab 模板的 maskid(热更包 `avg/[uc]common.ab` 全集)。 */
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

/**
 * 元素级 tween 会话:native 的 DOKill 只作用于当前命令的目标元素,同通道
 * 其它元素(如 `_imgBackground`)的进行中 tween 不受影响;只有 direction
 * 命中(_TryPlayAnimation)才杀通道内全部元素 tween。挂在元素容器上的自增
 * id,元素销毁重建时旧容器的会话随之作废。
 */
const elementSessions = new WeakMap<Container, number>();

function nextElementSession(element: Container): number {
  const session = (elementSessions.get(element) ?? 0) + 1;
  elementSessions.set(element, session);
  return session;
}

/**
 * Native `_GetImgElementByParam` keeps three disjoint element slots: type 2 is
 * always the channel `_imgBackground` (the slot key is ignored), type 3 is a
 * single cached `CutinAVGCharacterSlot` per channel, and only type 1 picks
 * l/m/r by slot (unknown/empty names fall back to middle). Mirror that with
 * uncollidable keys so a char/uichar command cannot destroy the background
 * element (or vice versa).
 */
function elementKeyFor(input: InterludeInput): string {
  if (input.type === 2) return "\u0000bg";
  if (input.type === 3) return "\u0000avatar";
  return input.slot || "m";
}

/**
 * Port scope: `Torappu.AVG.AVGCharacterCutinPanel._ExecuteInterlude` /
 * `CutinController` / `CutinChannel` / `CutinTemplate` (2.7.81, build 2781):
 *
 * - Channel begin (`OnCutinBegin` → `CutinTemplate.ShowCutinMask`) builds the
 *   mask-template prefab tree per `maskid` (values transcribed from the
 *   `avg/[uc]common.ab` prefabs; see `interludeTemplates.ts`), applies
 *   size/offset once and owns the show timing: the sequence has a 1s
 *   `AppendInterval` floor, Fade/Both styles join a hardcoded 3s mask fade,
 *   and Scale style runs an independent tsFrom→tsTo DOScale that does not
 *   gate completion; ANIMATOR styles play the template show clip
 *   (square deco reveal / horizon y-open). Begin never reaches
 *   `_ProcessElement`: element params on a create command are dropped for
 *   plain/fallback templates (only the dialog override consumes them).
 * - Channel update (`OnCutinUpdate` → `CutinTemplate.UpdateCutinMask`) only
 *   refreshes the deco (charName/switch) and the `_emptyImg` placeholder on
 *   name changes; it never re-applies size/offset. `switch` feeds the deco
 *   `TwoStateToggle` (`CutinTemplateDecoView.Render`); only the content
 *   layers toggle and only when the key is present.
 * - Elements (`CutinChannel._ProcessElement` → `CutinElement.SetCutinElement`)
 *   run alpha/pos/scale tweens in parallel, each with its own duration
 *   (alpha via aDuration on the Set append, pos via duration, scale via
 *   sDuration); the command completes when all of them finish. DOKill is
 *   scoped to the target element only — a command never cancels a tween that
 *   is still running on another element of the channel (e.g. a long bg fade
 *   keeps going under later char commands). Mount points
 *   mirror the `cutin_channel` prefab: backgrounds under `root_bkg_scale`,
 *   char/uichar under `root_char_scale`, both clipped by the template mask
 *   (stencil channels approximated with a PIXI Graphics mask).
 * - `direction=rin/lin` (`CutinChannel._TryPlayAnimation` →
 *   `avg_cutin_hori_{right,left}_in_chanel`): only the target element's
 *   tweens are killed and the channel animWrapper takes over with a 2.083s
 *   scale/offset/alpha clip. Natively a blocking element update then never
 *   receives its completion callback; we complete at the clip end instead of
 *   hanging.
 * - 2.7.61 `CutinTemplateDialogView` (`interlude_dialog_left/right`):
 *   `ConsumesAvatarUpdates`/`ConsumesBackgroundUpdates` route type 3/2 (and
 *   type 1, which the dialog also takes through the portrait pipeline) into
 *   the template (`img_char`/`img_bg`) instead of `_ProcessElement` — on
 *   begin too (the dialog overrides `ShowCutinMask`); `icharpos`/`icharscale`
 *   override the char transform. The dialog intro clip only plays for
 *   style 3, time-remapped to the command's own `duration` (duration == 0
 *   jumps straight to the end pose — the actual act54side case).
 * - Clear (`CutinTemplate.HideCutinMask`) scales the mask from its current
 *   ratio to `tsto` over tsduration (style 0 path: DOScale to tsTo only,
 *   tsFrom is not reused). Native `OnCutinEnd` DOKills every element tween
 *   and the animWrapper first, so the Web clear invalidates element, template
 *   and clip sessions together.
 *
 * Web adaptations (intentional simplifications): the native stencil pass is a
 * rectangular Graphics mask; `bg_defaul_gradient`'s gradient shader is a
 * stretched texture; unknown `maskid`s fall back to the legacy plain
 * rectangle; the deco `TwoStateToggle` wiring also toggles the content layers
 * for visibility parity.
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
    const state = existing ?? (await this.createChannel(input));
    const created = existing === undefined;
    this.refreshDeco(state, input);
    this.refreshPlaceholder(state, input);

    // 2.7.61 CutinTemplateDialogView consumes avatar/background updates on
    // begin AND update (its ShowCutinMask override runs the same refresh), and
    // owns its show timing — no 1s/3s floor on the dialog path.
    if (state.template?.isDialog && state.template.dialog) {
      await this.runDialogUpdate(state, input, created);
      return;
    }

    // Native OnCutinUpdate: type 0/unknown never reaches _ProcessElement; with
    // a plain template the completion callback is not fired either, so a
    // blocking type-0 update would hang natively. We intentionally complete
    // immediately instead.
    if (input.type === 0) {
      if (created && input.block)
        await this.tween(this.showMs(input.style), () => {});
      return;
    }

    const direction =
      input.direction === "rin" || input.direction === "lin"
        ? input.direction
        : null;
    if (direction) {
      await this.runDirection(state, input, direction, created);
      return;
    }

    // Native OnCutinBegin never reaches _ProcessElement: on a create command
    // only the dialog override (runDialogUpdate above) and _TryPlayAnimation
    // (runDirection above) consume content. Element params on a plain or
    // fallback template are dropped and completion is just the show sequence.
    if (created) {
      if (input.block) await this.tween(this.showMs(input.style), () => {});
      return;
    }

    if (input.type === 1 && !input.slot)
      this.onWarning?.(
        `interlude element slot is missing (type ${input.type}), falling back to "m"`,
      );
    const elementKey = elementKeyFor(input);
    let element = state.elements.get(elementKey);
    if (input.name) {
      const texture = await this.loadTexture(input);
      if (!texture) {
        this.onWarning?.(`interlude element asset is missing: ${input.name}`);
        return;
      }
      // 替换元素前先作废旧元素的 tween(native SetCutinElement 的 DOKill)。
      if (element) {
        nextElementSession(element);
        element.destroy({ children: true });
      }
      element = new Container();
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      element.addChild(sprite);
      // Native CutinImageElement.SetCutinElement: SetNativeSize keeps the
      // sprite's native dimensions (no window fit); backgrounds mount under
      // root_bkg_poz, char/uichar under root_char_poz (cutin_channel prefab).
      (input.type === 2 ? state.bkgPoz : state.charPoz).addChild(element);
      state.elements.set(elementKey, element);
      element.alpha = Math.max(input.alphaFrom, 0);
    }
    if (!element) {
      this.onWarning?.(`interlude element slot is missing: ${elementKey}`);
      return;
    }

    const el = element;
    // DOKill 作用域:native 只杀该元素的旧 tween,不碰同通道其它元素。
    const elementSession = nextElementSession(el);
    if (input.switchSet) el.visible = input.switchOn;
    if (input.positionFrom && input.positionTo)
      el.position.set(input.positionFrom.x, -input.positionFrom.y);
    if (input.scaleFrom) el.scale.set(input.scaleFrom.x, input.scaleFrom.y);

    // Native _ProcessElement: the SetCutinElement alpha tween (name present)
    // and the pos/scale tweens each keep their own duration and run in
    // parallel; the sequence completes when every tween finished.
    const runs: Array<Promise<void>> = [];
    if (input.positionFrom && input.positionTo) {
      const from = input.positionFrom;
      const to = input.positionTo;
      runs.push(
        this.tween(input.durationMs, (progress) => {
          if (elementSessions.get(el) !== elementSession) return;
          el.position.set(
            lerp(from.x, to.x, progress),
            -lerp(from.y, to.y, progress),
          );
        }),
      );
    }
    if (input.scaleFrom && input.scaleTo) {
      const from = input.scaleFrom;
      const to = input.scaleTo;
      runs.push(
        this.tween(input.scaleDurationMs, (progress) => {
          if (elementSessions.get(el) !== elementSession) return;
          el.scale.set(
            lerp(from.x, to.x, progress),
            lerp(from.y, to.y, progress),
          );
        }),
      );
    }
    if (input.name) {
      const startAlpha = Math.max(input.alphaFrom, 0);
      const endAlpha = input.alphaTo >= 0 ? input.alphaTo : 1;
      runs.push(
        this.tween(input.alphaDurationMs, (progress) => {
          if (elementSessions.get(el) !== elementSession) return;
          el.alpha = lerp(startAlpha, endAlpha, progress);
        }),
      );
    }
    if (input.block) {
      const show = created
        ? this.tween(this.showMs(input.style), () => {})
        : null;
      await Promise.all(show ? [show, ...runs] : runs);
    } else {
      for (const run of runs) void run;
    }
  }

  async clearAll(): Promise<void> {
    for (const state of this.channels.values())
      state.root.destroy({ children: true });
    this.channels.clear();
  }

  destroy(): void {
    void this.clearAll();
  }

  /**
   * Native CutinTemplate.ShowCutinMask completion floor: the show sequence
   * always starts with AppendInterval(1.0); Fade/Both styles join a hardcoded
   * 3s DOFade; ANIMATOR hands completion to the template animation (m_cutinSeq
   * = null → callback fires immediately).
   */
  private showMs(style: number): number {
    if (style === 3) return 0;
    return style === 1 || style === 2 ? 3000 : 1000;
  }

  private async createChannel(input: InterludeInput): Promise<ChannelState> {
    const root = new Container();
    root.position.set(
      STORY_WIDTH / 2 + input.offset.x,
      STORY_HEIGHT / 2 - input.offset.y,
    );
    // cutin_channel prefab: root_char_scale/root_char_poz 与
    // root_bkg_scale/root_bkg_poz 是两组全屏居中容器(仅 direction 动画会
    // 动它们的 scale/position),元素分别挂在其下。
    const bkgScale = new Container();
    const bkgPoz = new Container();
    bkgScale.addChild(bkgPoz);
    const charScale = new Container();
    const charPoz = new Container();
    charScale.addChild(charPoz);
    root.addChild(bkgScale, charScale);
    this.layer.addChild(root);

    const state: ChannelState = {
      root,
      template: null,
      deco: null,
      elements: new Map(),
      label: null,
      maskGraphics: new Graphics(),
      fallbackMask: true,
      bkgScale,
      bkgPoz,
      charScale,
      charPoz,
      ratio: { x: 1, y: 1 },
      sessionId: 0,
      directionId: 0,
      size: { ...input.size },
      templateSessionId: 0,
      clipSessionId: 0,
      cachedName: "",
    };

    // mask 模板:已知 maskid 走 prefab 重建,否则保持矩形回落。
    if (input.maskId && KNOWN_MASK_IDS.has(input.maskId)) {
      try {
        const tex = await loadInterludeTextures();
        const template = buildTemplate(input.maskId, tex);
        if (template) {
          state.template = template;
          state.fallbackMask = false;
          // native:size² > ε 才覆写模板 sizeDelta,≈0 沿用 prefab 默认尺寸。
          const size =
            input.size.x * input.size.x + input.size.y * input.size.y > 1e-10
              ? input.size
              : template.defaultSize;
          template.resize(size.x, size.y);
          root.addChildAt(template.root, 0);
          const deco = buildDeco(input.maskId, tex);
          if (deco) {
            state.deco = deco;
            root.addChild(deco.root);
            state.label = deco.label;
          }
          if (!template.isDialog) {
            state.maskGraphics = template.maskGraphics;
            bkgScale.mask = state.maskGraphics;
            charScale.mask = state.maskGraphics;
          }
          this.playShowClip(state, template, input, size);
        }
      } catch (error) {
        this.onWarning?.(
          `interlude template build failed for ${input.maskId}: ${String(error)}`,
        );
      }
    }

    if (state.fallbackMask) {
      root.addChildAt(state.maskGraphics, 0);
    }

    // Native ShowCutinMask style Scale(0): when tsTo has any component > 0 the
    // template starts at localScale=tsFrom and DOScales to tsTo over
    // tsduration. Other styles keep scale 1 (their ts keys are ignored).
    const scaleEntry =
      input.style === 0 &&
      (input.templateSizeTo.x > 0 || input.templateSizeTo.y > 0);
    if (scaleEntry) {
      const from = input.templateSizeFrom;
      const to = input.templateSizeTo;
      state.ratio = { x: from.x, y: from.y };
      this.applyRatio(state);
      if (input.templateSizeDurationMs > 0) {
        const templateSessionId = ++state.templateSessionId;
        void this.tween(input.templateSizeDurationMs, (progress) => {
          if (state.templateSessionId !== templateSessionId) return;
          state.ratio = {
            x: lerp(from.x, to.x, progress),
            y: lerp(from.y, to.y, progress),
          };
          this.applyRatio(state);
        });
      } else {
        state.ratio = { x: to.x, y: to.y };
        this.applyRatio(state);
      }
    } else if (state.fallbackMask) {
      this.applyRatio(state);
    } else {
      this.applyRatio(state);
    }

    // Fade/Both 的 3 秒 imgMask 淡入(视觉;完成地板在 showMs)。native 淡的
    // 是模板的 _imgMask —— 无模板(矩形回落)时无处可淡,跳过。
    if (
      (input.style === 1 || input.style === 2) &&
      state.template &&
      !state.fallbackMask
    ) {
      const target = state.template.visuals;
      const clipSessionId = state.clipSessionId;
      target.alpha = 0;
      void this.tween(3000, (progress) => {
        if (state.clipSessionId !== clipSessionId) return;
        target.alpha = progress;
      });
    }

    if (!state.label && input.charName && state.fallbackMask) {
      const label = this.makeLabel(input.charName);
      state.label = label;
      root.addChild(label);
    } else if (state.label && input.charName) {
      state.label.text = input.charName;
    }

    this.channels.set(input.channel, state);
    return state;
  }

  /**
   * style=ANIMATOR(3)/dialog 模板的入场动画(视觉,不阻塞完成)。
   *
   * Dialog 入场按 native `_PlayDialogIntro`(build 2781 `0x18145B290`):
   * 仅 `style==3` 播放;播放速度 = ClipLength / 命令 `duration`,即整段
   * clip 重映射到命令自己的 duration(已乘 animateRatio);`duration==0`
   * 时 `AVGUtils.NeedSkipAnimation`(= IsZero)直接采样末姿态,不播动画
   * —— act54side 的 3 条 dialog 命令都没写 duration,native 即此路径。
   */
  private playShowClip(
    state: ChannelState,
    template: TemplateNodes,
    input: InterludeInput,
    size: { x: number; y: number },
  ): void {
    if (template.isDialog && template.dialog) {
      const dialog = template.dialog;
      if (input.style !== 3) return;
      if (input.durationMs <= 0) {
        applyDialogIntro(dialog, CLIP_SECONDS.dialogIntro);
        return;
      }
      const clipSessionId = state.clipSessionId;
      void this.tween(input.durationMs, (progress) => {
        if (state.clipSessionId !== clipSessionId) return;
        applyDialogIntro(dialog, progress * CLIP_SECONDS.dialogIntro);
      });
      return;
    }
    if (input.style !== 3 || !template.showClip) return;
    const clipSessionId = state.clipSessionId;
    if (template.showClip === "square_show") {
      const durMs = CLIP_SECONDS.squareShow * 1000;
      if (durMs <= 0) return;
      const nodes = {
        backShadow: template.backShadow,
        frameGroup: state.deco?.frameGroup ?? null,
        nameGroup: state.deco?.nameGroup ?? null,
        waveGroup: state.deco?.waveGroup ?? null,
      };
      void this.tween(durMs, (progress) => {
        if (state.clipSessionId !== clipSessionId) return;
        applySquareShow(nodes, size, progress * CLIP_SECONDS.squareShow);
      });
    } else if (template.showClip === "hori_mask_open") {
      const durMs = CLIP_SECONDS.horiMaskOpen * 1000;
      if (durMs <= 0) return;
      void this.tween(durMs, (progress) => {
        if (state.clipSessionId !== clipSessionId) return;
        applyHoriMaskOpen(
          template.maskNode,
          progress * CLIP_SECONDS.horiMaskOpen,
        );
      });
    }
  }

  /**
   * Native CutinTemplate.UpdateCutinMask: only the deco is refreshed (name
   * text and the TwoStateToggle); size/offset are never re-applied and the
   * mask itself never toggles. The Web stand-in for the deco TwoStateToggle
   * toggles the content layers (deco + elements + name label) visibility.
   */
  private refreshDeco(state: ChannelState, input: InterludeInput): void {
    if (input.switchSet) {
      if (state.deco) state.deco.root.visible = input.switchOn;
      for (const element of state.elements.values())
        element.visible = input.switchOn;
      if (state.label) state.label.visible = input.switchOn;
    }

    if (!input.charName) {
      // CutinTemplateDecoView.Render sets the text every update; an empty
      // name keeps the (now empty) deco alive.
      if (state.label) state.label.text = "";
      return;
    }
    if (state.label) {
      state.label.text = input.charName;
      return;
    }
    if (state.fallbackMask) {
      // 回落路径没有 deco prefab,补一个文字标签保持旧行为。
      const label = this.makeLabel(input.charName);
      state.label = label;
      state.root.addChild(label);
    }
  }

  /** 模板 `_emptyImg`(`img_unknown` 占位):仅 name 变化时重判可见性。 */
  private refreshPlaceholder(state: ChannelState, input: InterludeInput): void {
    if (state.cachedName === input.name) return;
    state.cachedName = input.name;
    if (state.template?.emptyImage)
      state.template.emptyImage.visible = !input.name;
  }

  /** 2.7.61 CutinTemplateDialogView:avatar/background 更新转交模板消费。 */
  private async runDialogUpdate(
    state: ChannelState,
    input: InterludeInput,
    created: boolean,
  ): Promise<void> {
    const dialog = state.template?.dialog;
    if (!dialog) return;
    // Native `_RefreshDialogChar` runs for type 3 AND type 1(both through the
    // AVG portrait pipeline);`_RefreshDialogBackground` for type 2.
    if ((input.type === 3 || input.type === 1) && input.name) {
      const texture = await this.loadTexture(input);
      if (texture) {
        dialog.charImage.texture = texture;
        dialog.charImage.scale.set(1);
        // icharpos/icharscale(CutinParam.extra.dialog → _ApplyDialogCharLayout
        // Override):对 img_char 的位置/缩放覆盖;y 翻转,基准保持 prefab 布局。
        if (input.dialogCharPos)
          dialog.charImage.position.set(
            input.dialogCharPos.x,
            520 - input.dialogCharPos.y,
          );
        if (input.dialogCharScale)
          dialog.charImage.scale.set(
            input.dialogCharScale.x,
            input.dialogCharScale.y,
          );
      } else {
        this.onWarning?.(`interlude dialog avatar is missing: ${input.name}`);
      }
    } else if (input.type === 2 && input.name) {
      const texture = await this.loadTexture(input);
      if (texture) {
        // native SetNativeSize:换图后用贴图原生尺寸。
        dialog.bgImage.texture = texture;
        dialog.bgImage.scale.set(1);
      } else {
        this.onWarning?.(
          `interlude dialog background is missing: ${input.name}`,
        );
      }
    }
    // Native dialog show has no AppendInterval floor: completion is the intro
    // tween (style 3, remapped to the command `duration`) or immediate.
    if (created && input.block && input.style === 3 && input.durationMs > 0)
      await this.tween(input.durationMs, () => {});
  }

  /**
   * `direction=rin/lin`:`_TryPlayAnimation` 对元素 DOKill 后由通道
   * animWrapper 播 avg_cutin_hori_{right,left}_in_chanel(2.083s 的 scale 弹
   * 入 + poz 漂移 + alpha 包络)。带 name 时元素资源照 SetCutinElement 的同
   * 步段落挂上(即时姿态),但不跑 tween。
   */
  private async runDirection(
    state: ChannelState,
    input: InterludeInput,
    direction: "rin" | "lin",
    created: boolean,
  ): Promise<void> {
    if (input.name && !state.elements.get(elementKeyFor(input))) {
      const texture = await this.loadTexture(input);
      if (texture) {
        const element = new Container();
        const sprite = new Sprite(texture);
        sprite.anchor.set(0.5);
        element.addChild(sprite);
        (input.type === 2 ? state.bkgPoz : state.charPoz).addChild(element);
        state.elements.set(elementKeyFor(input), element);
        element.alpha = Math.max(input.alphaFrom, 0);
        if (input.positionFrom)
          element.position.set(input.positionFrom.x, -input.positionFrom.y);
        if (input.scaleFrom)
          element.scale.set(input.scaleFrom.x, input.scaleFrom.y);
        if (input.switchSet) element.visible = input.switchOn;
      }
    }
    // _TryPlayAnimation 命中:native 只 DOKill **参数映射出的那一个元素**
    // (`_GetImgElementByParam(param)`,type 2 → bg、type 3 → 缓存槽、type 1
    // → slot),同通道其它元素的进行中 tween 不受影响,由 animWrapper clip
    // 接管目标元素的姿态。
    const target = state.elements.get(elementKeyFor(input));
    if (target) nextElementSession(target);
    const nodes = {
      alphaTarget: state.root,
      bkgScale: state.bkgScale,
      bkgPoz: state.bkgPoz,
      charScale: state.charScale,
      charPoz: state.charPoz,
    };
    const seconds = CLIP_SECONDS.direction;
    const directionId = ++state.directionId;
    const apply = (t: number) => applyDirectionClip(nodes, direction, t);
    apply(0);
    const run = this.tween(seconds * 1000, (progress) => {
      if (state.directionId !== directionId) return;
      apply(progress * seconds);
    });
    if (created && input.block) {
      const show = this.tween(this.showMs(input.style), () => {});
      await Promise.all([show, run]);
    } else if (input.block) {
      // Native 在该分支不挂完成回调(阻塞命令会悬挂);Web 在动画结束时完成。
      await run;
    } else {
      void run;
    }
  }

  /** 模板路径:ratio 作用于模板根(m 连带 mask 一起缩放);回落路径重画矩形。 */
  private applyRatio(state: ChannelState): void {
    if (state.template && !state.fallbackMask) {
      state.template.root.scale.set(state.ratio.x, state.ratio.y);
      return;
    }
    state.maskGraphics
      .clear()
      .rect(
        (-state.size.x * state.ratio.x) / 2,
        (-state.size.y * state.ratio.y) / 2,
        state.size.x * state.ratio.x,
        state.size.y * state.ratio.y,
      )
      .fill(0xff_ff_ff);
  }

  /**
   * Native CutinTemplateDecoView 的文字(`text_name`,18px #323232 右对齐);
   * 回落路径无 prefab,沿用旧样式。
   */
  private makeLabel(charName: string): Text {
    const label = new Text({
      style: new TextStyle({ fill: 0xff_ff_ff, fontSize: 24 }),
      text: charName,
    });
    label.label = "interlude-char";
    label.anchor.set(0.5);
    return label;
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
      const sessionId = ++state.sessionId;
      state.templateSessionId += 1;
      state.clipSessionId += 1;
      state.directionId += 1;
      // Native OnCutinEnd DOKills every element tween(_leftChar/_rightChar/
      // _middleChar、_imgBg,最后 _animWrapper)before the hide tween runs;
      // element sessions die with the channel too.
      for (const element of state.elements.values())
        nextElementSession(element);
      // Native HideCutinMask style 0: DOScale from the current scale to tsTo
      // over tsduration (tsFrom is not reused); other styles DOFade the mask
      // image — the visuals layer approximates it (fading the template root
      // would break the PIXI mask while the clip is still running).
      const styleFade =
        input.style !== 0 && state.template && !state.fallbackMask;
      const from = { ...state.ratio };
      const to = input.templateSizeTo;
      const fadeTo = input.alphaTo >= 0 ? input.alphaTo : 0;
      const fadeFrom = state.template ? state.template.visuals.alpha : 1;
      const run = this.tween(
        styleFade ? input.alphaDurationMs : input.templateSizeDurationMs,
        (progress) => {
          if (state.sessionId !== sessionId) return;
          if (styleFade) {
            state.template!.visuals.alpha = lerp(fadeFrom, fadeTo, progress);
          } else {
            state.ratio = {
              x: lerp(from.x, to.x, progress),
              y: lerp(from.y, to.y, progress),
            };
            this.applyRatio(state);
          }
        },
        () => {
          state.root.destroy({ children: true });
          this.channels.delete(channel);
        },
      );
      if (input.block) await run;
      else void run;
    });
    if (input.block) await Promise.all(tasks);
  }
}
