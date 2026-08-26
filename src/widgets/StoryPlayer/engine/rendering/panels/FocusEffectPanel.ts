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

/**
 * Port scope: `Torappu.AVG.AVGCameraEffect._ExecuteFocusout` and
 * `_ExecuteFocusParam` channel state. Applying `BlurFilter` and
 * `ColorMatrixFilter` per PIXI container is a Web adaptation of the native
 * `AVGSceneEffectManager` post-processing pipeline.
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
    const key = `${input.type}\u0000${input.id}`;
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
        state.amount = from + (input.to - from) * progress;
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
