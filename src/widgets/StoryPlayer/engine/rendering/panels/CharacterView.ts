import { CanvasSource, Container, Sprite, Texture } from "pixi.js";

import { describeCharacterPortrait } from "../../characterPortrait";
import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import {
  STORY_HEIGHT,
  type CharacterActionInput,
  type CharacterSlotInput,
} from "../../types";
import {
  CharacterArtLoader,
  type CharacterArt,
  type CharacterArtLoad,
} from "../characters/CharacterArt";
import { buildShakePath, sampleShakePath } from "../core/ShakePath";

import type { Context } from "../../../context";
import type { SceneEffectManager } from "../SceneEffectManager";
import type { EaseCurve } from "../core/DotweenEase";
import type { TextureLoad } from "../core/TextureAsset";
import type {
  TweenHandle,
  TweenRunner,
  TweenStartOptions,
} from "../core/TweenRunner";

function isFiniteNumber(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * `TweenerOptions.posFrom` / `posTo` / `zoomPos` all default to `Vector2.one`
 * (`_ExecuteCharslot` 2791 @ 0x1841A3070). The plain-move branch uses
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
 * `_offset.localPosition` move. `_UpdateSeqWithParam` (2791 @ 0x1841A9600) picks
 * `_GenSlotActionTw` XOR `_GenCharslotMove`: the plain move only runs when
 * `action` is empty and posFrom != (1,1), and `_GenSlotActionTw`
 * (0x1841A5280) re-enters SlotMoveChar for `shakemove` and for `jump` when
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
        // CharJump (0x184236650): DOLocalJump to `localPosition + posTo`.
        // An omitted posto stays at the (1,1) default -- a bare jump drifts
        // one unit -- while a posto that is present but not an "x,y" pair
        // becomes Vector2.zero (2791 @ 0x1841A3070); the runtime hands
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
 * The zoom half of a `charslot`: CharZoom (0x184236B10) tweens the fore
 * Image's `rectTransform.pivot` to `zoomPos` and its `localScale` to `scale`
 * (setter `<CharZoom>b__1` 0x18424A230 lerp-drives both from one 0→1 float,
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
  // to `options.scale`, whose GetOrDefault falls back to 1.0 (2791 @ 0x1841A3070)
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
 * 2791 MoveChar @ 0x1842370A0, SetCharPos @ 0x1842375B0), and the sequence
 * ease `AVGCharacterSlot.CharJump` chains on DOLocalJump. `easeOutQuad` below
 * is DOLocalJump's arc and y-displacement ease (2791 DOLocalJump @
 * 0x184431260; same formula as `dotweenDefaultEase` in core/DotweenEase).
 */
function easeOutCubic(progress: number): number {
  const remaining = 1 - progress;
  return 1 - remaining * remaining * remaining;
}

function easeOutQuad(progress: number): number {
  return 1 - (1 - progress) * (1 - progress);
}

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
  scaleX: number;
  scaleY: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  shakeSessionId: number;
  slot: CharacterSlot;
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

// Derived from the legacy 960-space anchors [330, 480, 630].
const SLOT_BASE_X = { l: 440, m: 640, r: 840 } as const;

interface SlotSequence {
  remainingMs: number;
  onComplete?: () => void;
  timer?: TweenHandle;
  clearTween?: TweenHandle;
  waits: Set<ExecutionHandle>;
}

interface CharacterPreparation {
  animation: ExecutionHandle;
  command: "character" | "charslot";
}

type FinishTarget = "charslot" | object;
type DeferredTarget = CharacterSlot | FinishTarget;

type DeferredCallback =
  | { slot: CharacterSlot }
  | { command: CharacterPreparation["command"]; onComplete: () => void };

/**
 * Web view for the built-in AVGCharacterSlots shared by CharacterPanel and
 * AVGCharacterslotPanel. Artwork is also shared with cut-ins and interludes.
 */
export class CharacterView {
  private readonly characterSlots = new Map<
    CharacterSlot,
    CharacterRenderState
  >();
  private readonly fadingStates = new Set<CharacterRenderState>();
  private readonly preparations = new Map<
    CharacterSlot,
    CharacterPreparation
  >();
  private readonly slotSequences = new Map<CharacterSlot, SlotSequence>();
  private readonly deferredCallbacks = new Map<
    DeferredTarget,
    DeferredCallback
  >();
  private cancelDeferredReplay?: () => void;
  private readonly slotActionTargets = {
    l: { offset: {}, shake: {} },
    m: { offset: {}, shake: {} },
    r: { offset: {}, shake: {} },
  };
  private resettingOffset = false;
  private readonly characterZoomTweens = {};
  private readonly characterArt: CharacterArtLoader;

