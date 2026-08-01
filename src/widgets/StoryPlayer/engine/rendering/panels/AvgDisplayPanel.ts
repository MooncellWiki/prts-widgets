import { Container, Sprite } from "pixi.js";

import type { AvgDisplayInput, AvgDisplaySlot } from "../../types";
import type { Texture } from "pixi.js";

interface AvgDisplayState {
  name: string;
  root: Container;
  sessionId: number;
  slot: AvgDisplaySlot;
  style: string;
}

type TextureLoader = (name: string) => Promise<Texture | null>;
type Tween = (
  durationMs: number,
  update: (progress: number) => void,
  complete?: () => void,
) => Promise<void>;

export class AvgDisplayPanel {
  private readonly states = new Map<string, AvgDisplayState>();

  constructor(
    private readonly slots: Record<"bgover" | "cgover" | "charover", Container>,
    private readonly loadBackground: TextureLoader,
    private readonly tween: Tween,
    private readonly onWarning?: (detail: string) => void,
  ) {}

  clear(): void {
    for (const state of this.states.values())
      state.root.destroy({ children: true });
    this.states.clear();
  }

  destroy(): void {
    this.clear();
  }

  async display(input: AvgDisplayInput): Promise<void> {
    if (!input.name) {
      this.remove(input.id);
      return;
    }

    const parent = this.containerFor(input.slot);
    if (!parent) {
      this.onWarning?.(
        `invalid_parameter avgdisplay slot:${input.slot || "(empty)"}`,
      );
      return;
    }

    let state = this.states.get(input.id);
    if (state && (state.slot !== input.slot || state.style !== input.style)) {
      this.remove(input.id);
      state = undefined;
    }

    if (!state) {
      state = {
        name: "",
        root: new Container(),
        sessionId: 0,
        slot: input.slot,
        style: input.style,
      };
      parent.addChild(state.root);
      this.states.set(input.id, state);
    }

    if (state.name !== input.name) {
      for (const child of state.root.removeChildren()) child.destroy();
      state.name = input.name;
      await this.generateContent(state, input);
    }

    const sessionId = ++state.sessionId;
    const root = state.root;
    root.zIndex = input.layer;
    parent.sortableChildren = true;

    const currentX = root.position.x - 640;
    const currentY = 360 - root.position.y;
    const startX = input.xFrom ?? input.x ?? currentX;
    const startY = input.yFrom ?? input.y ?? currentY;
    const endX = input.xTo ?? startX;
    const endY = input.yTo ?? startY;
    const startScaleX = input.scaleXFrom ?? input.scaleX ?? root.scale.x;
    const startScaleY = input.scaleYFrom ?? input.scaleY ?? root.scale.y;
    const endScaleX = input.scaleXTo ?? startScaleX;
    const endScaleY = input.scaleYTo ?? startScaleY;
    const supportsPosition =
      input.style === "effect" ||
      input.style === "bgeffect" ||
      input.style === "animekv" ||
      input.style === "character";
    const supportsScale = input.style === "animekv";
    const supportsFade = input.style === "bg";
    const hasEntry =
      input.style === "animekv" &&
      (input.entryFrom !== undefined || input.entryTo !== undefined);

    if (supportsPosition) root.position.set(640 + startX, 360 - startY);
    if (supportsScale) root.scale.set(startScaleX, startScaleY);
    if (
      input.style === "effect" ||
      input.style === "bgeffect" ||
      input.style === "character"
    )
      root.rotation = (input.rotationZ * Math.PI) / 180;
    if (supportsFade) root.alpha = input.alphaFrom ?? 1;

    const hasPositionTween =
      supportsPosition && (startX !== endX || startY !== endY);
    const hasScaleTween =
      supportsScale && (startScaleX !== endScaleX || startScaleY !== endScaleY);
    const alphaTo = input.alphaTo ?? 0;
    const hasFadeTween = supportsFade && root.alpha !== alphaTo;
    const hasTween =
      input.durationMs > 0 &&
      (hasPositionTween || hasScaleTween || hasFadeTween || hasEntry);

    const apply = (progress: number) => {
      if (state?.sessionId !== sessionId) return;
      if (supportsPosition)
        root.position.set(
          640 + startX + (endX - startX) * progress,
          360 - (startY + (endY - startY) * progress),
        );
      if (supportsScale)
        root.scale.set(
          startScaleX + (endScaleX - startScaleX) * progress,
          startScaleY + (endScaleY - startScaleY) * progress,
        );
      if (supportsFade)
        root.alpha =
          (input.alphaFrom ?? 1) +
          (alphaTo - (input.alphaFrom ?? 1)) * progress;
    };

    if (!hasTween) {
      apply(1);
      return;
    }
    const run = this.tween(input.durationMs, apply);
    if (input.block) await run;
    else void run;
  }

  private containerFor(slot: AvgDisplaySlot): Container | null {
    if (slot === "bgover" || slot === "cgover" || slot === "charover")
      return this.slots[slot];
    return null;
  }

  private async generateContent(
    state: AvgDisplayState,
    input: AvgDisplayInput,
  ): Promise<void> {
    if (input.style === "bg") {
      const texture = await this.loadBackground(input.name);
      if (!texture) return;
      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5);
      sprite.width = 1280;
      sprite.height = 720;
      state.root.addChild(sprite);
      return;
    }
    this.onWarning?.(
      `unsupported_visual avgdisplay:${input.style}:${input.name}`,
    );
  }

  private remove(id: string): void {
    const state = this.states.get(id);
    if (!state) return;
    state.sessionId += 1;
    state.root.destroy({ children: true });
    this.states.delete(id);
  }
}
