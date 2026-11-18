import { Container, Graphics, Sprite, Texture } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import { ShowItemFadeStyle } from "../../showitem";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type CharacterCutinInput,
} from "../../types";
import { CharacterSlotView } from "../characters/CharacterSlotView";
import { dotweenDefaultEase } from "../core/DotweenEase";

import type {
  CharacterArt,
  CharacterArtLoad,
} from "../characters/CharacterArt";
import type { TextureLoad } from "../core/TextureAsset";
import type { TweenHandle, TweenRunner } from "../core/TweenRunner";

type SlotTween = (
  durationMs: number,
  update: (progress: number) => void,
  options?: { onComplete?: () => void; target?: object },
) => void;

function hasFadeTween(style: number): boolean {
  return ShowItemFadeStyle[style] !== undefined;
}

function characterIdentity(input: CharacterCutinInput): string {
  return input.characterRef ?? `${input.characterKey}/${input.expression}`;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** `_defaultSlotWidth`, the serialized fallback behind the `width` key. */
const DEFAULT_SLOT_WIDTH = 200;
/** 2791 tints both background Images to this color in slot_character_cutin. */
const BACKGROUND_TINT = 0x89_89_89;

interface CutinLayout {
  contentX: number;
  contentY: number;
  maskH: number;
  maskW: number;
  rootX: number;
  rootY: number;
  zoom: number;
}

interface SlotAssets {
  art: CharacterArt | null;
  background: Texture | null;
  header: Texture | null;
}

interface CutinSlotState {
  /** `_defualtBackground` port: the #898989 strip behind the character. */
  backdrop: Container;
  header: Sprite;
  /** `_backgroundRectTransform` and its header share the background offset. */
  backgroundRoot: Container;
  backgroundImage: Sprite;
  /** `_characterSlot` identity of the last Set, used to skip no-op crossfades. */
  charIdentity: string;
  portrait: CharacterSlotView;
  /** `_zoomAndPovRectTransform` port, positioned in the slot root. */
  content: Container;
  /** _zoomAndPovRectTransform.anchoredPosition relative to the mask center. */
  pov: { x: number; y: number };
  /** `m_showFadeStyle` is set by Show and read by Hide (2791 @ 0x184203800). */
  fadeStyle: number;
  /** `m_align` is set by Show and read by SlotUpdate (2791 @ 0x184204B20). */
  align: number;
  mask: Graphics;
  /** Current mask size; the expand animations tween this instead of the sprite. */
  maskSize: { h: number; w: number };
  /** `_offsetTransform` port: the slot center sits at screen center + offset. */
  root: Container;
  /** A cache miss can leave the slot allocated before its first tween starts. */
  hasStarted: boolean;
  assetWait?: ExecutionHandle;
  /** The pivot's offset from the center, as a fraction of the mask size. */
  maskPivot: { x: number; y: number };
  /** The mask pivot's localPosition in the slot, retained across reuse. */
  maskPosition: { x: number; y: number };
}

/**
 * Native port: `Torappu.AVG.AVGCharacterCutinPanel` /
 * `Torappu.AVG.AVGCharacterCutinSlot` in build 2791 GameAssembly.dll.
 *
 * - `GetExecutors` @ 0x18419E7E0 registers `charactercutin` ->
 *   `_ExecuteCharacterCutin` @ 0x18419ECB0, whose five branches reduce to
 *   show / update / hide by (widgetID present in `_slots`, `name` empty).
 * - `AVGCharacterCutinSlot.Show` @ 0x184203DA0 renders the character at its
 *   original size and crops it with `_maskRectTransform` sized
 *   `width x _offsetTransform.rect.height` (the full 720-tall canvas under
 *   the default `align=HORIZONTAL`). The slot center sits at screen center +
 *   (offsetx, offsety). Expand fade styles tween the mask rect from zero
 *   (pivot pinned at the expansion edge), never the character scale.
 * - `AVGCharacterCutinSlot.SlotUpdate` @ 0x184204B20 does NOT replay the
 *   entry animation: it captures the current sizeDelta / offset position /
 *   zoom scale / pov anchoredPosition and interpolates the whole layout to
 *   the new values over `animateRatio * fadetime`, while
 *   `AVGCharacterSlot.Set(name, duration, ...)` crossfades the character.
 * - `AVGCharacterCutinSlot.Hide` @ 0x184203800 reverses along the stored
 *   `m_showFadeStyle` (alpha for `fade`, mask collapse for expand styles);
 *   the completion callback `b__0` @ 0x1841B5EF0 then recycles the slot and
 *   removes the widgetID from `_slots`.
 *
 * Web adaptation: nested Pixi containers and a Graphics mask reproduce the
 * Unity RectTransforms. DOTween becomes the shared TweenRunner.
 */
export class CharacterCutinPanel {
  private readonly slots = new Map<string, CutinSlotState>();
  /** The pool owns these views independently of the widget ID dictionary. */
  private readonly slotViews = new Set<CutinSlotState>();
  private readonly recycledSlots: CutinSlotState[] = [];
  private readonly waits = new Map<ExecutionHandle, string>();
  private readonly commandTweens = new Map<TweenHandle, string>();

  constructor(
    private readonly layer: Container,
    private readonly loadPortrait: (
      input: CharacterCutinInput,
    ) => CharacterArtLoad,
    private readonly loadBackground: (key: string) => TextureLoad,
    private readonly loadHeader: () => TextureLoad,
    private readonly tweens: Pick<TweenRunner, "start" | "killTarget">,
  ) {}

  run(
    input: CharacterCutinInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const current = this.slots.get(input.widgetId);
    // Empty name hides an existing slot, or finishes synchronously when the
    // widgetID is absent (2791 _ExecuteCharacterCutin @ 0x18419ECB0).
    if (
      !input.characterKey &&
      !input.characterMissing &&
      !input.invalidCharacterRef
    ) {
      if (!current) return;
      return this.runSlot(
        current,
        input,
        [null, null, null],
        (_assets, tween) => {
          this.hideSlot(input, current, tween);
        },
        onComplete,
      );
    }

    const state = current?.hasStarted ? current : undefined;
    // A superseded cache miss has only allocated its hidden view.
    if (current && !state) this.recycleSlot(current);
    const align =
      typeof input.align === "string"
        ? { horizontal: 0, vertical: 1 }[input.align]
        : (input.align ?? 0);
    const layout = layoutFor(input, align);
    const slot = state ?? this.allocateSlot(input, align);
    const keepsArt =
      !input.characterMissing && characterIdentity(input) === slot.charIdentity;
    const art =
      keepsArt || input.characterMissing || input.invalidCharacterRef
        ? null
        : this.loadPortrait(input);
    const background =
      !state && !input.invalidCharacterRef && input.backgroundKey
        ? this.loadBackground(input.backgroundKey)
        : null;
    const header =
      state || input.invalidCharacterRef ? null : this.loadHeader();
    return this.runSlot(
      slot,
      input,
      [art, background, header],
      (assets, tween) => {
        // AVGCharacterSlot.Set compares the raw name even on a pooled Show.
        // Show uses duration zero, so a new portrait fades in on its first update.
        if (!keepsArt && input.invalidCharacterRef)
          throw new Error(
            `charactercutin portrait exceeds its sprite hub bounds: ${input.characterRef}`,
          );
        if (!keepsArt)
          this.fadePortrait(input, slot, assets.art, state ? input.fadeMs : 0);
        if (state) this.updateSlot(input, state, tween);
        else this.showSlot(input, slot, layout, assets, tween);
      },
      onComplete,
    );
  }

  clear(widgetId?: string): void {
    for (const [animation, owner] of this.waits) {
      if (widgetId === undefined || widgetId === owner) animation.end("reset");
    }
    for (const [tween, owner] of this.commandTweens) {
      if (widgetId === undefined || widgetId === owner) tween.kill();
    }
    if (widgetId === undefined) {
      for (const state of this.slotViews) this.destroySlot(state);
      this.slots.clear();
      this.recycledSlots.length = 0;
      return;
    }

    const state = this.slots.get(widgetId);
    if (!state) return;
    for (const [id, slot] of this.slots) {
      if (slot === state) this.slots.delete(id);
    }
    const poolIndex = this.recycledSlots.indexOf(state);
    if (poolIndex >= 0) this.recycledSlots.splice(poolIndex, 1);
    this.destroySlot(state);
  }

  destroy(): void {
    this.clear();
  }

  private runSlot(
    state: CutinSlotState,
    input: CharacterCutinInput,
    [art, background, header]: [CharacterArtLoad, TextureLoad, TextureLoad],
    play: (assets: SlotAssets, tween: SlotTween) => void,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    // Supersede an unresolved Web asset load. Once started, 2791 Show,
    // SlotUpdate and Hide each keep their own tween and completion.
    state.assetWait?.end("reset");
    const animation = createExecutionHandle(true, () =>
      this.waits.delete(animation),
    );
    this.waits.set(animation, input.widgetId);
    const start = (assets: SlotAssets) => {
      if (state.root.destroyed || animation.endReason !== undefined) return;
      state.assetWait = undefined;
      state.root.renderable = true;
      state.hasStarted = true;
      play(assets, (duration, update, options) => {
        // Show, SlotUpdate and Hide use the bundled DOTweenSettings' OutQuad
        // and attach OnComplete even at zero fade time (2791 @ 0x184203DA0 /
        // 0x184204B20 / 0x184203800).
        let handle: TweenHandle | undefined;
        const forget = () => {
          if (handle) this.commandTweens.delete(handle);
        };
        handle = this.tweens.start(duration, update, {
          deferZeroDuration: true,
          ease: dotweenDefaultEase,
          isAlive: () => !state.root.destroyed,
          onCancel: forget,
          onComplete: () => {
            forget();
            options?.onComplete?.();
            if (input.block && animation.endReason === undefined) {
              animation.end();
              onComplete?.();
            }
          },
          target: options?.target,
        });
        // Reset also ends commands that still own a tween on a pooled slot.
        if (handle.endReason === undefined)
          this.commandTweens.set(handle, input.widgetId);
      });
      // A cache miss waits for the slot setup. A nonblocking command then
      // advances while the slot's tween keeps running.
      if (!input.block) animation.end();
    };
    if (
      art instanceof Promise ||
      background instanceof Promise ||
      header instanceof Promise
    ) {
      // A fresh native Show is synchronous. Keep its entire prefab offscreen until ready.
      if (!state.hasStarted) state.root.renderable = false;
      state.assetWait = animation;
      void Promise.allSettled([art, background, header])
        .then(([portrait, bg, decoration]) => {
          start({
            art: portrait.status === "fulfilled" ? portrait.value : null,
            background: bg.status === "fulfilled" ? bg.value : null,
            header: decoration.status === "fulfilled" ? decoration.value : null,
          });
        })
        .catch((error: unknown) => {
          animation.fail(error);
        });
    } else {
      try {
        start({ art, background, header });
      } catch (error) {
        animation.fail(error);
      }
    }
    return animation.endReason === "complete" ? undefined : animation;
  }

  private showSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    layout: CutinLayout,
    { background, header }: SlotAssets,
    tween: SlotTween,
  ): void {
    // Show (2791 @ 0x184203DA0) fits the Sprite rect to the mask's cross
    // axis and applies backgroundOffset along its main axis.
    const { backdrop, backgroundImage, backgroundRoot } = state;
    // Show sets both mask dimensions, zoom and POV before it reads the background Sprite.
    state.maskSize = { h: layout.maskH, w: layout.maskW };
    state.content.scale.set(layout.zoom);
    state.pov = { x: layout.contentX, y: layout.contentY };
    this.drawMask(state);
    backdrop.visible = !input.backgroundKey;
    backgroundImage.visible = Boolean(input.backgroundKey);
    const missingBackground = input.backgroundKey && !background;
    if (missingBackground) {
      // The named branch switches backgrounds, then dereferences Sprite.rect
      // before it starts the entry tween. The panel has already added the slot.
      const { width, height } = backgroundImage;
      backgroundImage.texture = Texture.WHITE;
      backgroundImage.setSize(width, height);
    }
    let backgroundWidth = input.backgroundKey
      ? backgroundImage.width
      : STORY_WIDTH * 2;
    let backgroundHeight = input.backgroundKey
      ? backgroundImage.height
      : STORY_HEIGHT;
    if (background) {
      const offset = input.backgroundOffset ?? 0;
      // An unnamed Align retains the prefab or pooled RectTransform.
      backgroundWidth = backgroundImage.width;
      backgroundHeight = backgroundImage.height;
      backgroundImage.texture = background;
      if (state.align === 1) {
        backgroundWidth = layout.maskW;
        backgroundHeight =
          (layout.maskW * background.height) / Math.max(1, background.width);
        backgroundRoot.position.set(0, -offset);
      } else if (state.align === 0) {
        backgroundWidth =
          (layout.maskH * background.width) / Math.max(1, background.height);
        backgroundHeight = layout.maskH;
        backgroundRoot.position.set(offset, 0);
      }
      backgroundImage.setSize(backgroundWidth, backgroundHeight);
    }
    // Both 2791 background objects have the same stretch-anchored header.
    // Mount it on the visible background so it follows that rect and its POV.
    (input.backgroundKey ? backgroundRoot : backdrop).addChild(state.header);
    state.header.visible = header !== null;
    if (header) {
      state.header.texture = header;
      state.header.position.set(0, -backgroundHeight / 2 - 50);
      state.header.setSize(backgroundWidth, 200);
    }

    if (missingBackground)
      throw new Error(
        `charactercutin background sprite is missing: ${input.backgroundKey}`,
      );

    const style = state.fadeStyle;
    state.root.position.set(layout.rootX, layout.rootY);
    state.portrait.root.position.set(
      input.charOffsetX ?? 0,
      layout.maskH / 2 - (input.charOffsetY ?? 0),
    );
    // Show keeps the layout and leaves its callback unattached for an
    // unnamed ordinal (2791 @ 0x184203DA0).
    if (!hasFadeTween(style)) return;
    state.maskPivot = {
      x: style === 2 ? -0.5 : style === 3 ? 0.5 : 0,
      y: style === 5 ? -0.5 : style === 6 ? 0.5 : 0,
    };
    state.maskSize = {
      h: style >= 4 && style <= 6 ? 0 : layout.maskH,
      w: style >= 1 && style <= 3 ? 0 : layout.maskW,
    };
    state.root.alpha = style === 0 ? 0 : 1;
    this.drawMask(state);
    if (style === 0) {
      // DOFade's getter reads the CanvasGroup after earlier tweens in this update.
      let startAlpha: number | undefined;
      tween(
        input.fadeMs,
        (progress) => {
          startAlpha ??= state.root.alpha;
          state.root.alpha = lerp(startAlpha, 1, progress);
        },
        { target: state.root },
      );
      return;
    }

    // Expand styles keep alpha at 1 and grow the mask from the pivot edge.
    // Show's center styles use DOSizeDelta (2791 @ 0x184203DA0), which reads
    // the start size on its first update, after any older targetless setters.
    const target = this.maskTweenTarget(state);
    let start = target ? undefined : { ...state.maskSize };
    const pivot = state.maskPivot;
    if (!target) {
      // Directional Show writes localPosition. Fade and centered Show
      // retain the previous position across pool reuse.
      state.maskPosition.x = pivot.x * layout.maskW;
      state.maskPosition.y = pivot.y * layout.maskH;
      this.drawMask(state);
    }
    tween(
      input.fadeMs,
      (progress) => {
        start ??= { ...state.maskSize };
        state.maskSize.h = lerp(start.h, layout.maskH, progress);
        state.maskSize.w = lerp(start.w, layout.maskW, progress);
        if (!target) {
          const remaining = 1 - progress;
          state.pov.x = layout.contentX - remaining * pivot.x * layout.maskW;
          state.pov.y = layout.contentY - remaining * pivot.y * layout.maskH;
        }
        this.drawMask(state);
      },
      { target },
    );
  }

  private updateSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    tween: SlotTween,
  ): void {
    // SlotUpdate (2791 @ 0x184204B20) captures both sizeDelta axes as
    // integers and sizes the axis selected by Show.
    const start = {
      contentX: state.pov.x,
      contentY: state.pov.y,
      maskH: Math.trunc(state.maskSize.h),
      maskW: Math.trunc(state.maskSize.w),
      rootX: state.root.x,
      rootY: state.root.y,
      zoom: state.content.scale.x,
    };
    // SlotUpdate reads the live layout before starting its tween.
    const layout = layoutFor(input, state.align, start);

    // SlotUpdate (2791 @ 0x184204B20) uses targetless DOTween.To.
    tween(input.fadeMs, (progress) => {
      state.root.position.set(
        lerp(start.rootX, layout.rootX, progress),
        lerp(start.rootY, layout.rootY, progress),
      );
      state.pov.x = lerp(start.contentX, layout.contentX, progress);
      state.pov.y = lerp(start.contentY, layout.contentY, progress);
      state.content.scale.set(lerp(start.zoom, layout.zoom, progress));
      state.maskSize.h = lerp(start.maskH, layout.maskH, progress);
      state.maskSize.w = lerp(start.maskW, layout.maskW, progress);
      this.drawMask(state);
    });
  }

  /** AVGCharacterSlot.Set (2791 @ 0x184237BC0) owns the portrait tween. */
  private fadePortrait(
    input: CharacterCutinInput,
    state: CutinSlotState,
    art: CharacterArt | null,
    durationMs: number,
  ): void {
    const { front, isAlive, outgoing } = state.portrait.swap(art, 0);
    state.charIdentity = front ? characterIdentity(input) : "";
    if (!front && !outgoing) return;
    this.tweens.start(
      durationMs,
      (progress) => {
        outgoing?.update(progress);
        if (front) front.alpha = progress;
      },
      { deferZeroDuration: true, isAlive, onComplete: outgoing?.finish },
    );
  }

  private hideSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    tween: SlotTween,
  ): void {
    // Hide uses the saved Show ordinal. Recycling is its tween's OnComplete.
    if (!hasFadeTween(state.fadeStyle)) return;
    // _ExecuteCharacterCutin_b__0 (2791 @ 0x1841B5EF0) recycles the
    // captured slot, then removes the captured widget ID.
    const recycle = () => {
      this.recycleSlot(state);
      this.slots.delete(input.widgetId);
    };
    if (state.fadeStyle === 0) {
      let startAlpha: number | undefined;
      tween(
        input.fadeMs,
        (progress) => {
          startAlpha ??= state.root.alpha;
          state.root.alpha = lerp(startAlpha, 0, progress);
        },
        { onComplete: recycle, target: state.root },
      );
      return;
    }

    // Hide resets the CanvasGroup in every expand branch (2791 @ 0x184203800).
    state.root.alpha = 1;
    const horizontal = state.fadeStyle >= 1 && state.fadeStyle <= 3;
    const size = { ...state.maskSize };
    const end = horizontal ? { h: size.h, w: 0 } : { h: 0, w: size.w };
    // 2791 Hide @ 0x184203800 uses DOSizeDelta for center styles, sampling
    // the live size on its first update. The directional setters capture
    // the size when the command executes.
    const target = this.maskTweenTarget(state);
    let start = target ? undefined : size;
    const pov = target ? undefined : { ...state.pov };
    const pivot = state.maskPivot;
    tween(
      input.fadeMs,
      (progress) => {
        start ??= { ...state.maskSize };
        state.maskSize.h = lerp(start.h, end.h, progress);
        state.maskSize.w = lerp(start.w, end.w, progress);
        if (pov) {
          state.pov.x = pov.x - progress * pivot.x * size.w;
          state.pov.y = pov.y - progress * pivot.y * size.h;
        }
        this.drawMask(state);
      },
      { onComplete: recycle, target },
    );
  }

  /** Show/Hide use DOSizeDelta for centre styles and DOTween.To for directional styles. */
  private maskTweenTarget(state: CutinSlotState): Graphics | undefined {
    return state.fadeStyle === 1 || state.fadeStyle === 4
      ? state.mask
      : undefined;
  }

  private allocateSlot(
    input: CharacterCutinInput,
    align: number,
  ): CutinSlotState {
    const fadeStyle =
      typeof input.fadeStyle === "number"
        ? input.fadeStyle
        : (ShowItemFadeStyle[input.fadeStyle ?? "fade"] ??
          ShowItemFadeStyle.fade);
    const recycled = this.recycledSlots.pop();
    // GameObjectPool.Allocate reactivates a physical prefab without resetting
    // its transforms (2791 @ 0x182AB73D0). Only Show writes the entry layout.
    const state = recycled ?? {
      ...this.createSlotView(),
      charIdentity: "",
      align,
      fadeStyle,
      hasStarted: false,
      maskPivot: { x: 0, y: 0 },
      maskSize: { w: DEFAULT_SLOT_WIDTH, h: STORY_HEIGHT },
      pov: { x: 0, y: 0 },
    };
    state.align = align;
    state.fadeStyle = fadeStyle;
    state.hasStarted = false;
    state.root.visible = true;
    this.drawMask(state);
    this.slotViews.add(state);
    this.slots.set(input.widgetId, state);
    return state;
  }

  private createSlotView() {
    const root = new Container({ x: STORY_WIDTH / 2, y: STORY_HEIGHT / 2 });
    // In the 2791 prefab the 2560x720 defaultBackground tracks the mask
    // center. The optional background Image shares the character's zoom and
    // POV, and both are clipped by the same mask.
    const backdrop = new Container();
    const plate = new Graphics()
      .rect(-STORY_WIDTH, -STORY_HEIGHT / 2, STORY_WIDTH * 2, STORY_HEIGHT)
      .fill(BACKGROUND_TINT);
    // Both header objects use sprite_avg_cutscene and a half-turn.
    const header = new Sprite(Texture.EMPTY);
    header.anchor.set(0.5, 1);
    header.rotation = Math.PI;
    header.tint = 0x00_00_00;
    header.alpha = 180 / 255;
    header.visible = false;
    backdrop.addChild(plate, header);
    const backgroundImage = new Sprite(Texture.EMPTY);
    backgroundImage.anchor.set(0.5);
    // 2791 slot_character_cutin / zoomAndpov / background starts at 0 × 720.
    backgroundImage.setSize(0, STORY_HEIGHT);
    backgroundImage.tint = BACKGROUND_TINT;
    backgroundImage.visible = false;
    const backgroundRoot = new Container();
    backgroundRoot.addChild(backgroundImage);
    const content = new Container();
    const mask = new Graphics();
    content.addChild(backgroundRoot);
    root.addChild(mask, backdrop, content);
    root.mask = mask;
    this.layer.addChild(root);
    return {
      backdrop,
      backgroundImage,
      backgroundRoot,
      portrait: new CharacterSlotView(content, 0, 0),
      content,
      header,
      mask,
      maskPosition: { x: 0, y: 0 },
      root,
    };
  }

  private recycleSlot(state: CutinSlotState): void {
    if (!state.root.visible) return;
    // 2791 _slotPool has notificationType=None and the same parent for both
    // states. _RecycleInternal (0x182AB8D30) only deactivates this view.
    // Its portrait, sibling index and every started tween survive the return.
    state.assetWait?.end("reset");
    state.assetWait = undefined;
    state.root.visible = false;
    this.recycledSlots.push(state);
  }

  private destroySlot(state: CutinSlotState): void {
    state.assetWait?.end("reset");
    this.tweens.killTarget(state.root);
    this.tweens.killTarget(state.mask);
    state.root.destroy({ children: true });
    this.slotViews.delete(state);
  }

  private drawMask(state: CutinSlotState): void {
    const { h, w } = state.maskSize;
    // 2791 Show sets the mask pivot and its position (0x184203DA0).
    // SlotUpdate (0x184204B20) resizes around that pivot. The anchored POV
    // follows the mask center. Directional Show/Hide compensate for its move.
    const centerX = state.maskPosition.x - state.maskPivot.x * w;
    const centerY = state.maskPosition.y - state.maskPivot.y * h;
    state.backdrop.position.set(centerX, centerY);
    state.content.position.set(centerX + state.pov.x, centerY + state.pov.y);
    state.mask
      .clear()
      .rect(centerX - w / 2, centerY - h / 2, w, h)
      .fill(0xff_ff_ff);
  }
}

