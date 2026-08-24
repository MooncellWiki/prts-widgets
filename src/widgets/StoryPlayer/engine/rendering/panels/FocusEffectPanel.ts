import {
  BlurFilter,
  ColorMatrixFilter,
  type ColorMatrix,
  type Container,
} from "pixi.js";

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

// Full-strength inverse (out = 1 - c per channel). Written by hand instead of
// pixi's `negative()`, whose matrix adds source alpha into each channel (a
// pixi quirk); native `mat_grayscale`/`_Inverse` inverts per channel.
const INVERSE_MATRIX: ColorMatrix = [
  -1,
  0,
  0,
  0,
  1, //
  0,
  -1,
  0,
  0,
  1, //
  0,
  0,
  -1,
  0,
  1, //
  0,
  0,
  0,
  1,
  0,
];

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
 * half-strength effect). The color filters below reproduce that model
 * exactly: a full-strength `ColorMatrixFilter` matrix mixed with the clean
 * pixel through the filter's `alpha` uniform (GL/WGSL both `mix(orig,
 * processed, uAlpha)`). Blur keeps a strength-graded surrogate for the blend
 * because stock PIXI filters cannot composite two copies of live content.
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
   * (re)registers -- a cgitem displayed after `focusout` already ran picks
   * up the existing amount immediately. The Web adaptation re-resolves
   * targets whenever the per-object target set (cgitem panel) changes;
   * layer-backed types (bg/char/cg/lbg) get this for free because the
   * filter sits on the layer itself.
   */
  refresh(): void {
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
        const color = new ColorMatrixFilter();
        if (this.config.color === "Grayscale") color.grayscale(1, false);
        else color.matrix = INVERSE_MATRIX;
        // Ghost blend: amount mixes the clean pixel with the full-strength
        // processed pixel (see the port-scope note above).
        color.alpha = amount;
        filters.push(color);
      }
      target.filters = filters;
      if (filters.length > 0) this.filteredTargets.add(target);
    }
  }
}
