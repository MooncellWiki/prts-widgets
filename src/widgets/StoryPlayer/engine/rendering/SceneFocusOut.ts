import {
  browserAnimationClock,
  createExecutionHandle,
  type ExecutionEndReason,
  type ExecutionHandle,
} from "../execution";

import type { FocusOutInput, FocusParamInput } from "../types";
import type { TweenRunner } from "./core/TweenRunner";
import type { Container } from "pixi.js";

interface FocusState {
  amount: number;
  endTween?: (reason: ExecutionEndReason) => void;
  id: string;
}

interface PostDisplay {
  amount: number;
  soft: boolean;
  target?: Container;
}

export interface FocusTarget {
  amount: number;
  soft: boolean;
  target: Container;
}

export interface FocusFrame {
  config: FocusParamInput;
  targets: Iterable<FocusTarget>;
}

const imageChannels = {
  bg: ["ck_bg_1", "ck_bg_2"],
  cg: ["ck_cg_1", "ck_cg_2"],
  l: ["ck_char_left_1", "ck_char_left_2"],
  m: ["ck_char_middle_1", "ck_char_middle_2"],
  r: ["ck_char_right_1", "ck_char_right_2"],
} as const;

export type FocusImagePair = keyof typeof imageChannels;

const largeBackgroundChannels = [
  "ck_lbg_1",
  "ck_lbg_2",
  "ck_lbg_3",
  "ck_lbg_4",
] as const;

// AVGCameraEffect._GenCfgByType (2791 @ 0x184187FB0) expands fixed
// types to these ids. A cgitem command can address any exact id.
const focusChannels = new Map<string, readonly string[]>([
  ["bg", imageChannels.bg],
  ["cg", imageChannels.cg],
  ["char", [...imageChannels.l, ...imageChannels.m, ...imageChannels.r]],
  ["lbg", largeBackgroundChannels],
]);

/**
 * Port scope: `Torappu.AVG.AVGCameraEffect._ExecuteFocusout` and
 * `_ExecuteFocusParam` and `AVGSceneFocusOut` channel state. Each bound
 * PostDisplay owns its last amount even when the channel is rebound.
 */
export class SceneFocusOut {
  private readonly states = new Map<string, FocusState>();
  private readonly bindings = new Map<string, PostDisplay>();
  private readonly fixedSlots = new Map<string, PostDisplay>();
  private readonly cgItems = new Map<Container, PostDisplay>();
  private readonly swappedPairs = new Set<FocusImagePair>();
  private config: FocusParamInput = { blur: true, color: "None" };

  constructor(
    private readonly tween: TweenRunner["run"],
    private readonly now = browserAnimationClock.now,
  ) {
    for (const [type, ids] of focusChannels) {
      for (const id of ids) {
        // BindPostDisplay (2791 @ 0x1841D04F0) uses SoftItem for LBKG/CHAR_SLOT.
        const slot = { amount: 0, soft: type === "char" || type === "lbg" };
        this.fixedSlots.set(id, slot);
        this.bindings.set(id, slot);
      }
    }
  }

  setParam(input: FocusParamInput): void {
    this.config = input;
  }

  get frame(): FocusFrame | undefined {
    if (!this.config.blur && this.config.color === "None") return;
    // AVGSceneFocusOut.GetActiveChannels (2791 @ 0x1841FA450) checks the
    // stored values (including those waiting for a sprite) with MathUtil.GT.
    for (const state of this.states.values()) {
      if (state.amount > 1e-5)
        return { config: this.config, targets: this.targets() };
    }
  }

