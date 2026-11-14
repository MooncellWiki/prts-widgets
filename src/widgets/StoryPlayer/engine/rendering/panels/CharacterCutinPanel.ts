import { Container, Graphics, Sprite, type Texture } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type CharacterCutinFadeStyle,
  type CharacterCutinInput,
} from "../../types";

import type { TweenRunner } from "../core/TweenRunner";

/**
 * Character art plus the AVGCharacterSpriteHub layout the game applies on
 * top of the raw sheet: the Image rect is resized to `size` (here folded
 * into sprite scale) and shifted by `pos` relative to the slot node.
 */
export interface CutinCharacterArt {
  texture: Texture;
  offsetX: number;
  offsetY: number;
  scaleX: number;
  scaleY: number;
}

type CutinArtLoad =
  CutinCharacterArt | null | Promise<CutinCharacterArt | null>;
type SlotTween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
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

interface CutinChar {
  /** AVGCharacterSpriteHub pos of this character, applied on re-layouts. */
  offsetX: number;
  offsetY: number;
  sprite: Sprite;
}

interface CutinSlotState {
  /** `_defualtBackground` port: the #898989 strip behind the character. */
  backdrop: Graphics;
  /** Live character sprites; more than one only during a SlotUpdate crossfade. */
  chars: CutinChar[];
  /** `_characterSlot` identity of the last Set, used to skip no-op crossfades. */
  charIdentity: string;
  /**
   * `_characterSlot.localPosition` port. Only Show writes it -- SlotUpdate
   * @ 0x183eb20a0 never touches the node -- so it survives every update and
   * each sprite hangs off it plus its own AVGCharacterSpriteHub pos.
   */
  charSlotX: number;
  charSlotY: number;
  /** `_zoomAndPovRectTransform` port: scale = zoom, position = (-povX, povY). */
  content: Container;
  /** `m_showFadeStyle`: the last style stored by Show/SlotUpdate, drives Hide. */
  fadeStyle: number;
  mask: Graphics;
  /** Current mask size; the expand animations tween this instead of the sprite. */
  maskSize: { h: number; w: number };
  /** `_offsetTransform` port: the slot center sits at screen center + offset. */
  root: Container;
  animation?: ExecutionHandle;
  /** Final mask size; directional pivots pin against this while expanding. */
  targetSize: { h: number; w: number };
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

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: (input: CharacterCutinInput) => CutinArtLoad,
    private readonly tween: TweenRunner["run"],
  ) {}

  run(
    input: CharacterCutinInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const state = this.slots.get(input.widgetId);
    // Empty name hides an existing slot, or finishes synchronously when the
    // widgetID is absent (2791 _ExecuteCharacterCutin @ 0x18419ECB0).
    if (!input.characterKey && !input.characterMissing) {
      if (!state) return;
      return this.runSlot(
        state,
        input,
        null,
        (_, tween) => {
          this.hideSlot(input, state, tween);
        },
        onComplete,
      );
    }

    const layout = layoutFor(input);
    const slot = state ?? this.createSlot(input.widgetId, layout, input);
    const keepsArt =
      !input.characterMissing &&
      `${input.characterKey}/${input.expression}` === slot.charIdentity;
    const art =
      keepsArt || input.characterMissing ? null : this.loadTexture(input);
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
    if (widgetId === undefined) {
      for (const id of this.slots.keys()) this.clear(id);
      return;
    }

    const state = this.slots.get(widgetId);
    if (!state) return;
    state.animation?.end("reset");
    this.destroySlot(widgetId, state);
  }

  destroy(): void {
    this.clear();
  }

  private runSlot(
    state: CutinSlotState,
    input: CharacterCutinInput,
    art: CutinArtLoad,
    play: (texture: CutinCharacterArt | null, tween: SlotTween) => void,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    state.animation?.end("reset");
    const animation = createExecutionHandle(true);
    state.animation = animation;
    const isAlive = () =>
      state.animation === animation && !state.root.destroyed;
    const start = (texture: CutinCharacterArt | null) => {
      if (!isAlive()) return;
      play(texture, (duration, update, done) => {
        // Show, SlotUpdate and Hide attach OnComplete even at zero fade time
        // (2791 @ 0x184203DA0 / 0x184204B20 / 0x184203800).
        void this.tween(
          duration,
          (progress) => {
            if (isAlive()) update(progress);
          },
          () => {
            if (!isAlive()) return;
            done?.();
            if (input.block) {
              animation.end();
              onComplete?.();
            }
          },
          { deferZeroDuration: true, isAlive },
        );
      });
      // A cache miss waits for the slot setup. A nonblocking command then
      // advances while the slot's tween keeps running.
      if (!input.block) animation.end();
    };
    if (art instanceof Promise) {
      void art
        .catch(() => null)
        .then(start)
        .catch((error: unknown) => {
          if (isAlive()) animation.fail(error);
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
    art: CutinCharacterArt | null,
    tween: SlotTween,
  ): void {
    // AVGCharacterSlot.Set(name, 0.0, white) swaps the sprite instantly.
    if (art)
      this.addCharacter(state, art, input.characterKey, input.expression, 1);

    if (state.fadeStyle === 0) {
      // Fade the canvas group with the mask already at full size.
      tween(input.fadeMs, (progress) => {
        state.root.alpha = progress;
      });
      return;
    }

    // Expand styles keep alpha at 1 and grow the mask from the pivot edge.
    const start = { ...state.maskSize };
    tween(input.fadeMs, (progress) => {
      state.maskSize.h = lerp(start.h, layout.maskH, progress);
      state.maskSize.w = lerp(start.w, layout.maskW, progress);
      this.drawMask(state);
    });
  }

  private updateSlot(
    input: CharacterCutinInput,
    state: CutinSlotState,
    art: CutinCharacterArt | null,
    keepsArt: boolean,
    tween: SlotTween,
  ): void {
    state.fadeStyle = fadeStyleId(input.fadeStyle);

    const start = {
      alpha: state.root.alpha,
      contentX: state.content.x,
      contentY: state.content.y,
      maskH: state.maskSize.h,
      maskW: state.maskSize.w,
      rootX: state.root.x,
      rootY: state.root.y,
      zoom: state.content.scale.x,
    };
    // SlotUpdate defaults omitted layout keys to their live transforms.
    const layout = layoutFor(input, start);
    state.targetSize = { h: layout.maskH, w: layout.maskW };

    // AVGCharacterSlot.Set crossfades changed art. A matching key skips
    // the swap branch and leaves the current sprite in place.
    const outgoing = keepsArt ? [] : [...state.chars];
    const incoming = art
      ? this.addCharacter(state, art, input.characterKey, input.expression, 0)
      : null;

    tween(
      input.fadeMs,
      (progress) => {
        // Let an interrupted fade-style Show settle to alpha 1 as it would
        // with the two native tweens running concurrently.
        state.root.alpha = lerp(start.alpha, 1, progress);
        state.root.position.set(
          lerp(start.rootX, layout.rootX, progress),
          lerp(start.rootY, layout.rootY, progress),
        );
        state.content.position.set(
          lerp(start.contentX, layout.contentX, progress),
          lerp(start.contentY, layout.contentY, progress),
        );
        state.content.scale.set(lerp(start.zoom, layout.zoom, progress));
        state.maskSize.h = lerp(start.maskH, layout.maskH, progress);
        state.maskSize.w = lerp(start.maskW, layout.maskW, progress);
        this.drawMask(state);
        for (const char of outgoing) char.sprite.alpha = 1 - progress;
        if (incoming) incoming.sprite.alpha = progress;
      },
      () => {
        for (const char of outgoing) this.removeCharacter(state, char);
      },
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
      const startAlpha = state.root.alpha;
      tween(
        input.fadeMs,
        (progress) => {
          state.root.alpha = lerp(startAlpha, 0, progress);
        },
        recycle,
      );
      return;
    }

    const horizontal = state.fadeStyle >= 1 && state.fadeStyle <= 3;
    const startH = state.maskSize.h;
    const startW = state.maskSize.w;
    tween(
      input.fadeMs,
      (progress) => {
        state.maskSize.h = horizontal ? startH : lerp(startH, 0, progress);
        state.maskSize.w = horizontal ? lerp(startW, 0, progress) : startW;
        this.drawMask(state);
      },
      recycle,
    );
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
    content.position.set(layout.contentX, layout.contentY);
    content.scale.set(layout.zoom);
    const mask = new Graphics();
    root.addChild(mask, backdrop, content);
    root.mask = mask;
    this.layer.addChild(root);

    const state: CutinSlotState = {
      backdrop,
      charIdentity: "",
      // Show writes `_characterSlot.localPosition = (charOffsetX,
      // charOffsetY - maskHeight / 2)`: the slot node is pinned to the mask
      // bottom edge (Unity y-up flipped for PIXI).
      charSlotX: input.charOffsetX ?? 0,
      charSlotY: layout.maskH / 2 - (input.charOffsetY ?? 0),
      chars: [],
      content,
      fadeStyle: fadeStyleId(input.fadeStyle),
      mask,
      maskSize: { h: layout.maskH, w: layout.maskW },
      root,
      targetSize: { h: layout.maskH, w: layout.maskW },
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

  private addCharacter(
    state: CutinSlotState,
    art: CutinCharacterArt,
    characterKey: string | undefined,
    expression: string | undefined,
    alpha: number,
  ): CutinChar {
    const sprite = new Sprite(art.texture);
    // The character keeps the hub's native layout: the sheet is scaled to
    // AVGCharacterSpriteHub.size (SetImage resizes the Image rect) and the
    // art center lands at the slot node (`charSlot*`, pinned to the mask
    // bottom by Show) plus the hub pos. The prefab's slot_character/offset
    // child ((0, 360) serialized) is zeroed by AVGCharacterSlot.Set's
    // resetOffsetPos before the hub pos is applied. Only the mask crops.
    sprite.anchor.set(0.5);
    sprite.scale.set(art.scaleX, art.scaleY);
    sprite.position.set(
      state.charSlotX + art.offsetX,
      state.charSlotY - art.offsetY,
    );
    sprite.alpha = alpha;
    state.content.addChild(sprite);
    const char: CutinChar = {
      offsetX: art.offsetX,
      offsetY: art.offsetY,
      sprite,
    };
    state.chars.push(char);
    state.charIdentity = `${characterKey}/${expression}`;
    return char;
  }

  private removeCharacter(state: CutinSlotState, char: CutinChar): void {
    const index = state.chars.indexOf(char);
    if (index !== -1) state.chars.splice(index, 1);
    char.sprite.destroy();
  }

  private destroySlot(widgetId: string, state: CutinSlotState): void {
    state.root.destroy({ children: true });
    this.slots.delete(widgetId);
  }

  private drawMask(state: CutinSlotState): void {
    const { h, w } = state.maskSize;
    const targetW = state.targetSize.w;
    // Native pivot table from Show/Hide: left2right pins the left edge,
    // right2left the right edge, top2bottom the top edge, bottom2top the
    // bottom edge; the rest stay centered. Vertical styles never animate the
    // width, so the centered x form also covers them.
    let x: number;
    switch (state.fadeStyle) {
      case 2: {
        x = -targetW / 2;
        break;
      }
      case 3: {
        x = targetW / 2 - w;
        break;
      }
      default: {
        x = -w / 2;
        break;
      }
    }
    const targetH = state.targetSize.h;
    let y: number;
    switch (state.fadeStyle) {
      case 5: {
        y = -targetH / 2;
        break;
      }
      case 6: {
        y = targetH / 2 - h;
        break;
      }
      default: {
        y = -h / 2;
        break;
      }
    }
    state.mask.clear().rect(x, y, w, h).fill(0xff_ff_ff);
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
  const maskH = STORY_HEIGHT;
  const fallback = current ?? {
    contentX: 0,
    contentY: 0,
    maskW: DEFAULT_SLOT_WIDTH,
    rootX: STORY_WIDTH / 2,
    rootY: STORY_HEIGHT / 2,
    zoom: 1,
  };
  return {
    contentX: input.povX === undefined ? fallback.contentX : -input.povX,
    contentY: input.povY === undefined ? fallback.contentY : input.povY,
    maskH,
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
