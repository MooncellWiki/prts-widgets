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
  kind: AssetKind;
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
  return (progress: number) =>
    applyCenteredTransform(root, {
      scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
      scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
}

/**
 * Torappu.AVG.LargeBackgroundPanel's tiled _offset, _LoadImage and canvas
 * fades (2791 @ 0x1841D8680 / 0x1841DC960). The Web foreground puzzle owns
 * a separate instance on the image layer and keeps its legacy overlay fade.
 */
export class LargeBackgroundView {
  private root: Container | null = null;
  private readonly roots = new Set<Container>();
  private transition?: Transition;
  private movement?: Movement;

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
    // puzzle over an empty layer. largeimg keeps its outgoing foreground.
    if (this.options.kind === "background") this.resetImages();
    else this.cancelMovement();

    const textures = input.imageKeys.map((key) =>
      this.options.loadTexture(key, input.assetKind ?? this.options.kind),
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
    return this.options.kind === "background"
      ? Object.assign(animation, { assetsReady })
      : animation;
  }

  clear(
    fadeMs = 0,
    block = false,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (this.options.kind === "background") {
      this.cancelTransition();
      // The clear branches in 2791 (e.g. _ExecuteGridBG @ 0x1841D8680)
      // fade the CanvasGroup. Its OnKill resets the tiles and kills _offset
      // motion, so the mounted composition remains tweenable until then.
      return this.fadeBackground(0, fadeMs, block, onComplete);
    }

    const transition = this.beginTransition();
    this.root = null;
    this.cancelMovement();
    const roots = [...this.roots];
    if (roots.length === 0 || fadeMs <= 0) {
      this.retireRoots(roots);
      this.finishTransition(transition);
      return;
    }

    const startAlphas = roots.map((root) => root.alpha);
    return this.fadeImage(
      transition,
      fadeMs,
      block,
      (progress) => {
        for (const [index, root] of roots.entries())
          root.alpha = startAlphas[index]! * (1 - progress);
      },
      () => this.retireRoots(roots),
    );
  }

  /** LargeBackgroundPanel._ResetPanel (2791 @ 0x1841DD420). */
  resetPanel(): void {
    this.cancelTransition();
    this.resetImages();
    this.layer.alpha = 0;
  }

  /** Story teardown releases the panel's remaining Web frame work. */
  reset(): void {
    this.cancelMovement();
    this.resetPanel();
    this.options.tweens.killTarget(this.layer);
  }

  move(
    input: LargeBackgroundTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const root = this.root;
    if (root ? root.parent !== this.layer : this.options.kind === "image")
      return;
    const update = puzzleMovement(root, input);

    // _ExecuteImageTween (2791 @ 0x1841D9B90) moves and scales the same
    // _offset with matched timing. Native lets older overlapping tweens
    // resume writing once a newer one ends. Web retires the previous one
    // when a new tween takes over the root.
    this.cancelMovement();
    update(0);
    if (
      input.durationMs <= 0 &&
      !(input.loop && this.options.kind === "background")
    ) {
      update(1);
      onComplete?.();
      return;
    }

    const animation = input.block ? createExecutionHandle(true) : undefined;
    const movement = { animation };
    this.movement = movement;
    const isAlive = () =>
      this.movement === movement && (!root || root.parent === this.layer);
    void this.options.tweens.run(
      input.durationMs,
      (progress) => {
        if (isAlive()) update(progress);
      },
      () => {
        if (this.movement !== movement) return;
        this.movement = undefined;
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
      if (this.options.kind === "background") {
        this.layer.alpha = 0;
        const missing = input.imageKeys.filter((_, index) => !textures[index]);
        this.options.onWarning?.(
          `missing grid background: ${missing.join("/")}`,
        );
      }
      this.finishTransition(transition);
      return;
    }

    const root = buildGridBackgroundRoot(input, textures as Texture[]);
    if (this.options.kind === "image") root.scale.set(1.2);
    const outgoing = [...this.roots];
    this.root = root;
    this.roots.add(root);
    this.layer.addChild(root);
    // _BindCamEffectTarget (2791 @ 0x1841D81E0) registers four permanent
    // slots. The manager holds their amounts while the view replaces tiles.
    this.options.bindFocusTargets?.(root.children);
    if (this.options.kind === "background") {
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

    if (input.fadeMs <= 0) {
      this.retireRoots(outgoing);
      this.finishTransition(transition);
      return;
    }

    root.alpha = 0;
    return this.fadeImage(
      transition,
      input.fadeMs,
      input.block,
      (progress) => {
        root.alpha = progress;
      },
      () => this.retireRoots(outgoing),
    );
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

  private fadeImage(
    transition: Transition,
    durationMs: number,
    block: boolean,
    update: (progress: number) => void,
    onComplete: () => void,
  ): ExecutionHandle | void {
    const animation = block
      ? (transition.animation ??= createExecutionHandle(true))
      : undefined;
    const isAlive = () => this.transition === transition;
    void this.options.tweens.run(
      durationMs,
      (progress) => {
        if (isAlive()) update(progress);
      },
      () => {
        if (!isAlive()) return;
        update(1);
        onComplete();
        this.finishTransition(transition);
        transition.onComplete?.();
      },
      { isAlive },
    );
    // A nonblocking fade can proceed once its asset preparation completes.
    if (!block) transition.animation?.end();
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

  private cancelMovement(): void {
    this.movement?.animation?.end("reset");
    this.movement = undefined;
  }

  private resetImages(): void {
    // _ResetImages (2791 @ 0x1841DD120) DOKills _offset without completing
    // it. Only a surviving completion callback can release a pending wait.
    this.movement = undefined;
    this.retireRoots([...this.roots]);
  }

  private retireRoots(roots: Container[]): void {
    if (roots.length === 0) return;
    this.options.bindFocusTargets?.([]);
    for (const root of roots) {
      if (this.root === root) this.root = null;
      this.roots.delete(root);
      root.destroy({ children: true });
    }
  }
}
