import { Container, Sprite, type Texture } from "pixi.js";

import type { AvgDisplayInput, AvgDisplaySlot } from "../../types";

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

/**
 * Port scope: `Torappu.AVG.AVGDisplayableExecutor._ExecuteAVGDisplayable`.
 * It retains id replacement, slot/style routing, and command timing; PIXI
 * containers and the currently supported `bg` asset are Web adaptations.
 */
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
    // _DisplayInternal (2.7.81 VA 0x183F9A5F0) disposes and regenerates the
    // id's holder when the parsed slot/type enums differ. The runtime already
    // canonicalizes both through resolveAvgDisplayStyle/Slot (GenTypeFromRaw /
    // GenSlotFromRaw), so string equality here is that enum comparison.
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
      // Divergence (intentional, verified 2.7.61 and 2.7.81): native
      // _LoadContentIfNeed (2.7.81 VA 0x183F9A040, inlined into Display at
      // 0x183F97E20) compares the holder's GameObject name -- NOT the command
      // `name` -- so content is generated once per holder instance and
      // re-displaying a live id with a different `name` only replays features
      // (the 2.7.51 doc's "name change rebuilds content" claim does not hold
      // since 2.7.61). We keep rebuilding because it matches the command's
      // intent; no production story re-names a live id without an intervening
      // destroy (`[avgdisplay(id="1")]`), so this divergence is
      // corpus-unreachable.
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
    // Native port: AVGDisplayableHolder._ApplyFadeFeature (2.7.81 VA
    // 0x183F98A70) skips the ENTIRE fade block when CalculateFadetime(duration)
    // <= 0 -- alpha is left completely untouched, unlike position/scale which
    // snap straight to the end point on the same branch. Under the
    // fast-forward gear (animateRatio = 0) every bg fade lands there, so a
    // dimming overlay must keep its current alpha instead of snapping to
    // `ato` (default 0, which made duration-less bg displays vanish). A fresh
    // holder therefore stays at the prefab alpha: the `displayable_image`
    // root CanvasGroup ships m_Alpha = 1 (avg/[uc]common.ab), matching a new
    // PIXI container.
    const fadeActive = supportsFade && input.durationMs > 0;
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
    if (fadeActive) root.alpha = input.alphaFrom ?? 1;

    const hasPositionTween =
      supportsPosition && (startX !== endX || startY !== endY);
    const hasScaleTween =
      supportsScale && (startScaleX !== endScaleX || startScaleY !== endScaleY);
    const alphaTo = input.alphaTo ?? 0;
    const hasFadeTween = fadeActive && root.alpha !== alphaTo;
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
      if (fadeActive)
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