  constructor(
    private readonly charLayer: Container,
    private readonly linkMap: Context["linkMap"],
    loadTexture: (key: string) => TextureLoad,
    private readonly tweens: TweenRunner,
    private readonly sceneEffects: Pick<
      SceneEffectManager,
      "releaseFixedFocusTarget" | "setImageFocusTargets"
    >,
    private readonly onWarning?: (detail: string) => void,
  ) {
    this.characterArt = new CharacterArtLoader(loadTexture);
  }

  loadArt(
    base: string | undefined,
    expression: string | undefined,
  ): CharacterArtLoad {
    if (!base || !expression) return null;
    const link = this.linkMap[base];
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

  show(input: CharacterSlotInput): ExecutionHandle | void {
    const slot = this.normalizeCharacterSlot(input.slot);
    const current = this.characterSlots.get(slot);
    // AVGCharacterSlot.Set (2791 @ 0x184237BC0) reuses the holder for the
    // same raw key. Keep its in-flight actions when updating the focus.
    if (
      current &&
      input.nativeKey &&
      input.nativeKey === current.nativeKey &&
      !input.enterFrom
    ) {
      this.cancelSlotPreparation(slot);
      current.focusBrightness = input.dimmed ? 0.5 : 1;
      this.updateCharacterOpacity(current);
      this.applyCharacterZOrder(input.focus ?? 0);
      return;
    }
    return this.withVisual(slot, input, "character", (built) => {
      if (built) this.mountCharacter(input, slot, built);
      else if (input.characterKey) this.clearSlot(slot, input.durationMs ?? 0);
    });
  }

  updateSlot(
    input: CharacterSlotInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const slot = this.normalizeCharacterSlot(input.slot);
    return this.withVisual(slot, input, "charslot", (built, preparation) => {
      this.applySlotUpdate(input, slot, built);
      return this.trackSlotSequence(
        slot,
        Math.max(0, input.durationMs ?? 0),
        !!input.block,
        onComplete,
        preparation,
      );
    });
  }

  /** AVGCharacterSlot._LoadImage (2791 @ 0x184239340) loads synchronously. */
  private withVisual(
    slot: CharacterSlot,
    input: CharacterSlotInput,
    command: CharacterPreparation["command"],
    apply: (
      built: CharacterBuiltVisual | null,
      preparation?: ExecutionHandle,
    ) => ExecutionHandle | void,
  ): ExecutionHandle | void {
    this.cancelSlotPreparation(slot);
    const art = this.loadArt(input.characterKey, input.expression);
    if (!(art instanceof Promise))
      return apply(this.buildCharacterVisual(input, art));

    // Wait for a browser cache miss before committing a new visual. Acquiring
    // only on commit keeps a cancelled load from pinning a face-overlay bake.
    const animation = createExecutionHandle(true);
    const preparation = { animation, command };
    this.preparations.set(slot, preparation);
    const assetsReady = art
      .then((ready) => {
        if (this.preparations.get(slot) !== preparation) return;
        this.preparations.delete(slot);
        const built = this.buildCharacterVisual(input, ready);
        this.replayPreparedSlotCallbacks();
        if (!apply(built, animation)) animation.end();
      })
      .catch((error: unknown) => {
        if (this.preparations.get(slot) === preparation)
          this.preparations.delete(slot);
        animation.fail(error);
      });
    return Object.assign(animation, { assetsReady });
  }

  cancelPreparation(applyElapsedClears = false): void {
    const elapsed = applyElapsedClears
      ? [...this.deferredCallbacks.values()]
      : [];
    for (const { animation } of this.preparations.values())
      animation.end("force_end");
    this.preparations.clear();
    this.deferredCallbacks.clear();
    this.cancelDeferredReplay?.();
    this.cancelDeferredReplay = undefined;
    // A segment skip preserves the results of a clear that has already run
    // on the native fixed slots. Apply it before mounting the next segment.
    for (const callback of elapsed) {
      if ("slot" in callback) this.resetSlot(callback.slot);
    }
  }

  private cancelSlotPreparation(slot: CharacterSlot): void {
    const preparation = this.preparations.get(slot);
    if (!preparation) return;
    this.preparations.delete(slot);
    this.deferredCallbacks.delete(slot);
    preparation.animation.end("force_end");
    for (const [target, callback] of this.deferredCallbacks) {
      if ("command" in callback && callback.command === preparation.command)
        this.deferredCallbacks.delete(target);
    }
  }

  private signalFinish(target: FinishTarget, onComplete: () => void): void {
    const command = target === "charslot" ? "charslot" : "character";
    // Both native panels load inline. A browser portrait wait holds the
    // script cursor for either panel, while each finish keeps its own owner.
    if (this.preparations.size)
      this.deferredCallbacks.set(target, { command, onComplete });
    else onComplete();
  }

  private replayCallback(target: DeferredTarget): void {
    if (this.preparations.size) return;
    const callback = this.deferredCallbacks.get(target);
    if (!callback) return;
    this.deferredCallbacks.delete(target);
    if ("slot" in callback) this.resetSlot(callback.slot);
    else callback.onComplete();
  }

  private finishSlotClear(slot: CharacterSlot): void {
    // _DoCleanSlot's nested OnComplete (2791 @ 0x1841B6270) clears the
    // permanent slot. A cold replacement commits before this callback runs.
    if (this.preparations.size) this.deferredCallbacks.set(slot, { slot });
    else this.resetSlot(slot);
  }

  private replayPreparedSlotCallbacks(): void {
    if (
      this.preparations.size ||
      !this.deferredCallbacks.size ||
      this.cancelDeferredReplay
    )
      return;
    // These callbacks already came due on earlier Updates (2791
    // TweenManager.Update @ 0x184467690). Replay them in arrival order before
    // any live tween can reach completion on the first ready frame.
    this.cancelDeferredReplay = this.tweens.beforeNextUpdate(() => {
      this.cancelDeferredReplay = undefined;
      for (const target of this.deferredCallbacks.keys())
        this.replayCallback(target);
    });
  }

  /**
   * _GetCachedSlotSeq / _UpdateSeqWithTween (2791 @ 0x1841A5700 / 0x1841A9BE0).
   * Web keeps the existing parallel-duration approximation: a later blocking
   * command waits out the longest in-flight track on its slot. The span and
   * visible tracks share an Update clock.
   */
  private trackSlotSequence(
    slot: CharacterSlot,
    durationMs: number,
    block: boolean,
    onComplete?: () => void,
    preparation?: ExecutionHandle,
  ): ExecutionHandle | void {
    let sequence = this.slotSequences.get(slot);
    const startSpan = !sequence || durationMs > sequence.remainingMs;
    if (!sequence) {
      // Sequence.DoStartup (2791 @ 0x18442C6F0) accepts even an empty
      // sequence with OnComplete and completes it on the first Update.
      if (durationMs <= 0 && !onComplete) return;
      sequence = { remainingMs: 0, waits: new Set() };
      this.slotSequences.set(slot, sequence);
    }
    if (onComplete) sequence.onComplete = onComplete;
    const animation = block
      ? (preparation ?? createExecutionHandle(true))
      : undefined;
    if (animation) sequence.waits.add(animation);
    if (startSpan) {
      const span = sequence;
      span.timer?.kill();
      span.remainingMs = durationMs;
      span.timer = this.tweens.start(
        durationMs,
        (progress) => {
          span.remainingMs = durationMs * (1 - progress);
        },
        {
          deferZeroDuration: true,
          onComplete: () => {
            // Another command may start its last visual track after the span's
            // tween was created. Check waits after every tween has written.
            this.tweens.afterUpdate(() => {
              if (this.slotSequences.get(slot) !== span) return;
              if (span.onComplete)
                this.signalFinish("charslot", span.onComplete);
              this.slotSequences.delete(slot);
              for (const wait of span.waits) wait.end();
            });
          },
        },
      );
    }
    return animation;
  }

  private clearSlotSequences(): void {
    for (const sequence of this.slotSequences.values()) {
      sequence.timer?.kill();
      sequence.clearTween?.kill();
      for (const wait of sequence.waits) wait.end("reset");
    }
    this.slotSequences.clear();
  }

  /**
   * _AddFinishCommand (2791 @ 0x1841BFD70) uses the action tween's
   * OnComplete. The Update runner writes the final pose before runtime polls.
   */
  runAction(
    input: CharacterActionInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    // _ExecuteCharacterMove / MoveChar (2791 @ 0x1841C0990 / 0x1842370A0)
    // operate on the fixed transform even when no artwork is displayed.
    const state = this.getSlotState(this.normalizeCharacterSlot(input.slot));
    const targets = this.slotActionTargets[state.slot];

    const canBlock = input.type === "zoom" || input.durationMs > 0;
    const animation =
      input.block && canBlock && !(input.type === "shake" && input.stop)
        ? createExecutionHandle(true)
        : undefined;
    const movesOffset =
      input.type === "move" || input.type === "exit" || input.type === "jump";
    let target = targets.offset;
    if (input.type === "shake") target = targets.shake;
    if (input.type === "zoom") target = this.characterZoomTweens;
    // Set (2791 @ 0x184237BC0) can replace the art while its offset and shake
    // transforms stay alive. Their callbacks still address the panel's wait.
    const completion: TweenStartOptions = { target };
    if (animation) {
      completion.onCancel = () => {
        // _ResetLocationAndTween (2791 @ 0x184239CD0) kills the offset
        // tween without OnComplete. The blocked command can still be skipped.
        if (!movesOffset || !this.resettingOffset) animation.end("reset");
      };
      completion.onComplete = () => {
        animation.end();
        if (onComplete) this.signalFinish(target, onComplete);
      };
    }
    switch (input.type) {
      case "move":
        this.startMoveAction(
          state,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          easeOutCubic,
          easeOutCubic,
          completion,
        );
        break;
      case "jump":
        this.startMoveAction(
          state,
          input.xOffset,
          input.yOffset,
          input.durationMs,
          easeOutCubic,
          (progress) => easeOutQuad(easeOutCubic(progress)),
          { target: targets.offset },
        );
        this.startJumpAction(
          state,
          input.power,
          input.times,
          input.durationMs,
          completion,
        );
        break;
      case "shake":
        this.startShakeAction(state, input, completion);
        break;
      case "zoom":
        this.runScaleAction(
          state,
          input.scaleX,
          input.scaleY,
          input.pivot,
          input.durationMs,
          completion,
        );
        break;
      case "exit":
        this.runExitAction(
          state,
          input.durationMs,
          input.direction,
          input.absolutePosition,
          completion,
        );
        break;
    }
    return animation;
  }

  clear(
    slot?: string,
    fadeMs = 0,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (slot) {
      const normalized = this.normalizeCharacterSlot(slot);
      this.cancelSlotPreparation(normalized);
      this.clearSlot(normalized, fadeMs);
      return;
    }

    // _ClearSeq and _CleanSlotsWithTween (2791 @ 0x1841A22C0, 0x1841A1CA0)
    // cancel old sequences and fade all three built-in slots, even the blank
    // ones. Only the middle sequence reports FinishCommand (0x1841A1920).
    for (const key of this.preparations.keys()) this.cancelSlotPreparation(key);
    for (const key of ["l", "r", "m"] as const)
      this.deferredCallbacks.delete(key);
    this.deferredCallbacks.delete("charslot");
    this.clearSlotSequences();
    let middleAnimation: ExecutionHandle | void = undefined;
    for (const key of ["l", "r", "m"] as const) {
      if (fadeMs <= 0) {
        this.resetSlot(key);
        continue;
      }
      this.resetSlotShake(key);
      this.clearSlot(key, fadeMs);
      const clearTween = this.tweens.start(fadeMs, () => {}, {
        onComplete: () => this.finishSlotClear(key),
      });
      const isMiddle = key === "m";
      const animation = this.trackSlotSequence(
        key,
        fadeMs,
        isMiddle,
        isMiddle ? onComplete : undefined,
      );
      // The child clear retains its own end time when later tracks extend
      // the same sequence, and _ClearSeq cancels both together.
      this.slotSequences.get(key)!.clearTween = clearTween;
      if (isMiddle) middleAnimation = animation;
    }
    return middleAnimation;
  }

  private resetSlot(slot: CharacterSlot): void {
    const target = this.slotActionTargets[slot].offset;
    this.deferredCallbacks.delete(target);
    this.resettingOffset = true;
    try {
      this.tweens.killTarget(target);
    } finally {
      this.resettingOffset = false;
    }
    this.resetSlotShake(slot);
    this.clearSlot(slot, 0);
  }

  private resetSlotShake(slot: CharacterSlot): void {
    // _ResetLocationAndTween completes stand-alone shake tweens on its
    // shake container. Nested charslot tracks remain owned by their sequence.
    const target = this.slotActionTargets[slot].shake;
    this.tweens.killTarget(target, true);
    this.replayCallback(target);
    const state = this.characterSlots.get(slot);
    if (state) this.stopShakeAction(state);
  }

  private discardFadingSlot(slot: CharacterSlot): void {
    for (const fading of this.fadingStates) {
      if (fading.slot === slot) this.disposeCharacterState(fading);
    }
  }

  private clearSlot(slot: CharacterSlot, fadeMs: number): void {
    // Clear / Set (2791 @ 0x184236E90 / 0x184237BC0) also drop the back
    // holder when the front is already blank, including a prior clear's fade.
    this.discardFadingSlot(slot);
    const state = this.characterSlots.get(slot);
    if (!state) return;
    this.characterSlots.delete(slot);
    if (!state.root.parent) {
      this.disposeCharacterState(state);
      return;
    }
    if (state.outgoingVisual) {
      state.replaceFadeSessionId += 1;
      this.discardCharacterVisual(state.outgoingVisual);
      state.outgoingVisual = null;
    }
    this.sceneEffects.setImageFocusTargets(
      slot,
      undefined,
      fadeMs > 0 ? state.visual : undefined,
    );
    if (fadeMs > 0) this.fadeOutAndRemove(state, fadeMs);
    else this.disposeCharacterState(state);
  }

  /** CharacterPanel / AVGCharacterslotPanel.OnStoryEnd (2791 @ 0x1841BFC50 / 0x1841A1360). */
  reset(): void {
    this.cancelPreparation();
    this.clearSlotSequences();
    for (const { offset, shake } of Object.values(this.slotActionTargets)) {
      this.tweens.killTarget(offset);
      this.tweens.killTarget(shake);
    }
    this.tweens.killTarget(this.characterZoomTweens);
    const states = [...this.characterSlots.values(), ...this.fadingStates];
    this.characterSlots.clear();
    for (const state of states) this.disposeCharacterState(state);
  }

  destroy(): void {
    this.reset();
    this.characterArt.destroy();
  }

  private tween(
    state: CharacterRenderState,
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
    options?: TweenStartOptions,
  ): void {
    this.tweens.start(durationMs, step, {
      ...options,
      onComplete: () => {
        done?.();
        options?.onComplete?.();
      },
      target: options?.target ?? state,
    });
  }

  private mountCharacter(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual,
  ): void {
    this.discardFadingSlot(slot);
    const current = this.characterSlots.get(slot);
    const previous = current?.root.parent ? current : undefined;
    const state = previous
      ? this.createSlotState(slot)
      : (current ?? this.createSlotState(slot));
    this.discardCharacterVisual(state.visual);
    this.attachSlotArt(state, input, built);
    const { root, visual } = state;
    const { x: targetX, y: targetY } = root.position;
    const enterOffset = this.enterOffset(
      slot,
      input.enterFrom,
      input.enterPosition,
    );
    state.actionX = 0;
    state.actionY = 0;
    state.contentAlpha = 1;
    state.focusBrightness = input.dimmed ? 0.5 : 1;
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
      this.fadeOutAndRemove(previous, imageFadeMs);

    if (animationMs > 0) {
      this.tween(state, animationMs, (progress) => {
        root.alpha = imageFadeMs > 0 ? progress : 1;
        // Native `SetCharPos` runs the slide as
        // `DOLocalMove(...).SetEase(Ease.OutCubic)`; the shared tween runner
        // is linear, so ease the move -- and only the move -- here.
        const moveProgress = moveMs > 0 ? easeOutCubic(progress) : 1;
        root.x = targetX + enterOffset.x * (1 - moveProgress);
        root.y = targetY + enterOffset.y * (1 - moveProgress);
      });
    }
  }

  private applySlotUpdate(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual | null,
  ): void {
    const durationMs = Math.max(0, input.durationMs ?? 0);
    if (!built && input.characterKey) {
      // _SlotSetCharInternal (2791 @ 0x18423A040) fades the old back image
      // after a failed _LoadImage. Focus and actions still use the fixed slot.
      this.clearSlot(slot, durationMs);
    }
    const state = built
      ? this.mountCharacterSlot(input, slot, built)
      : this.getSlotState(slot);
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
        durationMs,
        power: Math.max(0, input.power ?? 0),
        randomness: input.randomness ?? 10,
        stop: Boolean(input.stop),
        times: input.times ?? 0,
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
      this.tween(state, durationMs, (progress) => {
        if (
          !this.isActiveCharacterState(state) ||
          state.rotateSessionId !== sessionId
        )
          return;
        state.rotationDeg = fromAngle + (toAngle - fromAngle) * progress;
        this.updateCharacterState(state);
      });
    }

    this.applyCharacterSlotOpacity(state, input, durationMs, built !== null);

    // The move (`_offset.localPosition`) and the zoom (the fore Image's
    // pivot/localScale) are independent tweens natively: an image swap
    // resets the zoom but leaves a running move alone, and a command whose
    // from == to starts nothing, so an in-flight tween of either kind
    // survives an unrelated command.
    if (move && (move.from.x !== move.to.x || move.from.y !== move.to.y)) {
      const sessionId = ++state.transformSessionId;
      const moveDurationMs = input.action === "setpos" ? 0 : durationMs;
      const { from, to } = move;
      this.tween(
        state,
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
      this.tween(
        state,
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
        { deferZeroDuration: true },
      );
    }
  }

  /** Builds the scene holder from the same artwork used by cut-in slots. */
  private buildCharacterVisual(
    input: CharacterSlotInput,
    art: CharacterArt | null,
  ): CharacterBuiltVisual | null {
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
      input.blackStart,
      input.blackEnd,
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

  private getSlotState(slot: CharacterSlot): CharacterRenderState {
    let state = this.characterSlots.get(slot);
    if (!state) {
      state = this.createSlotState(slot);
      this.characterSlots.set(slot, state);
    }
    return state;
  }

  /** Fixed slots can animate before a portrait is mounted. */
  private createSlotState(slot: CharacterSlot): CharacterRenderState {
    const root = new Container();
    const motionLayer = new Container();
    const rotationLayer = new Container();
    const visual = new Container();
    rotationLayer.addChild(visual);
    motionLayer.addChild(rotationLayer);
    root.addChild(motionLayer);
    return {
      actionX: 0,
      actionY: 0,
      baseScaleX: 1,
      baseScaleY: 1,
      contentAlpha: 1,
      focusBrightness: 1,
      height: 0,
      jumpOffsetY: 0,
      jumpSessionId: 0,
      motionLayer,
      opacitySessionId: 0,
      outgoingVisual: null,
      replaceFadeSessionId: 0,
      root,
      rotationDeg: 0,
      rotationLayer,
      rotateSessionId: 0,
      scaleX: 1,
      scaleY: 1,
      shakeOffsetX: 0,
      shakeOffsetY: 0,
      shakeSessionId: 0,
      slot,
      transformSessionId: 0,
      visual,
      width: 0,
      zoomSessionId: 0,
      zoomShiftX: 0,
      zoomShiftY: 0,
    };
  }

  private attachSlotArt(
    state: CharacterRenderState,
    input: CharacterSlotInput,
    art: CharacterBuiltVisual,
  ): void {
    state.baseScaleX = art.width / Math.max(1, art.sourceWidth);
    state.baseScaleY = art.height / Math.max(1, art.sourceHeight);
    state.expression = input.expression;
    state.fadeIdentity = input.fadeIdentity ?? input.characterKey;
    state.height = art.height;
    state.nativeKey = input.nativeKey;
    // _GenForeImageTween (2791 @ 0x184238ED0) targets the physical front
    // Image at creation. Earlier opacity tracks cannot write to this holder.
    state.opacitySessionId += 1;
    // CharZoom (2791 @ 0x184236B10) holds the old RectTransform even
    // when its targetless tween continues running after the swap.
    state.zoomSessionId += 1;
    state.scaleX = 1;
    state.scaleY = 1;
    state.zoomShiftX = 0;
    state.zoomShiftY = 0;
    state.root.position.set(
      SLOT_BASE_X[state.slot] - art.width / 2 + art.pos.x,
      STORY_HEIGHT - art.height / 2 - art.pos.y,
    );
    state.visual = art.visual;
    state.width = art.width;
    state.rotationLayer.pivot.set(art.sourceWidth / 2, art.sourceHeight / 2);
    state.rotationLayer.position.copyFrom(state.rotationLayer.pivot);
    state.rotationLayer.addChild(art.visual);
  }

  private mountCharacterSlot(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual,
  ): CharacterRenderState {
    this.discardFadingSlot(slot);
    const current = this.getSlotState(slot);
    const previousVisual = current.root.parent ? current.visual : undefined;
    if (!previousVisual) {
      this.discardCharacterVisual(current.visual);
      this.charLayer.addChild(current.root);
    }
    // Native keeps one back Image; a swap mid-crossfade replaces it outright.
    if (current.outgoingVisual && current.outgoingVisual !== previousVisual)
      this.discardCharacterVisual(current.outgoingVisual);
    current.outgoingVisual = null;

    // `AVGCharacterSpriteHub._SetImage` (2791 @ 0x18423C580) and its HubGroup twin
    // (0x18423B650) both open with `GUIUtils.AssignLocalSettings(
    // m_image.rectTransform, hub.rectTransform)` which copies
    // the hub prefab's sizeDelta/pivot/localScale/localRotation/localPosition
    // onto the fore Image on every successful load -- exactly the pivot and
    // localScale CharZoom's setter animates. A named swap therefore resets
    // the zoom while the `_offset` move survives (resetOffsetPos=false). The
    // outgoing Image keeps its own transform as it fades, so the previous
    // visual carries the old zoom on itself (scaled back through the base
    // ratio because the motion layer now holds the incoming art's base).
    if (previousVisual) {
      const baseScaleX = built.width / Math.max(1, built.sourceWidth);
      const baseScaleY = built.height / Math.max(1, built.sourceHeight);
      previousVisual.scale.set(
        (current.scaleX * current.baseScaleX) / Math.max(1e-6, baseScaleX),
        (current.scaleY * current.baseScaleY) / Math.max(1e-6, baseScaleY),
      );
      previousVisual.position.set(
        current.zoomShiftX / Math.max(1e-6, baseScaleX),
        -current.zoomShiftY / Math.max(1e-6, baseScaleY),
      );
    }
    this.attachSlotArt(current, input, built);

    // Native crossfade: `_SlotSetCharInternal` runs the outgoing sprite's
    // fade-out immediately, while the incoming sprite's afrom->ato tween (the
    // same tween `applyCharacterSlotOpacity` drives through contentAlpha) is
    // the crossfade itself. Its length is `duration` -- `fadetime` is not a
    // charslot key. The incoming visual therefore starts at the current
    // contentAlpha (set to `afrom` right after by the caller) and only the
    // outgoing visual gets a dedicated fade here.
    const fadeMs = Math.max(0, input.replaceFadeMs ?? 0);
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
      this.tween(
        current,
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
   * through `CharacterParam` into `AVGCharacterSlot._LoadImage` (0x184239340)
   * -> `AVGCharacterSpriteHub._SetImage` -> `AlphaSplitImageHolder.SetSprite`
   * (0x18421A9F0), which writes the material floats as
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
    // `_ProcessFocusArray` (0x1841A6A00) clears all four flags, then lights
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
    hasNewArt: boolean,
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

    // _GenForeImageTween (2791 @ 0x184238ED0) schedules even a zero-time
    // fade for new art. SlotChangeAlpha can write a nameless change inline.
    if ((!hasNewArt && durationMs <= 0) || fromAlpha === toAlpha) {
      state.contentAlpha = toAlpha;
      this.updateCharacterOpacity(state);
      return;
    }

    const sessionId = ++state.opacitySessionId;
    this.tween(
      state,
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
      { deferZeroDuration: hasNewArt },
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
    let order: CharacterSlot[] = ["l", "r", "m"];
    if (ufocus === 1) order = ["r", "m", "l"];
    else if (ufocus === 2) order = ["l", "m", "r"];
    for (const slot of order) {
      const root = this.characterSlots.get(slot)?.root;
      if (!root || root.parent !== this.charLayer) continue;
      this.charLayer.setChildIndex(root, this.charLayer.children.length - 1);
    }
  }

  private fadeOutAndRemove(
    state: CharacterRenderState,
    durationMs: number,
  ): void {
    this.fadingStates.add(state);
    const startAlpha = state.root.alpha;
    this.tween(
      state,
      durationMs,
      (progress) => {
        state.root.alpha = startAlpha * (1 - progress);
      },
      () => this.disposeCharacterState(state),
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
    this.fadingStates.delete(state);
    this.tweens.killTarget(state);
    for (const child of [...state.rotationLayer.children])
      this.discardCharacterVisual(child);
    state.root.destroy({ children: true });
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

  private stopShakeAction(state: CharacterRenderState): void {
    state.shakeSessionId += 1;
    state.shakeOffsetX = 0;
    state.shakeOffsetY = 0;
    this.updateCharacterState(state);
  }

  /**
   * Native port: AVGCharacterSlot.MoveChar (2791 @ 0x1842370A0). Relative
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
    completion?: TweenStartOptions,
  ): void {
    const fromX = state.actionX;
    const fromY = state.actionY;
    const toX = fromX + xOffset;
    const toY = fromY + yOffset;
    const sessionId = ++state.transformSessionId;

    this.tween(
      state,
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
      completion,
    );
  }

  /**
   * Native port: AVGCharacterSlot.CharZoom (2791 @ 0x184236B10) as reached from
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
  private runScaleAction(
    state: CharacterRenderState,
    scaleX: number | undefined,
    scaleY: number | undefined,
    pivot: { x: number; y: number } | undefined,
    durationMs: number,
    completion: TweenStartOptions | undefined,
  ): void {
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

    this.tween(
      state,
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
      // CharZoom (2791 @ 0x184236B10) creates DOTween.To at zero duration.
      { ...completion, deferZeroDuration: true },
    );
  }

  /**
   * Native port: CharacterPanel._ExecuteCharacterExit (2791 @ 0x1841C0110)
   * → _GenExitPosition (0x1841C1B70) → AVGCharacterSlot.SetCharPos
   * (0x1842375B0). The exit table below is verbatim native: displacements
   * from each slot's rest anchor (l=440/m=640/r=840 in 1280x720 story space;
   * actionX/actionY are exactly that displacement). Both coordinates are set
   * absolutely, so a horizontal exit also snaps the vertical drift back to 0.
   * An unknown direction resolves to (0,0) — the rest anchor. An explicit
   * xpos/ypos pair replaces the table lookup but lands in the same
   * `_offset.localPosition` space. SetCharPos runs
   * `DOLocalMove(...).SetEase(Ease.OutCubic)` (same tween as the character
   * enter slide), so the exit path eases with OutCubic too.
   */
  private runExitAction(
    state: CharacterRenderState,
    durationMs: number,
    direction: CharacterActionInput["direction"],
    position: { x: number; y: number } | undefined,
    completion: TweenStartOptions | undefined,
  ): void {
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
      // into `_offset.localPosition` (0x1842375B0), the same slot-anchor
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

    this.tween(
      state,
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
      completion,
    );
  }

  /**
   * Native port: AVGCharacterSlot.CharJump (2791 @ 0x184236650) →
   * DOTween DOLocalJump (0x184431260), which is a Sequence of three tweens
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
   * returned Sequence, and `Sequence.DoApplyTween` (0x18442BE00) evaluates
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
    completion?: TweenStartOptions,
  ): void {
    const sessionId = ++state.jumpSessionId;
    state.jumpOffsetY = 0;
    this.updateCharacterState(state);

    // Native DOLocalJump always creates the y arc tween; a power of 0 is a
    // flat arc (visual no-op) and a negative power bounces downward, so only
    // a non-positive duration skips it (the runtime degenerates that case to
    // a move anyway — this is a defensive guard).
    if (durationMs <= 0) return;

    const cycles = Math.max(1, times);
    const halfCycleProgress = 1 / (cycles * 2);
    this.tween(
      state,
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
      completion,
    );
  }

  /**
   * Native port: AVGCharacterSlot.CharShake (2791 @ 0x1842369B0) →
   * ShortcutExtensions.DOShakePosition float overload (0x1844365E0) →
   * DOTween.Shake float overload (0x184428350, expands strength to
   * (s, s, s)) → inner DOTween.Shake (0x18424e2d0) with
   * `ignoreZAxis = false`, `vectorBased = false`, Full randomness mode and
   * fadeOut — the non-vectorBased waypoint walk `buildShakePath` also ports
   * (vibrato = `times` per second, radius = power).
   * CharShake chains SetEase(OutCubic), but DOShakePosition marks the tween
   * `SpecialStartupMode.SetShake`, whose startup hook
   * (`SpecialPluginsUtils.SetShake` @ 0x184458DE0) forces `easeType =
   * Linear` after SetPunch; Vector3ArrayPlugin then eases each segment on its
   * own so every segment interpolates linearly.
   * X keeps Unity's right-positive axis; Y is stored negated because
   * motionLayer consumes screen-down-positive y.
   */
  private startShakeAction(
    state: CharacterRenderState,
    input: Pick<
      CharacterActionInput,
      "durationMs" | "power" | "randomness" | "stop" | "times"
    >,
    completion?: TweenStartOptions,
  ): void {
    this.stopShakeAction(state);
    // `stop` is a web extension: native has no such key, so it only needs to
    // cancel above without producing a tween.
    if (input.stop) return;

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

    this.tween(
      state,
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
      completion,
    );
  }

  private isActiveCharacterState(
    state: CharacterRenderState,
    transformSessionId?: number,
  ): boolean {
    const current = this.characterSlots.get(state.slot);
    if (current !== state) return false;
    if (
      transformSessionId !== undefined &&
      state.transformSessionId !== transformSessionId
    )
      return false;
    return true;
  }
}
