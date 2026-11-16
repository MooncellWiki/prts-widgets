import { Container, Graphics } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type CharacterCutinFadeStyle,
  type CharacterCutinInput,
} from "../../types";
import { CharacterSlotView } from "../characters/CharacterSlotView";
import { dotweenDefaultEase } from "../core/DotweenEase";

import type {
  CharacterArt,
  CharacterArtLoad,
} from "../characters/CharacterArt";
import type { TweenHandle, TweenRunner } from "../core/TweenRunner";

type SlotTween = (
  durationMs: number,
  update: (progress: number) => void,
  options?: { onComplete?: () => void; target?: object },
) => void;

/**
 * `AVGCharacterCutinSlot.FadeStyle` ordinals. The vertical members spell
 * `bottom` correctly in native -- a misspelled value silently degrades to
 * `fade` (enum default 0) on both sides.
 */
const FADE_STYLE_IDS: Record<CharacterCutinFadeStyle, number> = {
  fade: 0,
  horiz_expand_center: 1,
  horiz_expand_left2right: 2,
  horiz_expand_right2left: 3,
  vert_expand_center: 4,
  vert_expand_top2bottom: 5,
  vert_expand_bottom2top: 6,
};

function fadeStyleId(style: CharacterCutinInput["fadeStyle"]): number {
  return style ? (FADE_STYLE_IDS[style] ?? 0) : 0;
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

/** `_defaultSlotWidth`, the serialized fallback behind the `width` key. */
const DEFAULT_SLOT_WIDTH = 200;

interface CutinLayout {
  contentX: number;
  contentY: number;
  maskH: number;
  maskW: number;
  rootX: number;
  rootY: number;
  zoom: number;
}

interface CutinSlotState {
  /** `_defualtBackground` port: the #898989 strip behind the character. */
  backdrop: Graphics;
  /** `_characterSlot` identity of the last Set, used to skip no-op crossfades. */
  charIdentity: string;
  portrait: CharacterSlotView;
  /** `_zoomAndPovRectTransform` port, positioned in the slot root. */
  content: Container;
  /** _zoomAndPovRectTransform.anchoredPosition relative to the mask center. */
  pov: { x: number; y: number };
  /** `m_showFadeStyle` is set by Show and read by Hide (2791 @ 0x184203800). */
  readonly fadeStyle: number;
  mask: Graphics;
  /** Current mask size; the expand animations tween this instead of the sprite. */
  maskSize: { h: number; w: number };
  /** `_offsetTransform` port: the slot center sits at screen center + offset. */
  root: Container;
  /** A cache miss can leave the slot allocated before its first tween starts. */
  hasStarted: boolean;
  artWait?: ExecutionHandle;
  /** The pivot's offset from the center, as a fraction of the entry size. */
  readonly maskPivot: { x: number; y: number };
  readonly entryMaskSize: { h: number; w: number };
}

/**
 * Native port: `Torappu.AVG.AVGCharacterCutinPanel` /
 * `Torappu.AVG.AVGCharacterCutinSlot`, re-verified against build 2761
 * (2.7.61) GameAssembly.dll via IDA:
 *
 * - `GetExecutors` @ 0x183e48f70 registers `charactercutin` ->
 *   `_ExecuteCharacterCutin` @ 0x183e49440, whose five branches reduce to
 *   show / update / hide by (widgetID present in `_slots`, `name` empty).
 * - `AVGCharacterCutinSlot.Show` @ 0x183eb1320 renders the character at its
 *   original size and crops it with `_maskRectTransform` sized
 *   `width x _offsetTransform.rect.height` (the full 720-tall canvas under
 *   the default `align=HORIZONTAL`). The slot center sits at screen center +
 *   (offsetx, offsety). Expand fade styles tween the mask rect from zero
 *   (pivot pinned at the expansion edge), never the character scale.
 * - `AVGCharacterCutinSlot.SlotUpdate` @ 0x183eb20a0 does NOT replay the
 *   entry animation: it captures the current sizeDelta / offset position /
 *   zoom scale / pov anchoredPosition and interpolates the whole layout to
 *   the new values over `animateRatio * fadetime`, while
 *   `AVGCharacterSlot.Set(name, duration, ...)` crossfades the character.
 * - `AVGCharacterCutinSlot.Hide` @ 0x183eb0d80 reverses along the stored
 *   `m_showFadeStyle` (alpha for `fade`, mask collapse for expand styles);
 *   the completion callback `b__0` @ 0x183e62c90 then recycles the slot and
 *   removes the widgetID from `_slots`.
 *
 * Web adaptation: the Unity RectTransform hierarchy (offset -> mask ->
 * zoomAndPov -> character) becomes nested PIXI containers with a Graphics
 * mask; DOTween becomes the shared TweenRunner. This panel has no background
 * layer (`background`/`backgroundOffset` are unused by the story corpus).
 */
export class CharacterCutinPanel {
  private readonly slots = new Map<string, CutinSlotState>();
  private readonly waits = new Map<ExecutionHandle, string>();
  private readonly targetlessTweens = new Map<TweenHandle, string>();

  constructor(
    private readonly layer: Container,
    private readonly loadPortrait: (
      input: CharacterCutinInput,
    ) => CharacterArtLoad,
    private readonly tweens: Pick<TweenRunner, "start" | "killTarget">,
  ) {}

  run(
    input: CharacterCutinInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const current = this.slots.get(input.widgetId);
    // Empty name hides an existing slot, or finishes synchronously when the
    // widgetID is absent (2791 _ExecuteCharacterCutin @ 0x18419ECB0).
    if (!input.characterKey && !input.characterMissing) {
      if (!current) return;
      return this.runSlot(
        current,
        input,
        null,
        (_, tween) => {
          this.hideSlot(input, current, tween);
        },
        onComplete,
      );
    }

    const state = current?.hasStarted ? current : undefined;
    // A superseded cache miss has only seeded an invisible entry pose.
    if (current && !state) this.destroySlot(input.widgetId, current);
    const layout = layoutFor(input);
    const slot = state ?? this.createSlot(input.widgetId, layout, input);
    const keepsArt =
      !input.characterMissing &&
      `${input.characterKey}/${input.expression}` === slot.charIdentity;
    const art =
      keepsArt || input.characterMissing ? null : this.loadPortrait(input);
    return this.runSlot(
      slot,
      input,
      art,
      (texture, tween) => {
        if (state) this.updateSlot(input, state, texture, keepsArt, tween);
        else this.showSlot(input, slot, layout, texture, tween);
      },
      onComplete,
    );
  }

  clear(widgetId?: string): void {
    for (const [animation, owner] of this.waits) {
      if (widgetId === undefined || widgetId === owner) animation.end("reset");
    }
    for (const [tween, owner] of this.targetlessTweens) {
      if (widgetId === undefined || widgetId === owner) tween.kill();
    }
    if (widgetId === undefined) {
      for (const [id, state] of this.slots) this.destroySlot(id, state);
      return;
    }

    const state = this.slots.get(widgetId);
    if (state) this.destroySlot(widgetId, state);
  }

  destroy(): void {
    this.clear();
  }

  private runSlot(
    state: CutinSlotState,
    input: CharacterCutinInput,
    art: CharacterArtLoad,
    play: (art: CharacterArt | null, tween: SlotTween) => void,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    // Supersede an unresolved Web asset load. Once started, 2791 Show,
    // SlotUpdate and Hide each keep their own tween and completion.
    state.artWait?.end("reset");
    const animation = createExecutionHandle(true, () =>
      this.waits.delete(animation),
    );
    this.waits.set(animation, input.widgetId);
    const start = (art: CharacterArt | null) => {
      if (state.root.destroyed || animation.endReason !== undefined) return;
      state.artWait = undefined;
      state.hasStarted = true;
      play(art, (duration, update, options) => {
        // Show, SlotUpdate and Hide use the bundled DOTweenSettings' OutQuad
        // and attach OnComplete even at zero fade time (2791 @ 0x184203DA0 /
        // 0x184204B20 / 0x184203800).
        let handle: TweenHandle | undefined;
        const forget = () => {
          if (handle) this.targetlessTweens.delete(handle);
        };
        handle = this.tweens.start(
          duration,
          (progress) => {
            if (!state.root.destroyed) update(progress);
          },
          {
            deferZeroDuration: true,
            ease: dotweenDefaultEase,
            // OnRecycle calls DOKill(false) (2791 @ 0x184203D50). The
            // command keeps waiting until its callback or a playback reset.
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
          },
        );
        // Reset ends targetless tweens too, including ones whose slots
        // have already been recycled by a shorter hide.
        if (!options?.target && handle.endReason === undefined)
          this.targetlessTweens.set(handle, input.widgetId);
      });
      // A cache miss waits for the slot setup. A nonblocking command then
      // advances while the slot's tween keeps running.
      if (!input.block) animation.end();
    };
    if (art instanceof Promise) {
      state.artWait = animation;
      void art
        .catch(() => null)
        .then(start)
        .catch((error: unknown) => {
          animation.fail(error);
        });
    } else {
      start(art);
    }
    return animation.endReason === "complete" ? undefined : animation;
  }

  private showSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    layout: CutinLayout,
    art: CharacterArt | null,
    tween: SlotTween,
  ): void {
    // AVGCharacterSlot.Set(name, 0.0, white) swaps the sprite instantly.
    this.setPortrait(state, input, art, 1);

    if (state.fadeStyle === 0) {
      // Fade the canvas group with the mask already at full size.
      tween(
        input.fadeMs,
        (progress) => {
          state.root.alpha = progress;
        },
        { target: state.root },
      );
      return;
    }

    // Expand styles keep alpha at 1 and grow the mask from the pivot edge.
    const start = { ...state.maskSize };
    const entryPosition =
      state.maskPivot.x || state.maskPivot.y
        ? { x: layout.contentX, y: layout.contentY }
        : undefined;
    tween(
      input.fadeMs,
      (progress) => {
        state.maskSize.h = lerp(start.h, layout.maskH, progress);
        state.maskSize.w = lerp(start.w, layout.maskW, progress);
        this.drawMask(state, entryPosition);
      },
      { target: this.maskTweenTarget(state) },
    );
  }

  private updateSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    art: CharacterArt | null,
    keepsArt: boolean,
    tween: SlotTween,
  ): void {
    // SlotUpdate (2791 @ 0x184204B20) captures both sizeDelta axes as
    // integers. With default horizontal alignment, width sets only x.
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
    const layout = layoutFor(input, start);

    if (!keepsArt) this.crossfadeCharacter(input, state, art);

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

  /** AVGCharacterSlot.Set owns the portrait tween separately from SlotUpdate's layout. */
  private crossfadeCharacter(
    input: CharacterCutinInput,
    state: CutinSlotState,
    art: CharacterArt | null,
  ): void {
    const { front, isAlive, outgoing } = this.setPortrait(state, input, art, 0);
    this.tweens.start(
      input.fadeMs,
      (progress) => {
        if (!isAlive()) return;
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
    // Hide reverses m_showFadeStyle. Its callback recycles the slot before
    // releasing the command (2791 _ExecuteCharacterCutin_b__0 @ 0x1841B5EF0).
    const recycle = () => this.destroySlot(input.widgetId, state);
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

    const horizontal = state.fadeStyle >= 1 && state.fadeStyle <= 3;
    const size = { ...state.maskSize };
    const end = horizontal ? { h: size.h, w: 0 } : { h: 0, w: size.w };
    // 2791 Hide @ 0x184203800 uses DOSizeDelta for center styles, sampling
    // the live size on its first update. The directional setters capture
    // the size when the command executes.
    const centered = state.fadeStyle === 1 || state.fadeStyle === 4;
    let start = centered ? undefined : size;
    const exitPosition = centered
      ? undefined
      : { x: state.content.x, y: state.content.y };
    tween(
      input.fadeMs,
      (progress) => {
        start ??= { ...state.maskSize };
        state.maskSize.h = lerp(start.h, end.h, progress);
        state.maskSize.w = lerp(start.w, end.w, progress);
        this.drawMask(state, exitPosition);
      },
      { onComplete: recycle, target: this.maskTweenTarget(state) },
    );
  }

  /** Show/Hide use DOSizeDelta for centre styles and DOTween.To for directional styles. */
  private maskTweenTarget(state: CutinSlotState): Graphics | undefined {
    return state.fadeStyle === 1 || state.fadeStyle === 4
      ? state.mask
      : undefined;
  }

  private createSlot(
    widgetId: string,
    layout: CutinLayout,
    input: CharacterCutinInput,
  ): CutinSlotState {
    // Pool allocation equivalent: GameObjectPool.Allocate zeroes the
    // anchoredPosition, then Show's layout math positions everything.
    const root = new Container();
    root.position.set(layout.rootX, layout.rootY);
    // _defualtBackground: sprite_white tinted (0.537, 0.537, 0.537) = #898989,
    // active whenever the command has no `background` key (Show flips the two
    // nodes around). It sits under `mask` beside -- not inside --
    // _zoomAndPovRectTransform, so zoom/pov never move it; the mask clips the
    // full-canvas rect into the gray strip behind the character. Its `header`
    // child (black, 70% alpha, anchored +50 above the top edge) lands outside
    // the 720-tall mask and never shows.
    const backdrop = new Graphics()
      .rect(-STORY_WIDTH / 2, -STORY_HEIGHT / 2, STORY_WIDTH, STORY_HEIGHT)
      .fill(0x89_89_89);
    const content = new Container();
    content.scale.set(layout.zoom);
    const mask = new Graphics();
    root.addChild(mask, backdrop, content);
    root.mask = mask;
    this.layer.addChild(root);

    const fadeStyle = fadeStyleId(input.fadeStyle);
    const state: CutinSlotState = {
      backdrop,
      charIdentity: "",
      // Show places _characterSlot at the bottom of the mask (2791
      // @ 0x184203DA0). SlotUpdate leaves this local position alone.
      portrait: new CharacterSlotView(
        content,
        input.charOffsetX ?? 0,
        layout.maskH / 2 - (input.charOffsetY ?? 0),
      ),
      content,
      pov: { x: layout.contentX, y: layout.contentY },
      fadeStyle,
      hasStarted: false,
      mask,
      maskSize: { h: layout.maskH, w: layout.maskW },
      root,
      maskPivot: {
        x: fadeStyle === 2 ? -0.5 : fadeStyle === 3 ? 0.5 : 0,
        y: fadeStyle === 5 ? -0.5 : fadeStyle === 6 ? 0.5 : 0,
      },
      entryMaskSize: { h: layout.maskH, w: layout.maskW },
    };
    // Entry state, seeded before the caller awaits the character texture:
    // `fade` starts transparent with a full-size mask, the expand styles keep
    // alpha = 1 and start from a zero-extent mask. Without this the slot would
    // render at full size for the frames the texture request takes.
    if (state.fadeStyle === 0) root.alpha = 0;
    else {
      const horizontal = state.fadeStyle >= 1 && state.fadeStyle <= 3;
      state.maskSize = {
        h: horizontal ? layout.maskH : 0,
        w: horizontal ? 0 : layout.maskW,
      };
    }
    this.drawMask(state);
    this.slots.set(widgetId, state);
    return state;
  }

  private setPortrait(
    state: CutinSlotState,
    input: CharacterCutinInput,
    art: CharacterArt | null,
    alpha: number,
  ) {
    const swap = state.portrait.swap(art, alpha);
    state.charIdentity = swap.front
      ? `${input.characterKey}/${input.expression}`
      : "";
    return swap;
  }

  private destroySlot(widgetId: string, state: CutinSlotState): void {
    if (this.slots.get(widgetId) !== state) return;
    this.slots.delete(widgetId);
    state.artWait?.end("reset");
    // 2791 OnRecycle (0x184203D50) kills the CanvasGroup and mask RectTransform.
    this.tweens.killTarget(state.root);
    this.tweens.killTarget(state.mask);
    state.root.destroy({ children: true });
  }

  private drawMask(
    state: CutinSlotState,
    fixedContentPosition?: { x: number; y: number },
  ): void {
    const { h, w } = state.maskSize;
    // 2791 Show sets the mask pivot and its position (0x184203DA0).
    // SlotUpdate (0x184249B00) resizes around that pivot. The anchored POV
    // follows the mask center. Directional Show/Hide compensate for its move.
    const centerX = state.maskPivot.x * (state.entryMaskSize.w - w);
    const centerY = state.maskPivot.y * (state.entryMaskSize.h - h);
    if (fixedContentPosition) {
      state.pov.x = fixedContentPosition.x - centerX;
      state.pov.y = fixedContentPosition.y - centerY;
    }
    state.content.position.set(centerX + state.pov.x, centerY + state.pov.y);
    state.mask
      .clear()
      .rect(centerX - w / 2, centerY - h / 2, w, h)
      .fill(0xff_ff_ff);
  }
}

/**
 * Geometry port of `AVGCharacterCutinSlot.Show` @ 0x183eb1320 (build 2761):
 * the mask is `width x _offsetTransform.rect.height` under the default
 * `align = HORIZONTAL` (the vertical align flavor is unused by the corpus),
 * the slot center sits at screen center + (offsetx, offsety),
 * `_zoomAndPovRectTransform` gets localScale = `zoom` (renamed from `scale`
 * in 2.7.61) and anchoredPosition = (-povX, -povY). Unity's y-up local space
 * is flipped to PIXI's y-down coordinates here. (`charOffsetX`/`charOffsetY`
 * live on the slot node instead -- see `CutinSlotState.charSlot*`.)
 *
 * `current` carries the SlotUpdate flavour @ 0x183eb20a0: there every key is
 * read with the slot's live transform as its `GetFloat`/`GetInt` default
 * (`GetInt(param, "width", (int)sizeDelta.x)`, `GetFloat(param, "offsetx",
 * localPosition.x)`, ...), so an omitted key holds rather than resets. Show
 * has no such slot state yet and falls back to the serialized prefab values.
 *
 * One native quirk is deliberately not ported: SlotUpdate computes povX as
 * `-GetFloat("povX", anchoredPosition.x)`, and since anchoredPosition.x is
 * already `-povX`, omitting the key flips its sign every update. Holding the
 * current value is what the key's own default was reaching for; no corpus
 * line hits the difference (0 SlotUpdates omit a pov the Show had set).
 */
function layoutFor(
  input: CharacterCutinInput,
  current?: CutinLayout,
): CutinLayout {
  const fallback = current ?? {
    contentX: 0,
    contentY: 0,
    maskH: STORY_HEIGHT,
    maskW: DEFAULT_SLOT_WIDTH,
    rootX: STORY_WIDTH / 2,
    rootY: STORY_HEIGHT / 2,
    zoom: 1,
  };
  return {
    contentX: input.povX === undefined ? fallback.contentX : -input.povX,
    contentY: input.povY === undefined ? fallback.contentY : input.povY,
    maskH: fallback.maskH,
    maskW: input.width ?? fallback.maskW,
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
