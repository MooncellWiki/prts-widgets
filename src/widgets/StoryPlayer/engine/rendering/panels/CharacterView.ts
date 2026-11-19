import { CanvasSource, Container, Sprite, Texture } from "pixi.js";

import { describeCharacterPortrait } from "../../characterPortrait";
import { isZeroFloat } from "../../commandParams";
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
  motion: CharacterSlotMotion,
  input: CharacterSlotInput,
  durationMs: number,
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
      if (durationMs > 0) {
        // CharJump (0x184236650): DOLocalJump to `localPosition + posTo`.
        // An omitted posto stays at the (1,1) default -- a bare jump drifts
        // one unit -- while a posto that is present but not an "x,y" pair
        // becomes Vector2.zero (2791 @ 0x1841A3070); the runtime hands
        // that case in as (0,0).
        return {
          from: { x: motion.actionX, y: motion.actionY },
          to: { x: motion.actionX + posTo.x, y: motion.actionY + posTo.y },
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
 * The fore holder's pivot stays at the original rect centre. Convert its
 * scale and pivot to a top-left shift per unit of portrait width/height.
 */
function characterZoom(
  scaleX: number,
  scaleY: number,
  { x, y }: CharacterSlotPoint = { x: 0.5, y: 0.5 },
): CharacterSlotZoomState {
  return {
    scaleX,
    scaleY,
    shiftX: (0.5 - x) * scaleX - (scaleX - 1) / 2,
    shiftY: (0.5 - y) * scaleY + (scaleY - 1) / 2,
  };
}

function characterSlotZoom(
  input: CharacterSlotInput,
): CharacterSlotZoomState | null {
  if (input.action !== "zoom") return null;
  // CharZoom (2791 @ 0x184236B10) only accepts a pivot inside the image.
  // The Web default keeps an unspecified pivot centred.
  const pivot = input.posZoom;
  if (pivot && (pivot.x < 0 || pivot.x > 1 || pivot.y < 0 || pivot.y > 1))
    return null;
  return characterZoom(
    isFiniteNumber(input.scaleX) ? input.scaleX : 1,
    isFiniteNumber(input.scaleY) ? input.scaleY : 1,
    pivot,
  );
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
const EMPTY_CHARACTER = "char_empty";

interface CharacterSlotMotion {
  actionX: number;
  actionY: number;
  rotationDeg: number;
  rotateSessionId: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  shakeSessionId: number;
}

function createSlotMotion(): CharacterSlotMotion {
  return {
    actionX: 0,
    actionY: 0,
    rotationDeg: 0,
    rotateSessionId: 0,
    shakeOffsetX: 0,
    shakeOffsetY: 0,
    shakeSessionId: 0,
  };
}

interface CharacterImageHolder {
  state?: CharacterRenderState;
}

function createHolderPair(): {
  back: CharacterImageHolder;
  /** AVGCharacterSlot.m_currentKey, including the transparent char_empty sprite. */
  currentKey?: string;
  front: CharacterImageHolder;
} {
  return { back: {}, front: {} };
}

interface CharacterRenderState {
  baseScaleX: number;
  baseScaleY: number;
  contentAlpha: number;
  focusBrightness: number;
  expression?: string;
  fadeIdentity?: string;
  height: number;
  holder: CharacterImageHolder;
  motion: CharacterSlotMotion;
  motionLayer: Container;
  opacitySessionId: number;
  root: Container;
  rotationLayer: Container;
  scaleX: number;
  scaleY: number;
  slot: CharacterSlot;
  visual: Container;
  width: number;
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
  private readonly backHolders = new Map<CharacterSlot, CharacterRenderState>();
  private readonly slotHolders = {
    l: createHolderPair(),
    m: createHolderPair(),
    r: createHolderPair(),
  };
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
  // AVGCharacterSlot.Set (2791 @ 0x184237BC0) swaps image holders while
  // MoveChar (0x1842370A0) and CharShake (0x1842369B0) keep their transforms.
  private readonly slotMotions = {
    l: createSlotMotion(),
    m: createSlotMotion(),
    r: createSlotMotion(),
  };
  private readonly slotActionTargets = {
    l: { offset: {}, sequence: {}, shake: {} },
    m: { offset: {}, sequence: {}, shake: {} },
    r: { offset: {}, sequence: {}, shake: {} },
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
    const holders = this.slotHolders[slot];
    const current = this.characterSlots.get(slot);
    // AVGCharacterSlot.Set (2791 @ 0x184237BC0) reuses the holder for the
    // same raw key. Keep its in-flight actions when updating the focus.
    if (input.nativeKey && input.nativeKey === holders.currentKey) {
      this.cancelSlotPreparation(slot);
      if (current) {
        current.focusBrightness = input.dimmed ? 0.5 : 1;
        this.updateCharacterOpacity(current);
      }
      this.enterCharacter(slot, input);
      this.applyCharacterZOrder(input.focus ?? 0);
      return;
    }
    return this.withVisual(slot, input, "character", (built) => {
      if (!built && !input.nativeKey && !input.characterKey) return;
      const current = this.characterSlots.get(slot);
      const fadeMs = this.characterFadeDuration(current, input);
      // Set (2791 @ 0x184237BC0) resets the offset before loading a different
      // key unless an enter supplies the position or char_empty was loaded.
      if (
        !input.enterFrom &&
        holders.currentKey?.toLowerCase() !== EMPTY_CHARACTER
      ) {
        this.resetSlotPosition(slot);
        this.updateSlotMotion(slot);
      }
      if (built) this.mountCharacter(input, slot, built, fadeMs);
      else this.clearSlot(slot, fadeMs, "load-failed");
      this.enterCharacter(slot, input);
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
    for (const { sequence } of Object.values(this.slotActionTargets))
      this.tweens.killTarget(sequence);
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
        this.startJumpAction(
          state.slot,
          {
            x: state.motion.actionX + input.xOffset,
            y: state.motion.actionY + input.yOffset,
          },
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
    fadeMs?: number,
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
    const durationMs = fadeMs ?? 0;
    let middleAnimation: ExecutionHandle | void = undefined;
    for (const key of ["l", "r", "m"] as const) {
      if (durationMs <= 0) {
        this.resetSlot(key);
        continue;
      }
      this.resetSlotShake(key);
      this.clearSlot(key, durationMs, "animated-clear");
      const clearTween = this.tweens.start(durationMs, () => {}, {
        onComplete: () => this.finishSlotClear(key),
      });
      const isMiddle = key === "m";
      const animation = this.trackSlotSequence(
        key,
        durationMs,
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
    this.resetSlotPosition(slot);
    this.slotMotions[slot].rotationDeg = 0;
    this.resetSlotShake(slot);
    this.clearSlot(slot);
  }

  private resetSlotPosition(slot: CharacterSlot): void {
    const motion = this.slotMotions[slot];
    motion.actionX = 0;
    motion.actionY = 0;
  }

  private resetSlotShake(slot: CharacterSlot): void {
    // _ResetLocationAndTween completes stand-alone shake tweens on its
    // shake container. Nested charslot tracks remain owned by their sequence.
    const target = this.slotActionTargets[slot].shake;
    this.tweens.killTarget(target, true);
    this.replayCallback(target);
    this.stopShakeAction(slot);
  }

  private discardBackHolder(slot: CharacterSlot): void {
    const back = this.backHolders.get(slot);
    if (back) this.disposeCharacterState(back);
  }

  private clearSlot(
    slot: CharacterSlot,
    fadeMs?: number,
    mode: "clear" | "load-failed" | "animated-clear" | "char_empty" = "clear",
  ): void {
    this.discardBackHolder(slot);
    const state = this.characterSlots.get(slot);
    this.characterSlots.delete(slot);
    const front = state?.root.parent ? state : undefined;
    const holders = this.slotHolders[slot];
    // SlotCleanChar (2791 @ 0x184238580) loads char_empty. The animated clear's
    // ClearSelfAndImageHolders (0x184236E00) then swaps it out through Set(null).
    const swapHolders =
      mode === "load-failed" ||
      mode === "animated-clear" ||
      (mode === "clear" && holders.currentKey !== undefined);
    holders.currentKey =
      mode === "char_empty" || mode === "animated-clear"
        ? EMPTY_CHARACTER
        : undefined;
    if (!state && !swapHolders) return;
    if (swapHolders) this.swapImageHolders(slot);
    const fade = front !== undefined && fadeMs !== undefined;
    this.sceneEffects.setImageFocusTargets(
      slot,
      undefined,
      fade ? front.visual : undefined,
      swapHolders,
    );
    if (fade) this.fadeOutAndRemove(front, fadeMs);
    else if (state) this.disposeCharacterState(state);
  }

  /** CharacterPanel / AVGCharacterslotPanel.OnStoryEnd (2791 @ 0x1841BFC50 / 0x1841A1360). */
  reset(): void {
    this.cancelPreparation();
    this.clearSlotSequences();
    for (const { offset, shake } of Object.values(this.slotActionTargets)) {
      this.tweens.killTarget(offset);
      this.tweens.killTarget(shake);
    }
    for (const motion of Object.values(this.slotMotions))
      Object.assign(motion, createSlotMotion());
    this.tweens.killTarget(this.characterZoomTweens);
    const states = [
      ...this.characterSlots.values(),
      ...this.backHolders.values(),
    ];
    this.characterSlots.clear();
    for (const state of states) this.disposeCharacterState(state);
    for (const holders of Object.values(this.slotHolders))
      holders.currentKey = undefined;
  }

  destroy(): void {
    this.reset();
    this.characterArt.destroy();
  }

  private tween(
    target: object,
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
      target: options?.target ?? target,
    });
  }

  private mountCharacter(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual,
    imageFadeMs: number,
  ): void {
    const { front: state, back } = this.swapArtwork(input, slot, built);
    state.focusBrightness = input.dimmed ? 0.5 : 1;
    this.applyCharacterSlotOpacity(
      state,
      {
        alphaFrom: input.enterFrom && input.transType === 2 ? 1 : 0,
        alphaTo: 1,
      },
      imageFadeMs,
      true,
    );
    if (back) this.fadeOutAndRemove(back, imageFadeMs);
    this.applyCharacterZOrder(input.focus ?? 0);
    this.updateCharacterState(state);
  }

  private characterFadeDuration(
    previous: CharacterRenderState | undefined,
    input: CharacterSlotInput,
  ): number {
    // _ProcessDurationWithTransType (2791 @ 0x1841C20A0) skips the image
    // fade for enter with NONE. Set also skips it between expressions.
    if (input.enterFrom && !input.transType) return 0;
    if (previous?.fadeIdentity === (input.fadeIdentity ?? input.characterKey))
      return 0;
    return Math.max(0, input.durationMs ?? 0);
  }

  /** CharacterPanel._ProcessSlot (2791 @ 0x1841C2800) enters on the fixed offset. */
  private enterCharacter(slot: CharacterSlot, input: CharacterSlotInput): void {
    if (!input.enterFrom) return;
    const motion = this.slotMotions[slot];
    const { x, y } = this.enterOffset(
      slot,
      input.enterFrom,
      input.enterPosition,
    );
    motion.actionX = x;
    motion.actionY = -y;
    this.updateSlotMotion(slot);
    const durationMs = input.durationMs ?? 0;
    this.tweenSlotPosition(
      slot,
      0,
      0,
      isZeroFloat(durationMs / 1000) ? 0 : durationMs,
      easeOutCubic,
      easeOutCubic,
    );
  }

  private applySlotUpdate(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual | null,
  ): void {
    const durationMs = Math.max(0, input.durationMs ?? 0);
    if (input.nativeKey === EMPTY_CHARACTER) {
      // _UpdateSeqWithParam (2791 @ 0x1841A9600) swaps twice through
      // SlotCleanChar and SlotSetCharWithParam. The final front is transparent.
      this.clearSlot(slot, undefined, EMPTY_CHARACTER);
    } else if (!built && (input.nativeKey || input.characterKey)) {
      // _SlotSetCharInternal (2791 @ 0x18423A040) swaps before _LoadImage.
      this.clearSlot(slot, durationMs, "load-failed");
    }
    let state: CharacterRenderState;
    if (built) {
      const { front, back } = this.swapArtwork(input, slot, built);
      state = front;
      if (back)
        this.fadeOutAndRemove(back, Math.max(0, input.replaceFadeMs ?? 0));
    } else {
      state = this.getSlotState(slot);
    }
    if (input.focusMode) this.applyCharacterSlotFocus(input.focusSlots ?? []);

    const { motion } = state;
    const sequenceTarget = this.slotActionTargets[slot].sequence;
    // AVGCharacterslotPanel.NeedSkipAnimation (2791 @ 0x1841A0FC0)
    // chooses immediate offset writes and skips shake for near-zero time.
    const movementMs = isZeroFloat(durationMs / 1000) ? 0 : durationMs;
    const move = characterSlotMove(motion, input, movementMs);
    const zoom = characterSlotZoom(input);

    // SlotMoveChar writes `localPosition = posFrom` when the tween is
    // created, so the start of a move lands on the spot even when the tween
    // itself has a duration.
    if (move) {
      motion.actionX = move.from.x;
      motion.actionY = move.from.y;
    }
    this.updateCharacterState(state);
    this.updateSlotMotion(slot);

    // `_GenSlotActionTw`: NeedSkipAnimation(duration) makes the shake branch
    // return null -- shake (and shakemove's shake half) only exists with a
    // positive duration.
    if (
      (input.action === "shake" || input.action === "shakemove") &&
      movementMs > 0
    ) {
      this.startShakeAction(
        state,
        {
          durationMs: movementMs,
          power: Math.max(0, input.power ?? 0),
          randomness: input.randomness ?? 10,
          stop: Boolean(input.stop),
          times: input.times ?? 0,
        },
        { target: sequenceTarget },
      );
    }

    if (input.action === "jump" && move && movementMs > 0)
      this.startJumpAction(
        slot,
        move.to,
        Math.max(0, input.power ?? 0),
        input.times ?? 0,
        movementMs,
        { target: sequenceTarget },
      );

    // Native drives rotation from the standalone `angle` parameter segment
    // at the tail of `_UpdateSeqWithParam`; `action="rotate"` itself is an
    // unknown action in 2.7.61's `_GenSlotActionTw` (LogError + null).
    if (input.angle !== undefined) {
      const sessionId = ++motion.rotateSessionId;
      const fromAngle = motion.rotationDeg;
      const direction = input.inverse ? -1 : 1;
      const toAngle = direction * (input.angle + 360 * (input.circles ?? 0));
      this.tween(
        state,
        durationMs,
        (progress) => {
          if (motion.rotateSessionId !== sessionId) return;
          motion.rotationDeg = fromAngle + (toAngle - fromAngle) * progress;
          this.updateSlotMotion(slot);
        },
        undefined,
        { target: sequenceTarget },
      );
    }

    this.applyCharacterSlotOpacity(state, input, durationMs, built !== null);

    // The move (`_offset.localPosition`) and the zoom (the fore Image's
    // pivot/localScale) are independent tweens natively: an image swap
    // resets the zoom but leaves a running move alone, and a command whose
    // from == to starts nothing, so an in-flight tween of either kind
    // survives an unrelated command.
    if (
      move &&
      (input.action !== "jump" || movementMs <= 0) &&
      (move.from.x !== move.to.x || move.from.y !== move.to.y)
    ) {
      const moveDurationMs = input.action === "setpos" ? 0 : movementMs;
      const { from, to } = move;
      this.tween(
        state,
        moveDurationMs,
        (progress) => {
          motion.actionX = from.x + (to.x - from.x) * progress;
          motion.actionY = from.y + (to.y - from.y) * progress;
          this.updateSlotMotion(slot);
        },
        undefined,
        { target: sequenceTarget },
      );
    }

    if (zoom)
      this.tweenZoom(state, zoom, durationMs, { target: sequenceTarget });
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
    const holder = this.slotHolders[slot].front;
    const state: CharacterRenderState = {
      baseScaleX: 1,
      baseScaleY: 1,
      contentAlpha: 1,
      focusBrightness: 1,
      height: 0,
      holder,
      motion: this.slotMotions[slot],
      motionLayer,
      opacitySessionId: 0,
      root,
      rotationLayer,
      scaleX: 1,
      scaleY: 1,
      slot,
      visual,
      width: 0,
      zoomShiftX: 0,
      zoomShiftY: 0,
    };
    holder.state = state;
    return state;
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
    // _GenForeImageTween (2791 @ 0x184238ED0) targets the physical front
    // Image at creation. Earlier opacity tracks cannot write to this holder.
    state.opacitySessionId += 1;
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

  /**
   * AVGCharacterSlot._SwapImages (2791 @ 0x18423A2E0) reuses the old back
   * Image for incoming art. Each holder keeps its own image transform.
   */
  private swapArtwork(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual,
  ): { front: CharacterRenderState; back?: CharacterRenderState } {
    this.discardBackHolder(slot);
    const current = this.characterSlots.get(slot);
    const back = current?.root.parent ? current : undefined;
    if (current && !back) this.disposeCharacterState(current);
    this.swapImageHolders(slot);
    this.slotHolders[slot].currentKey = input.nativeKey ?? input.characterKey;
    const front = this.createSlotState(slot);
    if (back) {
      front.contentAlpha = back.contentAlpha;
      front.focusBrightness = back.focusBrightness;
    }
    this.discardCharacterVisual(front.visual);
    this.attachSlotArt(front, input, built);
    this.characterSlots.set(slot, front);
    if (back) {
      this.charLayer.addChildAt(
        front.root,
        this.charLayer.getChildIndex(back.root) + 1,
      );
    } else {
      this.charLayer.addChild(front.root);
    }
    this.sceneEffects.setImageFocusTargets(slot, front.visual, back?.visual);
    return { front, back };
  }

  private swapImageHolders(slot: CharacterSlot): void {
    const pair = this.slotHolders[slot];
    [pair.front, pair.back] = [pair.back, pair.front];
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
    input: Pick<CharacterSlotInput, "alphaFrom" | "alphaTo">,
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
   * The native call moves the slot transform with both image holders.
   */
  private applyCharacterZOrder(focus: number): void {
    const ufocus = focus >>> 0;
    let order: CharacterSlot[] = ["l", "r", "m"];
    if (ufocus === 1) order = ["r", "m", "l"];
    else if (ufocus === 2) order = ["l", "m", "r"];
    for (const slot of order) {
      const back = this.backHolders.get(slot)?.root;
      const front = this.characterSlots.get(slot)?.root;
      for (const root of [back, front]) {
        if (root?.parent === this.charLayer)
          this.charLayer.setChildIndex(
            root,
            this.charLayer.children.length - 1,
          );
      }
    }
  }

  private fadeOutAndRemove(
    state: CharacterRenderState,
    durationMs: number,
  ): void {
    this.backHolders.set(state.slot, state);
    const startAlpha = state.root.alpha;
    this.tween(
      state,
      durationMs,
      (progress) => {
        state.root.alpha = startAlpha * (1 - progress);
      },
      () => this.disposeCharacterState(state),
      { deferZeroDuration: true },
    );
  }

  private updateCharacterState(state: CharacterRenderState): void {
    this.applySlotMotion(state);
    state.motionLayer.scale.set(
      state.baseScaleX * state.scaleX,
      state.baseScaleY * state.scaleY,
    );
    this.updateCharacterOpacity(state);
  }

  private applySlotMotion(state: CharacterRenderState): void {
    const { motion } = state;
    state.motionLayer.x =
      motion.actionX + state.zoomShiftX + motion.shakeOffsetX;
    state.motionLayer.y =
      motion.shakeOffsetY - motion.actionY - state.zoomShiftY;
    state.rotationLayer.rotation = (motion.rotationDeg * Math.PI) / 180;
  }

  private updateSlotMotion(slot: CharacterSlot): void {
    const front = this.characterSlots.get(slot);
    if (front) this.applySlotMotion(front);
    const back = this.backHolders.get(slot);
    if (back) this.applySlotMotion(back);
  }

  private updateCharacterOpacity(state: CharacterRenderState): void {
    const channel = Math.round(0xff * clamp01(state.focusBrightness));
    state.visual.tint = (channel << 16) | (channel << 8) | channel;
    // Unity's Color -> Color32 conversion clamps the vertex alpha, so a tween
    // toward a negative `ato` reads as fully transparent once it crosses 0.
    state.visual.alpha = clamp01(state.contentAlpha);
  }

  private disposeCharacterState(state: CharacterRenderState): void {
    if (this.backHolders.get(state.slot) === state)
      this.backHolders.delete(state.slot);
    if (state.holder.state === state) state.holder.state = undefined;
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

  private stopShakeAction(slot: CharacterSlot): void {
    const motion = this.slotMotions[slot];
    motion.shakeSessionId += 1;
    motion.shakeOffsetX = 0;
    motion.shakeOffsetY = 0;
    this.updateSlotMotion(slot);
  }

  /**
   * Native port: AVGCharacterSlot.MoveChar (2791 @ 0x1842370A0). Relative
   * displacement (cur + (x, y)); a zero fadeTime applies it instantly and
   * returns a null tween, which is why `block` only waits when there is a
   * tween to wait for. The tween runs `DOLocalMove(...).SetEase(Ease.OutCubic)`,
   * so the move branch eases with OutCubic on both axes.
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
    this.tweenSlotPosition(
      state.slot,
      state.motion.actionX + xOffset,
      state.motion.actionY + yOffset,
      durationMs,
      ease,
      easeY,
      completion,
    );
  }

  private tweenSlotPosition(
    slot: CharacterSlot,
    toX: number,
    toY: number,
    durationMs: number,
    easeX: EaseCurve,
    easeY: EaseCurve,
    options?: TweenStartOptions,
    jumpArc?: EaseCurve,
  ): void {
    const motion = this.slotMotions[slot];
    let start: CharacterSlotPoint | undefined;
    this.tween(
      this.slotActionTargets[slot].offset,
      durationMs,
      (progress) => {
        // DOTween samples the fixed transform when the tween first updates.
        // Overlapping moves write in the runner's active order.
        const { x, y } = (start ??= { x: motion.actionX, y: motion.actionY });
        motion.actionX = x + (toX - x) * easeX(progress);
        motion.actionY =
          y + (toY - y) * easeY(progress) + (jumpArc?.(progress) ?? 0);
        this.updateSlotMotion(slot);
      },
      undefined,
      options,
    );
  }

  private runScaleAction(
    state: CharacterRenderState,
    scaleX: number | undefined,
    scaleY: number | undefined,
    pivot: CharacterSlotPoint | undefined,
    durationMs: number,
    completion: TweenStartOptions,
  ): void {
    const zoom = characterZoom(
      isFiniteNumber(scaleX) ? scaleX : state.scaleX,
      isFiniteNumber(scaleY) ? scaleY : state.scaleY,
      pivot,
    );
    this.tweenZoom(state, zoom, durationMs, completion);
  }

  /**
   * CharZoom (2791 @ 0x184236B10) captures the physical RectTransform
   * in its setter (0x18424A230). A later load can put new art in that holder.
   * Interpolate the Web pivot shift in portrait-relative units.
   */
  private tweenZoom(
    state: CharacterRenderState,
    to: CharacterSlotZoomState,
    durationMs: number,
    options: TweenStartOptions,
  ): void {
    const { holder } = state;
    const from = {
      scaleX: state.scaleX,
      scaleY: state.scaleY,
      shiftX: state.zoomShiftX / (state.width || 1),
      shiftY: state.zoomShiftY / (state.height || 1),
    };
    this.tween(
      holder,
      durationMs,
      (progress) => {
        const image = holder.state;
        if (!image) return;
        image.scaleX = from.scaleX + (to.scaleX - from.scaleX) * progress;
        image.scaleY = from.scaleY + (to.scaleY - from.scaleY) * progress;
        image.zoomShiftX =
          (from.shiftX + (to.shiftX - from.shiftX) * progress) * image.width;
        image.zoomShiftY =
          (from.shiftY + (to.shiftY - from.shiftY) * progress) * image.height;
        this.updateCharacterState(image);
      },
      undefined,
      { ...options, deferZeroDuration: true },
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

    this.tweenSlotPosition(
      state.slot,
      toX,
      toY,
      durationMs,
      easeOutCubic,
      easeOutCubic,
      completion,
    );
  }

  /**
   * CharJump (2791 @ 0x184236650) creates DOLocalJump (0x184431260) on
   * the fixed offset. The Sequence applies OutCubic to its time
   * (Sequence.DoApplyTween @ 0x18442BE00). The X track is linear and the
   * Y setter combines the OutQuad displacement with an OutQuad yoyo arc.
   */
  private startJumpAction(
    slot: CharacterSlot,
    to: CharacterSlotPoint,
    power: number,
    times: number,
    durationMs: number,
    completion?: TweenStartOptions,
  ): void {
    const cycles = Math.max(1, times);
    this.tweenSlotPosition(
      slot,
      to.x,
      to.y,
      durationMs,
      easeOutCubic,
      (progress) => easeOutQuad(easeOutCubic(progress)),
      completion,
      (progress) => {
        const cyclePos = easeOutCubic(progress) * cycles * 2;
        const cycle = Math.floor(cyclePos);
        const frac = cyclePos - cycle;
        const arc = cycle % 2 === 0 ? easeOutQuad(frac) : easeOutQuad(1 - frac);
        return power * arc;
      },
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
    const { motion, slot } = state;
    this.stopShakeAction(slot);
    // `stop` is a web extension: native has no such key, so it only needs to
    // cancel above without producing a tween.
    if (input.stop) return;

    const sessionId = motion.shakeSessionId;
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
        if (motion.shakeSessionId !== sessionId) return;
        const offset = sampleShakePath(path, progress);
        motion.shakeOffsetX = offset.x;
        motion.shakeOffsetY = -offset.y;
        this.updateSlotMotion(slot);
      },
      () => {
        if (motion.shakeSessionId !== sessionId) return;
        motion.shakeOffsetX = 0;
        motion.shakeOffsetY = 0;
        this.updateSlotMotion(slot);
      },
      completion,
    );
  }

  private isActiveCharacterState(state: CharacterRenderState): boolean {
    return this.characterSlots.get(state.slot) === state;
  }
}