  setFocus(
    input: FocusOutInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    // _ExecuteFocusout (2791 @ 0x184187C20) checks IsChannelEmpty before
    // writing or tweening. A cgitem with an id can store an amount before
    // its target binds. The Web renderer has no customchar slots.
    const ids =
      input.type === "cgitem"
        ? input.id
          ? [input.id]
          : []
        : (focusChannels.get(input.type) ?? []);
    if (ids.length === 0) return;

    // _SetEffectAmount (2791 @ 0x1841D38B0) releases the old tween's
    // callback only after every channel has completed or been interrupted.
    const states = ids.map((id) => {
      const state = this.states.get(id) ?? { amount: 0, id };
      this.states.set(id, state);
      state.endTween?.("force_end");
      return state;
    });
    if (input.from !== undefined) {
      for (const state of states) this.writeAmount(state, input.from);
    }
    if (input.durationMs <= 0) {
      for (const state of states) this.writeAmount(state, input.to);
      return;
    }

    const animation = input.block
      ? createExecutionHandle(true, (reason) => {
          if (reason === "complete" || reason === "force_end") onComplete?.();
        })
      : undefined;
    const active = new Map(states.map((state) => [state, state.amount]));
    for (const state of states) {
      state.endTween = (reason) => {
        state.endTween = undefined;
        active.delete(state);
        if (active.size === 0) animation?.end(reason);
      };
    }
    const update = (progress: number) => {
      if (active.size === 0) return;
      // Native AVGSceneEffectManager._SetEffectAmount uses TweenUtils.SmoothStep.
      const eased = progress * progress * (3 - 2 * progress);
      for (const [state, from] of active)
        this.writeAmount(state, from + (input.to - from) * eased);
    };
    void this.tween(
      input.durationMs,
      update,
      () => {
        if (active.size === 0) return;
        update(1);
        for (const state of active.keys()) state.endTween?.("complete");
      },
      // SmoothStep.Start resets a ScaledStopwatch (2791 @ 0x1869B6790).
      { isAlive: () => active.size > 0, now: this.now },
    );
    return animation;
  }

  reset(): void {
    for (const state of this.states.values()) state.endTween?.("reset");
    this.states.clear();
    this.cgItems.clear();
    this.swappedPairs.clear();
    this.bindings.clear();
    for (const [id, slot] of this.fixedSlots) {
      slot.amount = 0;
      slot.target = undefined;
      this.bindings.set(id, slot);
    }
    this.config = { blur: true, color: "None" };
  }

  /**
   * AVGImagePanel._SwapImages and AVGCharacterSlot._SwapImages (2791
   * @ 0x1841AE700 / 0x18423A2E0) swap the holders with the images, so the
   * incoming art takes the old back channel. Pixi creates new visuals.
   */
  setImageTargets(
    pair: FocusImagePair,
    fore?: Container,
    back?: Container,
    swap = true,
  ): void {
    if (swap && !this.swappedPairs.delete(pair)) this.swappedPairs.add(pair);
    const [first, second] = imageChannels[pair];
    const swapped = this.swappedPairs.has(pair);
    this.fixedSlots.get(first)!.target = swapped ? back : fore;
    this.fixedSlots.get(second)!.target = swapped ? fore : back;
  }

  /** LargeBackgroundPanel._BindCamEffectTarget (2791 @ 0x1841D81E0). */
  setLargeBackgroundTargets(targets: readonly Container[]): void {
    for (const [index, id] of largeBackgroundChannels.entries())
      this.fixedSlots.get(id)!.target = targets[index];
  }

  releaseFixedTarget(target: Container): void {
    for (const slot of this.fixedSlots.values()) {
      if (slot.target !== target) continue;
      slot.target = undefined;
      break;
    }
  }

  /**
   * Native provenance: `AVGSceneFocusOut.TryRegister` + `SetWhenBind.Bind`
   * replay a channel's stored amount the moment a PostDisplay item
   * registers. SetWhenBind (2791 @ 0x185583670) stores one target per key.
   * A same-key show during a clear-all fade rebinds subsequent writes to
   * the new image.
   */
  bindCgItem(id: string, target: Container): void {
    const display = { amount: this.states.get(id)?.amount ?? 0, soft: true };
    this.bindings.set(id, display);
    this.cgItems.set(target, display);
  }

  /**
   * Native provenance: `PostDisplayItem.Dispose` runs
   * `AVGSceneFocusOut.BeforeItemDisposed` (2791 @ 0x1841FA3B0). It
   * removes the channel by id even if a newer image was already bound.
   * TweenAction can still write a pending amount through SetAmount, which
   * creates a fresh entry without a target until the next bind.
   */
  releaseCgItem(id: string, target: Container): void {
    this.bindings.delete(id);
    this.cgItems.delete(target);
    const state = this.states.get(id);
    if (state) state.amount = 0;
  }

  private writeAmount(state: FocusState, amount: number): void {
    state.amount = amount;
    const display = this.bindings.get(state.id);
    if (display) display.amount = amount;
  }

  private *targets(): IterableIterator<FocusTarget> {
    for (const { target, amount, soft } of this.fixedSlots.values()) {
      if (target && amount > 0) yield { target, amount, soft };
    }
    for (const [target, { amount, soft }] of this.cgItems) {
      if (amount > 0) yield { target, amount, soft };
    }
  }
}