/**
 * AVGCharacterCutinSlot.Show (2791 @ 0x184203DA0) centers the slot at
 * (offsetx, offsety) relative to the screen center. The mask uses width on
 * the aligned axis and the canvas dimension on the other axis. The POV
 * transform gets scale zoom and anchoredPosition (-povX, -povY),
 * with Y flipped for Pixi.
 *
 * SlotUpdate (0x184204B20) uses the live transforms as defaults. It negates
 * the POV parameters after reading them, so each omitted POV axis becomes
 * the negative of its current offset.
 */
function layoutFor(
  input: CharacterCutinInput,
  align: number,
  current?: CutinLayout,
): CutinLayout {
  const fallback = current ?? {
    contentX: 0,
    contentY: 0,
    maskH: align === 1 ? DEFAULT_SLOT_WIDTH : STORY_HEIGHT,
    maskW: align === 0 ? DEFAULT_SLOT_WIDTH : STORY_WIDTH,
    rootX: STORY_WIDTH / 2,
    rootY: STORY_HEIGHT / 2,
    zoom: 1,
  };
  return {
    contentX: -(input.povX ?? fallback.contentX),
    contentY: input.povY ?? -fallback.contentY,
    maskH: align === 1 ? (input.width ?? fallback.maskH) : fallback.maskH,
    maskW: align === 0 ? (input.width ?? fallback.maskW) : fallback.maskW,
    rootX:
      input.offsetX === undefined
        ? fallback.rootX
        : STORY_WIDTH / 2 + input.offsetX,
    rootY:
      input.offsetY === undefined
        ? fallback.rootY
        : STORY_HEIGHT / 2 - input.offsetY,
    zoom: input.zoom ?? fallback.zoom,
  };
}
