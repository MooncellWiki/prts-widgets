import { CanvasSource, Container, Sprite, Texture } from "pixi.js";

import { describeCharacterPortrait } from "../../characterPortrait";
import { hasTweenDuration, isZeroFloat } from "../../commandParams";
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
import { dotweenDefaultEase, type EaseCurve } from "../core/DotweenEase";
import { rotateTweenDelta } from "../core/SceneGeometry";
import { buildShakePath, sampleShakePath } from "../core/ShakePath";

import type { Context } from "../../../context";
import type { SceneEffectManager } from "../SceneEffectManager";
import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner, TweenStartOptions } from "../core/TweenRunner";

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
  pivotX: number;
  pivotY: number;
  scaleX: number;
  scaleY: number;
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
      // _UpdateSeqWithParam (2791 @ 0x1841A9600) compares the plain move's
      // posFrom to Vector2.one, including a script that supplies that value.
      const from = input.positionFrom;
      if (
        !from ||
        (input.action === undefined &&
          (from.x - 1) ** 2 + (from.y - 1) ** 2 < 1e-10)
      )
        return null;
      return { from, to: posTo };
    }
    case "shakemove": {
      // SlotMoveChar(posFrom, posTo, duration) verbatim, sentinel included.
      return { from: input.positionFrom ?? CHARSLOT_POINT_DEFAULT, to: posTo };
    }
    case "jump": {
      if (durationMs !== 0) {
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

function characterZoom(
  scaleX: number,
  scaleY: number,
  { x, y }: CharacterSlotPoint = { x: 0.5, y: 0.5 },
): CharacterSlotZoomState {
  return {
    pivotX: x,
    pivotY: y,
    scaleX,
    scaleY,
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
  shakeOffsetX: number;
  shakeOffsetY: number;
  shakeSessionId: number;
}

function createSlotMotion(): CharacterSlotMotion {
  return {
    actionX: 0,
    actionY: 0,
    rotationDeg: 0,
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

interface CharacterRenderState extends CharacterSlotZoomState {
  baseScaleX: number;
  baseScaleY: number;
  contentAlpha: number;
  focusBrightness: number;
  expression?: string;
  fadeIdentity?: string;
  height: number;
  holder: CharacterImageHolder;
  imageLayer: Container;
  motion: CharacterSlotMotion;
  motionLayer: Container;
  restPosition: CharacterSlotPoint;
  root: Container;
  slot: CharacterSlot;
  visual: Container;
  width: number;
}

// Derived from the legacy 960-space anchors [330, 480, 630].
const SLOT_BASE_X = { l: 440, m: 640, r: 840 } as const;

interface SlotTrack {
  startMs: number;
  endMs: number;
  durationMs: number;
  step: (progress: number) => void;
  onComplete?: () => void;
  finished: boolean;
}

interface SlotSequence {
  elapsedMs: number;
  endMs: number;
  endRequested: boolean;
  onComplete?: () => void;
  status: "unlocked" | "locked" | "inactive";
  stop?: () => void;
  tracks: SlotTrack[];
  waits: ExecutionHandle[];
}

interface CharacterTweenOptions extends TweenStartOptions {
  sequence?: SlotSequence;
  sequenceDelayMs?: number;
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
  // Fixed sibling order in 2791 sharedassets1.assets, panel_character 3340.
  private readonly slotOrder: CharacterSlot[] = ["m", "l", "r"];
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
    l: { offset: {}, shake: {} },
    m: { offset: {}, shake: {} },
    r: { offset: {}, shake: {} },
  };
  private killingSlotOffset = false;
  private readonly characterZoomTweens = {};
  private readonly characterArt: CharacterArtLoader;

  constructor(
    private readonly charLayer: Container,
    private readonly linkMap: Context["linkMap"],
    loadTexture: (key: string) => TextureLoad,
    private readonly tweens: TweenRunner,
    private readonly sceneEffects: Pick<
      SceneEffectManager,
      "releaseFixedFocusTarget" | "setFocusExpression" | "setImageFocusTargets"
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
      this.raiseCharacterSlot(slot, input.focus);
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
      this.raiseCharacterSlot(slot, input.focus);
    });
  }

  updateSlot(
    input: CharacterSlotInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const slot = this.normalizeCharacterSlot(input.slot);
    return this.withVisual(slot, input, "charslot", (built, preparation) => {
      const sequence = this.getSlotSequence(slot);
      this.applySlotUpdate(input, slot, built, sequence);
      if (sequence.status !== "inactive" && input.sequenceEnd !== false) {
        sequence.endRequested = true;
        if (onComplete) sequence.onComplete = onComplete;
      }
      if (!input.block) return;
      const animation = preparation ?? createExecutionHandle(true);
      sequence.waits.push(animation);
      return animation;
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
    // _DoCleanSlot (2791 @ 0x1841A24F0) adds a nested OnComplete to clear the
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
   * Children share a single Update position among standalone tweens.
   */
  private getSlotSequence(slot: CharacterSlot): SlotSequence {
    const cached = this.slotSequences.get(slot);
    if (cached) return cached;
    const sequence: SlotSequence = {
      elapsedMs: 0,
      endMs: 0,
      endRequested: false,
      status: "unlocked",
      tracks: [],
      waits: [],
    };
    sequence.stop = this.tweens.subscribeUpdate((deltaMs) => {
      // TweenManager.Update (2791 @ 0x1844679F0) locks insertion before
      // advancing time. Sequence.DoStartup (0x18442C6F0) sorts by start
      // position and keeps ties in insertion order.
      if (sequence.status === "unlocked") {
        sequence.status = "locked";
        sequence.tracks.sort((a, b) => a.startMs - b.startMs);
      }
      // Sequence.ApplyInternalCycle (2791 @ 0x18442B5B0) advances children.
      const fromMs = sequence.elapsedMs;
      const toMs = Math.min(fromMs + deltaMs, sequence.endMs);
      sequence.elapsedMs = toMs;
      for (const track of sequence.tracks) {
        if (track.startMs > toMs) break;
        if (track.finished) {
          if (track.startMs <= 0 && track.endMs === fromMs) track.step(1);
          continue;
        }
        // A negative child can end before its start is reached.
        if (track.durationMs < 0 && fromMs >= track.endMs) continue;
        const progress =
          track.durationMs <= 0
            ? 1
            : clamp01((toMs - track.startMs) / track.durationMs);
        track.step(progress);
        if (progress === 1) {
          track.finished = true;
          track.onComplete?.();
        }
      }
      if (toMs < sequence.endMs) return;
      sequence.stop?.();
      sequence.stop = undefined;
      sequence.status = "inactive";
      sequence.tracks.length = 0;
      // _ExecuteCharslot's end callback (2791 @ 0x1841B61F0) marks the
      // cache played. An auto-killed end=false Sequence remains cached.
      if (sequence.endRequested) this.slotSequences.delete(slot);
      if (sequence.onComplete)
        this.signalFinish("charslot", sequence.onComplete);
      for (const wait of sequence.waits) wait.end();
      sequence.waits.length = 0;
    });
    this.slotSequences.set(slot, sequence);
    return sequence;
  }

  private clearSlotSequences(): void {
    for (const sequence of this.slotSequences.values()) {
      sequence.stop?.();
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
    // DOShakePosition (2791 @ 0x1844365E0) rejects negative durations.
    if (input.type === "shake" && input.durationMs < 0 && !input.stop) return;
    // _ExecuteCharacterMove / MoveChar (2791 @ 0x1841C0990 / 0x1842370A0)
    // operate on the fixed transform even when no artwork is displayed.
    const state = this.getSlotState(this.normalizeCharacterSlot(input.slot));
    const targets = this.slotActionTargets[state.slot];

    const canBlock = input.type === "zoom" || input.durationMs !== 0;
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
        // CharRotate / _ResetLocationAndTween (2791 @ 0x1842367D0 /
        // 0x184239CD0) kill the offset without OnComplete.
        if (!movesOffset || !this.killingSlotOffset) animation.end("reset");
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
      if (durationMs === 0) {
        this.resetSlot(key);
        continue;
      }
      // _DoCleanSlot (2791 @ 0x1841A24F0) calls ResetShakeTween before
      // SlotCleanChar. The clear tween resets the other transforms on completion.
      this.resetSlotShake(key);
      this.clearSlot(key, durationMs, "animated-clear");
      const sequence = this.getSlotSequence(key);
      sequence.endRequested = true;
      this.tween(
        sequence,
        durationMs,
        () => {},
        () => this.finishSlotClear(key),
        { sequence },
      );
      if (key === "m") {
        sequence.onComplete = onComplete;
        middleAnimation = createExecutionHandle(true);
        sequence.waits.push(middleAnimation);
      }
    }
    return middleAnimation;
  }

  private resetSlot(slot: CharacterSlot): void {
    this.killSlotOffset(slot);
    this.resetSlotPosition(slot);
    this.slotMotions[slot].rotationDeg = 0;
    this.resetSlotShake(slot);
    this.clearSlot(slot);
  }

  private killSlotOffset(slot: CharacterSlot): void {
    const target = this.slotActionTargets[slot].offset;
    this.deferredCallbacks.delete(target);
    this.killingSlotOffset = true;
    try {
      this.tweens.killTarget(target);
    } finally {
      this.killingSlotOffset = false;
    }
  }

  private resetSlotPosition(slot: CharacterSlot): void {
    const motion = this.slotMotions[slot];
    motion.actionX = 0;
    motion.actionY = 0;
  }

  private resetSlotShake(slot: CharacterSlot): void {
    // ResetShakeTween (2791 @ 0x184237360) completes standalone tweens on
    // the shake container. Nested charslot tracks remain owned by their sequence.
    const target = this.slotActionTargets[slot].shake;
    this.tweens.killTarget(target, true);
    this.replayCallback(target);
    this.resetShakePosition(slot);
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
    options?: CharacterTweenOptions,
  ): void {
    const { sequence, sequenceDelayMs = 0, ...tweenOptions } = options ?? {};
    if (
      sequence?.status === "unlocked" &&
      (durationMs !== 0 || tweenOptions.deferZeroDuration)
    ) {
      // _UpdateSeqWithTween (2791 @ 0x1841A9BE0) inserts at an absolute
      // position in the Sequence.
      // Sequence.DoInsert (0x18442C310) includes the signed child duration.
      const startMs = sequenceDelayMs;
      const endMs = startMs + durationMs;
      if (endMs < 0) return;
      sequence.endMs = Math.max(sequence.endMs, endMs);
      sequence.tracks.push({
        startMs,
        endMs,
        durationMs,
        step,
        onComplete: done,
        finished: false,
      });
      return;
    }
    // When Insert (2791 @ 0x18443C1B0) rejects a child, it stays in
    // DOTween's active list and plays independently of the cached Sequence.
    this.tweens.start(durationMs, step, {
      ...tweenOptions,
      // TweenManager.Update (2791 @ 0x1844679F0) completes standalone
      // negative tweens on Update, like zero-duration DOTween tweens.
      deferZeroDuration: durationMs < 0 || tweenOptions.deferZeroDuration,
      onComplete: () => {
        done?.();
        tweenOptions.onComplete?.();
      },
      target: tweenOptions.target ?? target,
    });
  }

  private mountCharacter(
    input: CharacterSlotInput,
    slot: CharacterSlot,
    built: CharacterBuiltVisual,
    imageFadeMs: number,
  ): void {
    const { front: state, back } = this.swapArtwork(input, slot, built);
    this.applyCharacterSlotOpacity(
      state,
      {
        alphaFrom: input.enterFrom && input.transType === 2 ? 1 : 0,
        alphaTo: 1,
        brightness: input.dimmed ? 0.5 : 1,
      },
      imageFadeMs,
      true,
    );
    if (back) this.fadeOutAndRemove(back, imageFadeMs);
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
    sequence: SlotSequence,
  ): void {
    const durationMs = input.durationMs ?? 0;
    const sequenceOptions = { sequence, sequenceDelayMs: input.delayMs };
    const blankPortrait = input.nativeKey === EMPTY_CHARACTER;
    if (blankPortrait) {
      // _UpdateSeqWithParam (2791 @ 0x1841A9600) swaps twice through
      // SlotCleanChar and SlotSetCharWithParam. The final front is transparent.
      this.clearSlot(slot, undefined, EMPTY_CHARACTER);
      this.tween(sequence, durationMs, () => {}, undefined, {
        ...sequenceOptions,
        deferZeroDuration: true,
      });
    } else if (!built && (input.nativeKey || input.characterKey)) {
      // _SlotSetCharInternal (2791 @ 0x18423A040) swaps before _LoadImage.
      // Its independently played back fade is outside the Sequence.
      this.clearSlot(slot, durationMs, "load-failed");
    }
    let state: CharacterRenderState;
    if (built) {
      const { front, back } = this.swapArtwork(input, slot, built);
      state = front;
      if (back) this.fadeOutAndRemove(back, input.replaceFadeMs ?? 0);
    } else {
      state = this.getSlotState(slot);
    }
    const focusSlots = input.focusMode
      ? new Set(
          input.focusSlots?.map((value) => this.normalizeCharacterSlot(value)),
        )
      : undefined;
    if (focusSlots)
      this.applyCharacterSlotFocus(
        focusSlots,
        input.focusDurationMs ?? 0,
        sequenceOptions,
        input.nativeKey || input.characterKey ? slot : undefined,
      );

    if (built) {
      this.applyCharacterSlotOpacity(
        state,
        {
          ...input,
          brightness: focusSlots ? (focusSlots.has(slot) ? 1 : 0.5) : undefined,
        },
        durationMs,
        true,
        sequenceOptions,
      );
    } else if (!input.nativeKey && !input.characterKey) {
      // SlotChangeAlpha (2791 @ 0x184238040) returns a timed tween only
      // if the front Image has a sprite. char_empty has a transparent sprite.
      const alphaMs = hasTweenDuration(durationMs / 1000) ? durationMs : 0;
      const hasSprite =
        state.root.parent !== null ||
        this.slotHolders[slot].currentKey === EMPTY_CHARACTER;
      if (alphaMs === 0 || hasSprite)
        this.applyCharacterSlotOpacity(
          state,
          input,
          alphaMs,
          false,
          sequenceOptions,
        );
    }

    const { motion } = state;
    // AVGCharacterslotPanel.NeedSkipAnimation (2791 @ 0x1841A0FC0)
    // chooses immediate offset writes and skips shake for near-zero time.
    const movementMs = isZeroFloat(durationMs / 1000) ? 0 : durationMs;
    const move = characterSlotMove(motion, input, movementMs);
    const zoom = characterSlotZoom(input);
    const moveDurationMs = input.action === "setpos" ? 0 : movementMs;

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
    // return null; DOShakePosition also returns null for negative durations.
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
        // _GenCharslotShakemove (2791 @ 0x1841A5040) starts CharShake on
        // the shake container and returns only SlotMoveChar to the Sequence.
        input.action === "shakemove" ? undefined : sequenceOptions,
      );
    }

    if (input.action === "jump" && move && movementMs !== 0) {
      this.startJumpAction(
        slot,
        move.to,
        Math.max(0, input.power ?? 0),
        input.times ?? 0,
        movementMs,
        sequenceOptions,
      );
    } else if (
      move &&
      (moveDurationMs !== 0 ||
        move.from.x !== move.to.x ||
        move.from.y !== move.to.y)
    ) {
      this.tweenSlotPosition(
        slot,
        move.to.x,
        move.to.y,
        moveDurationMs,
        easeOutCubic,
        easeOutCubic,
        sequenceOptions,
      );
    }

    if (zoom) {
      this.tweenZoom(state, zoom, durationMs, sequenceOptions);
    }

    // _UpdateSeqWithParam (2791 @ 0x1841A9600) inserts rotation after the
    // action tween. CharRotate (0x1842367D0) snaps localRotation for zero
    // time, or kills the outer offset tween and inserts a directed sweep.
    if (input.angle !== undefined) {
      if (movementMs === 0) {
        motion.rotationDeg = -input.angle;
        this.updateSlotMotion(slot);
      } else {
        this.killSlotOffset(slot);
        // CreateRotateTween (0x1841959A0) computes a Unity Z sweep at
        // dispatch, then DORotate LocalAxisAdd adds it to the startup pose.
        const delta = rotateTweenDelta(
          -motion.rotationDeg,
          input.angle,
          input.circles ?? 0,
          !!input.inverse,
        );
        let startAngle: number | undefined;
        this.tween(
          this.slotActionTargets[slot].offset,
          movementMs,
          (progress) => {
            startAngle ??= motion.rotationDeg;
            motion.rotationDeg = startAngle - delta * progress;
            this.updateSlotMotion(slot);
          },
          undefined,
          sequenceOptions,
        );
      }
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
    if (mounted.expression)
      this.sceneEffects.setFocusExpression(visual, mounted.expression);

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
    const imageLayer = new Container();
    const visual = new Container();
    imageLayer.addChild(visual);
    motionLayer.addChild(imageLayer);
    root.addChild(motionLayer);
    const holder = this.slotHolders[slot].front;
    const state: CharacterRenderState = {
      ...characterZoom(1, 1),
      baseScaleX: 1,
      baseScaleY: 1,
      contentAlpha: 1,
      focusBrightness: 1,
      height: 0,
      holder,
      imageLayer,
      motion: this.slotMotions[slot],
      motionLayer,
      restPosition: { x: 0, y: 0 },
      root,
      slot,
      visual,
      width: 0,
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
    state.restPosition = {
      x: SLOT_BASE_X[state.slot] - art.width / 2 + art.pos.x,
      y: STORY_HEIGHT - art.height / 2 - art.pos.y,
    };
    state.visual = art.visual;
    state.width = art.width;
    state.imageLayer.addChild(art.visual);
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
    // _LoadImage (2791 @ 0x184239340) resets the incoming Image color to white
    // before Set / SlotSetCharWithParam writes the starting alpha.
    const front = this.createSlotState(slot);
    this.discardCharacterVisual(front.visual);
    this.attachSlotArt(front, input, built);
    this.characterSlots.set(slot, front);
    if (back) {
      this.charLayer.addChildAt(
        front.root,
        this.charLayer.getChildIndex(back.root) + 1,
      );
    } else {
      this.mountInSlotOrder(front);
    }
    this.sceneEffects.setImageFocusTargets(slot, front.visual, back?.visual);
    return { front, back };
  }

  private swapImageHolders(slot: CharacterSlot): void {
    const pair = this.slotHolders[slot];
    [pair.front, pair.back] = [pair.back, pair.front];
  }

  private mountInSlotOrder({ root, slot }: CharacterRenderState): void {
    const above = this.slotOrder.slice(this.slotOrder.indexOf(slot) + 1);
    for (const other of above) {
      const next =
        this.backHolders.get(other)?.root ??
        this.characterSlots.get(other)?.root;
      if (next?.parent === this.charLayer) {
        this.charLayer.addChildAt(root, this.charLayer.getChildIndex(next));
        return;
      }
    }
    this.charLayer.addChild(root);
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

  private applyCharacterSlotFocus(
    active: ReadonlySet<CharacterSlot>,
    durationMs: number,
    options: CharacterTweenOptions,
    namedSlot?: CharacterSlot,
  ): void {
    // Native focus is a full re-resolve on every charslot:
    // `_ProcessFocusArray` (0x1841A6A00) clears all four flags, then lights
    // only the listed slots; unrecognized values light nothing.
    const animate = hasTweenDuration(durationMs / 1000);

    // _ProcessCharFocus (2791 @ 0x1841A6570) visits M/L/R before the named
    // slot's SetFocus call. SetFocus (0x184237760) raises the fixed slot
    // transform so its two Image holders move together.
    const order: CharacterSlot[] = ["m", "l", "r"];
    if (namedSlot) {
      order.splice(order.indexOf(namedSlot), 1);
      order.push(namedSlot);
    }
    for (const slot of order) {
      const hasBlankImage =
        this.slotHolders[slot].currentKey === EMPTY_CHARACTER;
      const state = hasBlankImage
        ? this.getSlotState(slot)
        : this.characterSlots.get(slot);
      const focused = active.has(slot);
      const activeImage =
        slot === namedSlot || hasBlankImage || state?.root.parent;
      if (state && activeImage) {
        const brightness = focused ? 1 : 0.5;
        if (animate) {
          // SetFocus (2791 @ 0x184237760) adds a DOColorWithoutAlpha
          // tween for this physical image to the executing slot's Sequence.
          const { holder } = state;
          let from: number | undefined;
          this.tween(
            state,
            durationMs,
            (progress) => {
              const image = holder.state;
              if (!image) return;
              from ??= image.focusBrightness;
              image.focusBrightness =
                from + (brightness - from) * dotweenDefaultEase(progress);
              this.updateCharacterOpacity(image);
            },
            undefined,
            options,
          );
        } else {
          state.focusBrightness = brightness;
          this.updateCharacterOpacity(state);
        }
      }
      if (focused && activeImage) this.raiseSlot(slot);
    }
  }

  private applyCharacterSlotOpacity(
    state: CharacterRenderState,
    input: Pick<CharacterSlotInput, "alphaFrom" | "alphaTo"> & {
      brightness?: number;
    },
    durationMs: number,
    hasNewArt: boolean,
    options?: CharacterTweenOptions,
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
    if (!hasNewArt && durationMs <= 0) {
      state.contentAlpha = toAlpha;
      this.updateCharacterOpacity(state);
      return;
    }

    // _GenForeImageTween (2791 @ 0x184238ED0) starts a DOColor on the
    // physical Image. It samples the start on Update and coexists with
    // other color tweens, including children already inserted in a Sequence.
    const { holder } = state;
    const toBrightness = input.brightness ?? state.focusBrightness;
    let from: { alpha: number; brightness: number } | undefined;
    const write = (progress: number) => {
      const image = holder.state;
      if (!image) return;
      from ??= { alpha: image.contentAlpha, brightness: image.focusBrightness };
      image.contentAlpha = from.alpha + (toAlpha - from.alpha) * progress;
      image.focusBrightness =
        from.brightness + (toBrightness - from.brightness) * progress;
      this.updateCharacterOpacity(image);
    };
    this.tween(state, durationMs, write, () => write(1), {
      ...options,
      deferZeroDuration: hasNewArt,
    });
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

  /** _ProcessSlot (2791 @ 0x1841C2800) raises only its own slot. */
  private raiseCharacterSlot(slot: CharacterSlot, focus?: number): void {
    if (
      slot === "m" ||
      (slot === "l" && focus === 1) ||
      (slot === "r" && focus === 2)
    )
      this.raiseSlot(slot);
  }

  private raiseSlot(slot: CharacterSlot): void {
    this.slotOrder.splice(this.slotOrder.indexOf(slot), 1);
    this.slotOrder.push(slot);
    const back = this.backHolders.get(slot)?.root;
    const front = this.characterSlots.get(slot)?.root;
    for (const root of [back, front]) {
      if (root?.parent === this.charLayer)
        this.charLayer.setChildIndex(root, this.charLayer.children.length - 1);
    }
  }

  private fadeOutAndRemove(
    state: CharacterRenderState,
    durationMs: number,
  ): void {
    // _GenBackImageTween (2791 @ 0x184238D60) kills standalone Image
    // tweens. A nested color track still belongs to its slot Sequence.
    this.tweens.killTarget(state);
    this.backHolders.set(state.slot, state);
    this.updateCharacterOpacity(state);
    let startAlpha: number | undefined;
    this.tween(
      state,
      durationMs,
      (progress) => {
        startAlpha ??= state.contentAlpha;
        state.contentAlpha = startAlpha * (1 - progress);
        this.updateCharacterOpacity(state);
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
    // The portrait has a fixed anchor. Convert the current scale and
    // bottom-left Unity pivot to the Pixi motion layer's top-left origin.
    const zoomX = (0.5 - state.pivotX * state.scaleX) * state.width;
    const zoomY = (0.5 - (1 - state.pivotY) * state.scaleY) * state.height;
    state.motionLayer.x = motion.actionX + zoomX + motion.shakeOffsetX;
    state.motionLayer.y = motion.shakeOffsetY - motion.actionY + zoomY;
    // CharRotate (2791 @ 0x1842367D0) rotates _offset above the shake and
    // image transforms. In sharedassets1.assets, _offset's pivot sits at
    // the built-in slot's bottom anchor (2686 / 2676 / 2830). Compensate
    // for the translation already on the motion layer before rotating.
    const pivotX = SLOT_BASE_X[state.slot] + motion.actionX;
    const pivotY = STORY_HEIGHT - motion.actionY;
    const x = state.restPosition.x - pivotX;
    const y = state.restPosition.y - pivotY;
    const angle = (motion.rotationDeg * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    state.root.rotation = angle;
    state.root.position.set(
      pivotX + x * cos - y * sin,
      pivotY + x * sin + y * cos,
    );
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
    const alpha = clamp01(state.contentAlpha);
    const isBack = this.backHolders.get(state.slot) === state;
    state.root.alpha = isBack ? alpha : 1;
    state.visual.alpha = isBack ? 1 : alpha;
  }

  private disposeCharacterState(state: CharacterRenderState): void {
    if (this.backHolders.get(state.slot) === state)
      this.backHolders.delete(state.slot);
    if (state.holder.state === state) state.holder.state = undefined;
    this.tweens.killTarget(state);
    for (const child of [...state.imageLayer.children])
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

  private resetShakePosition(slot: CharacterSlot): void {
    const motion = this.slotMotions[slot];
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
    options?: CharacterTweenOptions,
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
   * The setter interpolates pivot and scale separately before drawing.
   */
  private tweenZoom(
    state: CharacterRenderState,
    to: CharacterSlotZoomState,
    durationMs: number,
    options: CharacterTweenOptions,
  ): void {
    const { holder, pivotX, pivotY, scaleX, scaleY } = state;
    this.tween(
      this.characterZoomTweens,
      durationMs,
      (progress) => {
        const image = holder.state;
        if (!image) return;
        image.pivotX = pivotX + (to.pivotX - pivotX) * progress;
        image.pivotY = pivotY + (to.pivotY - pivotY) * progress;
        image.scaleX = scaleX + (to.scaleX - scaleX) * progress;
        image.scaleY = scaleY + (to.scaleY - scaleY) * progress;
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
    completion?: CharacterTweenOptions,
  ): void {
    if (durationMs < 0) {
      // DOLocalJump inserts both negative-duration children at zero. The
      // resulting empty time range still completes the Sequence on Update.
      this.tween(this.slotActionTargets[slot].offset, 0, () => {}, undefined, {
        ...completion,
        deferZeroDuration: true,
      });
      return;
    }
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
    completion?: CharacterTweenOptions,
  ): void {
    const { motion, slot } = state;
    // `stop` is a web extension: native has no such key, so it only needs to
    // stop the shake's writes without producing a tween.
    if (input.stop) {
      motion.shakeSessionId += 1;
      this.resetShakePosition(slot);
      return;
    }

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

    // SetShake -> SetPunch (2791 @ 0x184458DE0 / 0x184458C90) reads
    // the target on startup and adds that position to every waypoint.
    // Other shake tweens on this transform keep their Update order.
    let origin: CharacterSlotPoint | undefined;
    this.tween(
      this.slotActionTargets[slot].shake,
      durationMs,
      (progress) => {
        if (motion.shakeSessionId !== sessionId) return;
        origin ??= { x: motion.shakeOffsetX, y: motion.shakeOffsetY };
        const offset = sampleShakePath(path, progress);
        motion.shakeOffsetX = origin.x + offset.x;
        motion.shakeOffsetY = origin.y - offset.y;
        this.updateSlotMotion(slot);
      },
      undefined,
      completion,
    );
  }
}
