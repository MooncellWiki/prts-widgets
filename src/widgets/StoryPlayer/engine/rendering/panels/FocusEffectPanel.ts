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
      state.amount = input.from;
      this.render();
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
        state.amount = from + (input.to - from) * eased;
        this.render();
      },
      () => {
        if (state.sessionId !== sessionId) return;
        state.amount = input.to;
        this.render();
      },
    );

    if (input.block && input.durationMs > 0) await run;
    else void run;
  }

  destroy(): void {
    for (const state of this.states.values()) state.sessionId += 1;
    this.states.clear();
    for (const target of this.filteredTargets) target.filters = [];
    this.filteredTargets.clear();
  }

  /**
   * Native provenance: `AVGSceneFocusOut.TryRegister` + `SetWhenBind.Bind`
   * replay a channel's stored amount the moment a PostDisplay item
   * registers -- a cgitem displayed after `focusout` already ran picks up
   * the existing amount immediately. The Web adaptation re-resolves targets
   * whenever the per-object target set (cgitem panel) changes; layer-backed
   * types (bg/char/cg/lbg) get this for free because their native handlers
   * are bound once and kept while the key matches, just as the filter sits
   * on the layer itself.
   */
  refresh(): void {
    this.render();
  }

  /**
   * Native provenance: `PostDisplayItem.Dispose` runs
   * `AVGSceneFocusOut.BeforeItemDisposed` (2.7.81 0x184004BB0), which
   * removes the channel's `SetWhenBind` from `m_amounts`. `GetAmount` then
   * reads 0, and the next item registered on the channel binds a fresh,
   * never-set entry, so a hidden-then-reshown (or same-key replaced) cgitem
   * comes back clean. Resetting the amount reproduces both; a tween still
   * running on the channel keeps writing, as native `TweenAction` ticks
   * re-create the entry through `SetAmount`.
   */
  release(type: string, id: string): void {
    const state = this.states.get(stateKey(type, id));
    if (!state) return;
    state.amount = 0;
    this.render();
  }

  private render(): void {
    const amounts = new Map<Container, number>();
    for (const state of this.states.values()) {
      for (const target of this.resolveTargets(state.type, state.id))
        amounts.set(target, Math.max(amounts.get(target) ?? 0, state.amount));
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
