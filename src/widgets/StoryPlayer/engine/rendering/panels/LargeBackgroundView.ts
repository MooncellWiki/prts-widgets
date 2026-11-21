import {
  createExecutionHandle,
  type ExecutionEndReason,
  type ExecutionHandle,
} from "../../execution";
import { dotweenEaseCurve } from "../core/DotweenEase";
import {
  applyCenteredTransform,
  buildGridBackgroundRoot,
  readCenteredTransform,
} from "../core/SceneGeometry";
import {
  MAX_SCALED_FRAME_DELTA_MS,
  type TweenRunner,
} from "../core/TweenRunner";

import type {
  GridBackgroundInput,
  LargeBackgroundTweenInput,
} from "../../types";
import type { TextureLoad } from "../core/TextureAsset";
import type { Container, Texture } from "pixi.js";

type AssetKind = "background" | "image";

interface PuzzleViewOptions {
  loadTexture: (key: string, kind: AssetKind) => TextureLoad;
  tweens: TweenRunner;
  bindFocusTargets?: (targets: readonly Container[]) => void;
  onWarning?: (detail: string) => void;
}

interface Transition {
  preparing: boolean;
  animation?: ExecutionHandle;
  onComplete?: () => void;
  afterPreparation?: Array<() => void>;
}

interface Movement {
  animation?: ExecutionHandle;
}

function isTextureReady(texture: TextureLoad): texture is Texture | null {
  return !(texture instanceof Promise);
}

function finiteValue(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? value : fallback;
}

function puzzleMovement(
  root: Container | null,
  input: LargeBackgroundTweenInput,
) {
  // The native _offset exists even when none of its tile slots is visible.
  if (!root) return () => {};
  const current = readCenteredTransform(root);
  const from = {
    scaleX: finiteValue(input.xScaleFrom, current.scaleX),
    scaleY: finiteValue(input.yScaleFrom, current.scaleY),
    x: finiteValue(input.xFrom, current.x),
    y: finiteValue(input.yFrom, current.y),
  };
  const to = {
    scaleX: finiteValue(input.xScaleTo, current.scaleX),
    scaleY: finiteValue(input.yScaleTo, current.scaleY),
    x: finiteValue(input.xTo, current.x),
    y: finiteValue(input.yTo, current.y),
  };
  applyCenteredTransform(root, from);
  let start: typeof from | undefined;
  return (progress: number) => {
    // Tweener.DoStartup<Vector3> (2791 @ 0x1847E8280) reads the transform
    // when the tween first advances, after older tweens in the same update.
    start ??= readCenteredTransform(root);
    applyCenteredTransform(root, {
      scaleX: start.scaleX + (to.scaleX - start.scaleX) * progress,
      scaleY: start.scaleY + (to.scaleY - start.scaleY) * progress,
      x: start.x + (to.x - start.x) * progress,
      y: start.y + (to.y - start.y) * progress,
    });
  };
}

/**
 * Torappu.AVG.LargeBackgroundPanel's tiled _offset, _LoadImage and canvas
 * fades (2791 @ 0x1841D8680 / 0x1841DC960).
 */
export class LargeBackgroundView {
  private root: Container | null = null;
  private readonly movements = new Set<Movement>();
  private transition?: Transition;

  constructor(
    private readonly layer: Container,
    private readonly options: PuzzleViewOptions,
  ) {}

  show(
    input: GridBackgroundInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const transition = this.beginTransition(onComplete);
    // Native _ResetImages runs before _LoadImage and reveals the new
    // puzzle over an empty layer.
    this.resetImages();

    const textures = input.imageKeys.map((key) =>
      this.options.loadTexture(key, input.assetKind ?? "background"),
    );
    if (textures.every(isTextureReady))
      return this.mountPuzzle(input, textures, transition);

    // Web preparation shares the frame wait with the fade, so a skip can
    // cancel an unresolved load without leaving the command loop pending.
    const animation = createExecutionHandle(true);
    transition.animation = animation;
    transition.preparing = true;
    const assetsReady = Promise.all(textures)
      .then((ready) => {
        this.mountPuzzle(input, ready, transition);
      })
      .catch((error: unknown) => {
        if (this.transition !== transition) return;
        this.transition = undefined;
        animation.fail(error);
      });
    return Object.assign(animation, { assetsReady });
  }

  clear(
    fadeMs = 0,
    block = false,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    this.cancelTransition();
    // The clear branches in 2791 (e.g. _ExecuteGridBG @ 0x1841D8680)
    // fade the CanvasGroup. Its OnKill resets the tiles and kills _offset
    // motion, so the mounted composition remains tweenable until then.
    return this.fadeBackground(0, fadeMs, block, onComplete);
  }

  /** LargeBackgroundPanel._ResetPanel (2791 @ 0x1841DD420). */
  resetPanel(): void {
    this.cancelTransition();
    this.resetImages();
    this.layer.alpha = 0;
  }

  /** Story teardown releases the panel's remaining Web frame work. */
  reset(): void {
    this.cancelMovements();
    this.resetPanel();
    this.options.tweens.killTarget(this.layer);
  }

