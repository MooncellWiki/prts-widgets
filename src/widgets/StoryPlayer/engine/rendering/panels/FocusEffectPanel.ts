import { BlurFilter, ColorMatrixFilter, type Container } from "pixi.js";

import { buildColorEffectMatrix } from "../core/ColorEffectMatrix";

import type { FocusOutInput, FocusParamInput } from "../../types";

type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;
type ResolveTargets = (type: string, id: string) => Container[];

interface FocusState {
  amount: number;
  id: string;
  sessionId: number;
  type: string;
}

function stateKey(type: string, id: string): string {
  return `${type}\u0000${id}`;
}

/**
 * Port scope: `Torappu.AVG.AVGCameraEffect._ExecuteFocusout` and
 * `_ExecuteFocusParam` channel state. Applying `BlurFilter` and
 * `ColorMatrixFilter` per PIXI container is a Web adaptation of the native
 * `AVGSceneEffectManager` post-processing pipeline.
 *
 * Native composites each registered item as "clean image x fully-processed
 * image" mixed by the channel amount (`AVGSceneFocusOut.Render` +
 * `mat_blit_ghost`; grayscale/inverse strength is a material constant and
 * amount only drives the blend -- amount=0.5 is a half mix, not a
 * half-strength effect). The color filters below reproduce that mix by
 * feeding `amount` straight into `buildColorEffectMatrix` (see the comment
 * in `render()` for the shader math). Blur keeps a strength-graded surrogate
 * for the blend because stock PIXI filters cannot composite two copies of
 * live content.
 */
export class FocusEffectPanel {
  private readonly states = new Map<string, FocusState>();
  private readonly cgItemTargets = new Map<string, Container>();
  private readonly cgItemAmounts = new Map<Container, number>();
  private readonly filteredTargets = new Set<Container>();
  private config: FocusParamInput = { blur: true, color: "None" };

  constructor(
    private readonly resolveTargets: ResolveTargets,
    private readonly tween: Tween,
  ) {}

  setParam(input: FocusParamInput): void {
    this.config = input;
    this.render();
  }

  async setFocus(input: FocusOutInput): Promise<void> {
    const key = stateKey(input.type, input.id);
    const state = this.states.get(key) ?? {
      amount: 0,
      id: input.id,
      sessionId: 0,
      type: input.type,
    };
    this.states.set(key, state);

    if (input.from !== undefined) {
      this.writeAmount(state, input.from);
    }

    const from = state.amount;
    const sessionId = ++state.sessionId;
    const run = this.tween(
      input.durationMs,
      (progress) => {
        if (state.sessionId !== sessionId) return;
        // Native provenance: `AVGSceneEffectManager._SetEffectAmount` tweens
        // each channel with `TweenUtils.SmoothStep` (slow at both ends), not
        // linear time.
        const eased = progress * progress * (3 - 2 * progress);
        this.writeAmount(state, from + (input.to - from) * eased);
      },
      () => {
        if (state.sessionId !== sessionId) return;
        this.writeAmount(state, input.to);
      },
    );

    if (input.block && input.durationMs > 0) await run;
    else void run;
  }

  destroy(): void {
    for (const state of this.states.values()) state.sessionId += 1;
    this.states.clear();
    this.cgItemTargets.clear();
    this.cgItemAmounts.clear();
    for (const target of this.filteredTargets) target.filters = [];
    this.filteredTargets.clear();
  }

  /**
   * Native provenance: `AVGSceneFocusOut.TryRegister` + `SetWhenBind.Bind`
   * replay a channel's stored amount the moment a PostDisplay item
   * registers. SetWhenBind (2791 @ 0x185583670) stores one target per key.
   * A same-key show during a clear-all fade rebinds subsequent writes to
   * the new image. Layer-backed types resolve their existing containers.
   */
  bindCgItem(id: string, target: Container): void {
    this.cgItemTargets.set(id, target);
    this.cgItemAmounts.set(
      target,
      this.states.get(stateKey("cgitem", id))?.amount ?? 0,
    );
    this.render();
  }

  /**
   * Native provenance: `PostDisplayItem.Dispose` runs
   * `AVGSceneFocusOut.BeforeItemDisposed` (2791 @ 0x1841FA3B0). It
   * removes the channel by id even if a newer image was already bound.
   * TweenAction can still write a pending amount through SetAmount, which
   * creates a fresh entry without a target until the next bind.
   */
  releaseCgItem(id: string, target: Container): void {
    this.cgItemTargets.delete(id);
    this.cgItemAmounts.delete(target);
    const state = this.states.get(stateKey("cgitem", id));
    if (state) state.amount = 0;
    this.render();
  }

  private writeAmount(state: FocusState, amount: number): void {
    state.amount = amount;
    if (state.type === "cgitem") {
      const target = this.cgItemTargets.get(state.id);
      if (target) this.cgItemAmounts.set(target, amount);
    }
    this.render();
  }

  private render(): void {
    const amounts = new Map(this.cgItemAmounts);
    for (const state of this.states.values()) {
      if (state.type === "cgitem") continue;
      for (const target of this.resolveTargets(state.type, state.id)) {
        amounts.set(target, Math.max(amounts.get(target) ?? 0, state.amount));
      }
    }

    for (const target of this.filteredTargets) {
      if (!amounts.has(target)) target.filters = [];
    }
    this.filteredTargets.clear();

    for (const [target, rawAmount] of amounts) {
      const amount = Math.max(0, Math.min(1, rawAmount));
      const filters = [];
      if (amount > 0 && this.config.blur)
        filters.push(new BlurFilter({ strength: amount * 8 }));
      if (amount > 0 && this.config.color !== "None") {
        // Native `AVGSceneFocusOut.Render` (2.7.61 VA 0x183E859D0) blits with
        // the same AVG/[UC]Common/Arts/Materials/mat_grayscale material as
        // `cameraeffect`, writing `_Params = (0.299, 0.587, 0.114,
        // color == Grayscale)` and `_Inverse = (color == Colorinverse)` — the
        // channel is binary there, and the per-item focus amount is applied
        // afterwards by compositing the processed target back through
        // mat_blit_ghost. That composite is a lerp between the original and
        // the fully processed pixel, which is exactly what feeding `amount`
        // into the matrix models, so both channels scale with it.
        const color = new ColorMatrixFilter();
        color.matrix =
          this.config.color === "Grayscale"
            ? buildColorEffectMatrix(amount, 0)
            : buildColorEffectMatrix(0, amount);
        filters.push(color);
      }
      target.filters = filters;
      if (filters.length > 0) this.filteredTargets.add(target);
    }
  }
}
