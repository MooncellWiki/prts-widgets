import { BlurFilter, ColorMatrixFilter } from "pixi.js";

import type { FocusOutInput, FocusParamInput } from "../../types";
import type { Container } from "pixi.js";

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

/** Keeps focus state by logical channel and projects it onto the current PIXI display objects. */
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
        const color = new ColorMatrixFilter();
        if (this.config.color === "Grayscale") color.grayscale(amount, false);
        else color.negative(false);
        filters.push(color);
      }
      target.filters = filters;
      if (filters.length > 0) this.filteredTargets.add(target);
    }
  }
}
