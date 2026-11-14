import { Container, Sprite, type Texture } from "pixi.js";

import {
  createExecutionHandle,
  type AnimationPreparation,
  type ExecutionHandle,
} from "../../execution";
import { STORY_HEIGHT, STORY_WIDTH, type AvgDisplayInput } from "../../types";
import { canvasOrderForLayer, sceneCanvasOrder } from "../core/LayerGraph";
import { Sequence } from "../core/Sequence";

import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";

interface AvgDisplayState {
  animation?: ExecutionHandle;
  name: string;
  ready?: Promise<void>;
  root: Container;
  sessionId: number;
  slot: "bgover" | "cgover" | "charover";
  style: string;
}

/**
 * Port scope: `Torappu.AVG.AVGDisplayableExecutor._ExecuteAVGDisplayable`.
 * It retains id replacement, slot/style routing, and command timing; PIXI
 * containers and the currently supported `bg` asset are Web adaptations.
 */
export class AvgDisplayPanel {
  private readonly states = new Map<string, AvgDisplayState>();

  constructor(
    private readonly slots: Record<"bgover" | "cgover" | "charover", Container>,
    private readonly loadBackground: (name: string) => TextureLoad,
    private readonly tween: TweenRunner["run"],
    private readonly onWarning?: (detail: string) => void,
  ) {}

  clear(): void {
    for (const id of this.states.keys()) this.remove(id);
  }

  destroy(): void {
    this.clear();
  }

  display(
    input: AvgDisplayInput,
    onComplete?: () => void,
  ): AnimationPreparation {
    if (!input.name) {
      this.remove(input.id);
      return;
    }

    const { slot } = input;
    if (slot !== "bgover" && slot !== "cgover" && slot !== "charover") {
      this.onWarning?.(
        `invalid_parameter avgdisplay slot:${input.slot || "(empty)"}`,
      );
      return;
    }
    const parent = this.slots[slot];

    let state = this.states.get(input.id);
    // _DisplayInternal (2791 @ 0x18418E090) regenerates a holder when the
    // parsed slot/type enums differ. DisplayableExecutor canonicalizes both.
    if (state && (state.slot !== input.slot || state.style !== input.style)) {
      this.remove(input.id);
      state = undefined;
    }

    if (!state) {
      const root = new Container();
      // AVGDisplayableImageHolder.GenerateContent (2791 @ 0x18424EA50) sets
      // sorting when the holder gets its content and uses the prefab layout.
      root.zIndex = canvasOrderForLayer(sceneCanvasOrder[slot], input.layer);
      if (input.style === "bg")
        root.position.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
      state = {
        name: "",
        root,
        sessionId: 0,
        slot,
        style: input.style,
      };
      parent.addChild(root);
      this.states.set(input.id, state);
    }

    const holder = state;
    const { root } = holder;
    const sessionId = ++holder.sessionId;
    holder.animation?.end("reset");
    holder.animation = undefined;
    const isAlive = () => !root.destroyed && holder.sessionId === sessionId;
    if (holder.name !== input.name) {
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
      for (const child of root.removeChildren()) child.destroy();
      holder.name = input.name;
      const texture = this.loadContent(input);
      if (texture instanceof Promise) {
        // Only the latest request for this holder may install its content.
        const ready = texture.then((loaded) => {
          if (!root.destroyed && holder.ready === ready)
            this.addSprite(root, loaded);
        });
        holder.ready = ready;
      } else {
        holder.ready = undefined;
        this.addSprite(root, texture);
      }
    }
    const animate = () => {
      if (!isAlive()) return;
      holder.ready = undefined;
      return this.playFeatures(holder, input, isAlive, onComplete);
    };
    return holder.ready ? holder.ready.then(animate) : animate();
  }

  private playFeatures(
    holder: AvgDisplayState,
    input: AvgDisplayInput,
    isAlive: () => boolean,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const { root } = holder;
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

    if (
      input.style === "effect" ||
      input.style === "bgeffect" ||
      input.style === "character"
    )
      root.rotation = (input.rotationZ * Math.PI) / 180;
    // AVGDisplayableHolder.Display (2791 @ 0x18418B810) joins all feature
    // tweens and returns no sequence when every feature applies immediately.
    const { durationMs } = input;
    let sequence: Sequence | undefined;
    const applyFeature = (
      changes: boolean,
      update: (progress: number) => void,
    ) => {
      if (durationMs > 0 && changes) {
        update(0);
        (sequence ??= new Sequence(this.tween)).join({ durationMs, update });
      } else update(1);
    };
    if (supportsPosition) {
      applyFeature(startX !== endX || startY !== endY, (progress) =>
        root.position.set(
          640 + startX + (endX - startX) * progress,
          360 - (startY + (endY - startY) * progress),
        ),
      );
    }
    if (supportsScale) {
      applyFeature(
        startScaleX !== endScaleX || startScaleY !== endScaleY,
        (progress) =>
          root.scale.set(
            startScaleX + (endScaleX - startScaleX) * progress,
            startScaleY + (endScaleY - startScaleY) * progress,
          ),
      );
    }
    if (fadeActive) {
      const from = input.alphaFrom ?? 1;
      const to = input.alphaTo ?? 0;
      applyFeature(from !== to, (progress) => {
        root.alpha = from + (to - from) * progress;
      });
    }
    // The Web keeps the scripted timing for the unsupported animekv clip.
    if (hasEntry) applyFeature(true, () => {});
    if (!sequence) return;
    const animation = createExecutionHandle(onComplete !== undefined);
    holder.animation = animation;
    void sequence.play({
      isAlive,
      onComplete: () => {
        holder.animation = undefined;
        animation.end();
        onComplete?.();
      },
    });
    return animation;
  }

  private loadContent(input: AvgDisplayInput): TextureLoad {
    if (input.style === "bg") return this.loadBackground(input.name);
    this.onWarning?.(
      `unsupported_visual avgdisplay:${input.style}:${input.name}`,
    );
    return null;
  }

  private addSprite(root: Container, texture: Texture | null): void {
    if (!texture) return;
    const sprite = root.addChild(new Sprite(texture));
    sprite.anchor.set(0.5);
    sprite.setSize(STORY_WIDTH, STORY_HEIGHT);
  }

  private remove(id: string): void {
    const state = this.states.get(id);
    if (!state) return;
    state.sessionId += 1;
    state.animation?.end("reset");
    state.root.destroy({ children: true });
    this.states.delete(id);
  }
}