  move(
    input: LargeBackgroundTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const root = this.root;
    if (root && root.parent !== this.layer) return;

    // _ExecuteImageTween (2791 @ 0x1841D9B90) adds each move and scale pair
    // to the shared _offset. Tweens advance in creation order and every move
    // can still call FinishCommand.
    const update = puzzleMovement(root, input);
    if (input.durationMs <= 0 && !input.loop) {
      update(1);
      onComplete?.();
      return;
    }

    const animation = input.block ? createExecutionHandle(true) : undefined;
    const movement = { animation };
    this.movements.add(movement);
    const isAlive = () =>
      this.movements.has(movement) && (!root || root.parent === this.layer);
    void this.options.tweens.run(
      input.durationMs,
      (progress) => {
        if (isAlive()) update(progress);
      },
      () => {
        if (!this.movements.delete(movement)) return;
        if (root && root.parent !== this.layer) {
          animation?.end("reset");
          return;
        }
        update(1);
        animation?.end();
        onComplete?.();
      },
      {
        ease: dotweenEaseCurve(input.ease),
        isAlive,
        loops: input.loop ? -1 : 1,
      },
    );
    return animation;
  }

  cancelPreparation(): void {
    if (this.transition?.preparing) this.cancelTransition("force_end");
  }

  private mountPuzzle(
    input: GridBackgroundInput,
    textures: (Texture | null)[],
    transition: Transition,
  ): ExecutionHandle | void {
    if (this.transition !== transition) return;
    transition.preparing = false;
    this.resumeFadeCallbacks(transition);

    if (textures.some((texture) => !texture)) {
      this.layer.alpha = 0;
      const missing = input.imageKeys.filter((_, index) => !textures[index]);
      this.options.onWarning?.(`missing grid background: ${missing.join("/")}`);
      this.finishTransition(transition);
      return;
    }

    const root = buildGridBackgroundRoot(input, textures as Texture[]);
    this.root = root;
    this.layer.addChild(root);
    // _BindCamEffectTarget (2791 @ 0x1841D81E0) registers four permanent
    // slots. The manager holds their amounts while the view replaces tiles.
    this.options.bindFocusTargets?.(root.children);
    this.layer.alpha = 0;
    const animation = this.fadeBackground(
      1,
      input.fadeMs,
      input.block,
      transition.onComplete,
      transition.animation,
    );
    this.transition = undefined;
    return animation;
  }

  private fadeBackground(
    to: 0 | 1,
    durationMs: number,
    block: boolean,
    onComplete?: () => void,
    preparation?: ExecutionHandle,
  ): ExecutionHandle | void {
    const animation = block
      ? (preparation ?? createExecutionHandle(true))
      : undefined;
    let from: number | undefined;
    const tweens = this.options.tweens;
    const onKill = () => {
      if (this.transition?.preparing) {
        (this.transition.afterPreparation ??= []).push(onKill);
        return;
      }
      if (to === 0) this.resetImages();
      onComplete?.();
    };
    tweens.start(
      durationMs,
      (progress) => {
        // DOTween samples the CanvasGroup at startup, after older tweens
        // have had their turn in this update.
        from ??= this.layer.alpha;
        this.layer.alpha = from + (to - from) * progress;
      },
      {
        deferZeroDuration: true,
        maxFrameDeltaMs: MAX_SCALED_FRAME_DELTA_MS,
        onCancel: () => animation?.end("reset"),
        onComplete: () =>
          // TweenManager.Update (2791 @ 0x184467690) despawns completed
          // tweens after updating all targets. The CanvasGroup's OnKill
          // then resets the current tiles or releases the shared wait.
          tweens.afterUpdate(() => {
            animation?.end();
            onKill();
          }),
        target: this.layer,
      },
    );
    if (!block) preparation?.end();
    return animation;
  }

  private beginTransition(onComplete?: () => void): Transition {
    this.cancelTransition();
    const transition = { onComplete, preparing: false };
    this.transition = transition;
    return transition;
  }

  private cancelTransition(reason: ExecutionEndReason = "reset"): void {
    const transition = this.transition;
    this.transition = undefined;
    transition?.animation?.end(reason);
    if (transition) this.resumeFadeCallbacks(transition);
  }

  private finishTransition(transition: Transition): void {
    if (this.transition !== transition) return;
    this.transition = undefined;
    transition.animation?.end();
  }

  private resumeFadeCallbacks(transition: Transition): void {
    const callbacks = transition.afterPreparation;
    if (!callbacks) return;
    // Native loads tiles inline. Replay elapsed OnKill callbacks in the first
    // ready Update, after the command following the load has installed its wait.
    const tweens = this.options.tweens;
    tweens.start(
      0,
      () => {
        for (const complete of callbacks) tweens.afterUpdate(complete);
      },
      { deferZeroDuration: true, target: this.layer },
    );
  }

  private cancelMovements(): void {
    for (const { animation } of this.movements) animation?.end("reset");
    this.movements.clear();
  }

  private resetImages(): void {
    // _ResetImages (2791 @ 0x1841DD120) DOKills _offset without completing
    // it. Only a surviving completion callback can release a pending wait.
    this.movements.clear();
    const root = this.root;
    if (!root) return;
    this.options.bindFocusTargets?.([]);
    this.root = null;
    root.destroy({ children: true });
  }
}
