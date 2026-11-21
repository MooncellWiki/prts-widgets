import { Container, type Texture } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type BackgroundInput,
  type ImageRotateInput,
  type ImageTweenInput,
} from "../../types";
import { dotweenEaseCurve } from "../core/DotweenEase";
import { createImageSprite } from "../core/ImageSprite";
import {
  applyCenteredTransform,
  readCenteredTransform,
  rotateTweenDelta,
} from "../core/SceneGeometry";
import {
  MAX_SCALED_FRAME_DELTA_MS,
  type TweenRunner,
} from "../core/TweenRunner";

import type { SceneEffectManager } from "../SceneEffectManager";
import type { TextureLoad } from "../core/TextureAsset";

interface ImageSlot {
  root: Container;
}

function createSlot(label: string): ImageSlot {
  return {
    root: new Container({
      alpha: 0,
      label,
      x: STORY_WIDTH / 2,
      y: STORY_HEIGHT / 2,
    }),
  };
}

function finiteOr(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

/** Torappu.AVG.AVGImagePanel's two Image slots and panel RectTransform. */
export class ImageView {
  private fore = createSlot("image_two");
  private back = createSlot("image_one");
  private generation = 0;
  private preparation?: ExecutionHandle;
  private readonly deferredFinishes: Array<() => void> = [];

  constructor(
    private readonly layer: Container,
    private readonly loadTexture: (key: string) => TextureLoad,
    private readonly tweens: TweenRunner,
    private readonly sceneEffects: Pick<
      SceneEffectManager,
      "setImageFocusTargets"
    >,
  ) {
    // The 2791 scene serializes panel_image with a centered pivot.
    layer.pivot.set(STORY_WIDTH / 2, STORY_HEIGHT / 2);
    layer.position.copyFrom(layer.pivot);
    // OnStoryBegin / _BindPostDisplay (2791 @ 0x1841AC2F0 / 0x1841ACBB0).
    // A Web renderer belongs to one story. Bind each physical slot once
    // so its PostDisplay channel follows it when fore and back swap.
    sceneEffects.setImageFocusTargets(
      "cg",
      this.fore.root,
      this.back.root,
      false,
    );
  }

  show(
    key: string,
    input?: BackgroundInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    this.cancelPreparation();
    const load = this.loadTexture(key);
    if (!(load instanceof Promise))
      return this.swapAndFade(load, input, onComplete);

    // _LoadSprite (2791 @ 0x1841AE580) is synchronous. On the Web a cold
    // texture waits before swapping slots, while mounted tweens keep running.
    const animation = createExecutionHandle(true);
    this.preparation = animation;
    const assetsReady = load
      .then((texture) => {
        if (this.preparation !== animation) return;
        this.preparation = undefined;
        this.swapAndFade(texture, input, onComplete, animation);
        if (!input?.block) animation.end();
        this.replayDeferredFinishes();
      })
      .catch((error: unknown) => {
        if (this.preparation === animation) this.preparation = undefined;
        animation.fail(error);
      });
    return Object.assign(animation, { assetsReady });
  }

  clear(
    fadeMs = 0,
    block = false,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    this.cancelPreparation();
    return this.fade(this.swapSlots(), 0, fadeMs, block, onComplete);
  }

  /** _ExecuteImageTween (2791 @ 0x1841AD170). */
  move(
    input: ImageTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const root = this.fore.root;
    const current = readCenteredTransform(root);
    const from = {
      scaleX: finiteOr(input.xScaleFrom, current.scaleX),
      scaleY: finiteOr(input.yScaleFrom, current.scaleY),
      x: finiteOr(input.xFrom, current.x),
      y: finiteOr(input.yFrom, current.y),
    };
    const to = {
      scaleX: finiteOr(input.xScaleTo, current.scaleX),
      scaleY: finiteOr(input.yScaleTo, current.scaleY),
      x: finiteOr(input.xTo, current.x),
      y: finiteOr(input.yTo, current.y),
    };
    applyCenteredTransform(root, from);

    const animation = input.block ? createExecutionHandle(true) : undefined;
    const generation = this.generation;
    let start: typeof from | undefined;
    this.tweens.start(
      input.durationMs,
      (progress) => {
        // Tweener.DoStartup<Vector3> (2791 @ 0x1847E8280) samples the pose
        // after the older move/scale pairs have written on this Update.
        start ??= readCenteredTransform(root);
        applyCenteredTransform(root, {
          scaleX: start.scaleX + (to.scaleX - start.scaleX) * progress,
          scaleY: start.scaleY + (to.scaleY - start.scaleY) * progress,
          x: start.x + (to.x - start.x) * progress,
          y: start.y + (to.y - start.y) * progress,
        });
      },
      {
        ease: input.durationMs > 0 ? dotweenEaseCurve(input.ease) : undefined,
        loops: input.loop ? -1 : 1,
        // DOKill(false) stops writes without calling FinishCommand.
        onCancel: () => {
          if (generation !== this.generation) animation?.end("reset");
        },
        onComplete: this.finishHandler(animation, onComplete),
        target: root,
      },
    );
    return animation;
  }

  /** _ExecuteImageRotate / CreateRotateTween (2791 @ 0x1841ACD50 / 0x1841959A0). */
  rotate(
    input: ImageRotateInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    this.tweens.killTarget(this.layer);
    // Unity's positive z points counter-clockwise on screen. Pixi's is clockwise.
    const angle = -this.layer.angle;
    const delta = rotateTweenDelta(
      angle,
      input.angleDeg,
      input.circles,
      input.inverse,
    );
    const animation = input.block ? createExecutionHandle(true) : undefined;
    this.tweens.start(
      input.durationMs,
      (progress) => {
        this.layer.angle = -(angle + delta * progress);
      },
      {
        deferZeroDuration: true,
        // DORotate uses Time.deltaTime (2791 DOTweenComponent.Update @ 0x18444D110).
        maxFrameDeltaMs: MAX_SCALED_FRAME_DELTA_MS,
        onKill: this.finishHandler(
          animation,
          input.block ? onComplete : undefined,
        ),
        target: this.layer,
      },
    );
    return animation;
  }

  cancelPreparation(): void {
    const animation = this.preparation;
    if (!animation) return;
    this.preparation = undefined;
    animation.end("force_end");
    this.replayDeferredFinishes();
  }

  /** OnReset (2791 @ 0x1841AC180) runs at story end. */
  reset(): void {
    this.generation++;
    this.preparation?.end("reset");
    this.preparation = undefined;
    this.deferredFinishes.length = 0;
    this.tweens.killTarget(this.deferredFinishes);
    this.layer.angle = 0;
    this.tweens.killTarget(this.layer);
    this.resetSlot(this.back);
    this.resetSlot(this.fore);
    this.sceneEffects.setImageFocusTargets("cg", undefined, undefined, false);
  }

  destroy(): void {
    this.reset();
    this.fore.root.destroy();
    this.back.root.destroy();
  }

  private swapAndFade(
    texture: Texture | null,
    input?: BackgroundInput,
    onComplete?: () => void,
    preparation?: ExecutionHandle,
  ): ExecutionHandle | void {
    const fadeMs = input?.fadeMs ?? 0;
    const block = input?.block ?? false;
    const back = this.swapSlots();
    if (!texture)
      return this.fade(back, 0, fadeMs, block, onComplete, preparation);

    const root = this.fore.root;
    // _LoadImage (2791 @ 0x1841ADFA0) gives the sprite its own rect.
    // Foreground art uses texture pixels for native size. PPU is a background sidecar.
    root.addChild(createImageSprite(texture, input));
    applyCenteredTransform(root, {
      scaleX: input?.scaleX ?? 1,
      scaleY: input?.scaleY ?? 1,
      x: input?.x ?? 0,
      y: input?.y ?? 0,
    });
    // Fresh art is appended above the outgoing image slot.
    this.layer.addChild(root);
    return this.fade(this.fore, 1, fadeMs, block, onComplete, preparation);
  }

  private swapSlots(): ImageSlot {
    // _ExecuteImage / _SwapImages (2791 @ 0x1841AD900 / 0x1841AE700).
    // Kill the old back Image and Transform while they are still the back.
    this.killSlotTweens(this.back);
    [this.fore, this.back] = [this.back, this.fore];
    this.clearVisual(this.fore);
    return this.back;
  }

  private fade(
    slot: ImageSlot,
    to: 0 | 1,
    fadeMs: number,
    block: boolean,
    onComplete?: () => void,
    preparation?: ExecutionHandle,
  ): ExecutionHandle | void {
    const animation = block
      ? (preparation ?? createExecutionHandle(true))
      : undefined;
    let from: number | undefined;
    this.tweens.start(
      fadeMs,
      (progress) => {
        from ??= slot.root.alpha;
        slot.root.alpha = from + (to - from) * progress;
      },
      {
        deferZeroDuration: true,
        // _ExecuteImage's OnKill (2791 @ 0x1841B60C0) reads _backImage
        // when it runs. The original fade may outlive a swap.
        onKill: this.finishHandler(
          animation,
          block ? onComplete : undefined,
          () => this.resetSlot(this.back),
        ),
        target: slot,
      },
    );
    return animation;
  }

  private resetSlot(slot: ImageSlot): void {
    // _ResetImage (2791 @ 0x1841AE640) leaves the slot's transform in place.
    this.killSlotTweens(slot);
    this.clearVisual(slot);
  }

  private clearVisual({ root }: ImageSlot): void {
    root.alpha = 0;
    root.removeFromParent();
    for (const visual of root.removeChildren()) visual.destroy();
  }

  private killSlotTweens(slot: ImageSlot): void {
    this.tweens.killTarget(slot);
    this.tweens.killTarget(slot.root);
  }

  private finishHandler(
    animation: ExecutionHandle | undefined,
    onComplete: (() => void) | undefined,
    cleanup?: () => void,
  ): () => void {
    const generation = this.generation;
    return () => {
      if (generation !== this.generation) {
        animation?.end("reset");
        return;
      }
      cleanup?.();
      animation?.end();
      if (onComplete) this.signalFinish(onComplete);
    };
  }

  private signalFinish(finish: () => void): void {
    if (this.preparation) this.deferredFinishes.push(finish);
    else finish();
  }

  private replayDeferredFinishes(): void {
    if (this.deferredFinishes.length === 0) return;
    const generation = this.generation;
    this.tweens.killTarget(this.deferredFinishes);
    this.tweens.start(0, () => {}, {
      deferZeroDuration: true,
      // A nonblocking image can advance immediately on assetsReady. Its
      // successor has installed its wait by the first ready Update.
      onComplete: () =>
        this.tweens.afterUpdate(() => {
          if (generation !== this.generation || this.preparation) return;
          for (const finish of this.deferredFinishes.splice(0)) finish();
        }),
      target: this.deferredFinishes,
    });
  }
}
