import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import { dotweenEaseCurve } from "../core/DotweenEase";
import {
  applyCenteredTransform,
  buildGridBackgroundRoot,
  readCenteredTransform,
} from "../core/SceneGeometry";

import type {
  GridBackgroundInput,
  LargeBackgroundTweenInput,
} from "../../types";
import type { TextureLoad } from "../core/TextureAsset";
import type { TweenRunner } from "../core/TweenRunner";
import type { Container, Texture } from "pixi.js";

type AssetKind = "background" | "image";

interface PuzzleViewOptions {
  kind: AssetKind;
  loadTexture: (key: string, kind: AssetKind) => TextureLoad;
  tween: TweenRunner["run"];
  bindFocusTargets?: (targets: readonly Container[]) => void;
  onWarning?: (detail: string) => void;
}

interface Transition {
  preparing: boolean;
  animation?: ExecutionHandle;
  onComplete?: () => void;
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
    this.cancelMovement();
    // Native _ResetImages runs before _LoadImage and reveals the new
    // puzzle over an empty layer. largeimg keeps its outgoing foreground.
    if (this.options.kind === "background") this.retireRoots([...this.roots]);

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
    void Promise.all(textures)
      .then((ready) => this.mountPuzzle(input, ready, transition))
      .catch((error: unknown) => {
        if (this.transition !== transition) return;
        this.transition = undefined;
        animation.fail(error);
      });
    return animation;
  }

  clear(
    fadeMs = 0,
    block = false,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const transition = this.beginTransition(onComplete);
    this.root = null;
    const roots = [...this.roots];
    const resetImages = () => {
      this.cancelMovement();
      this.retireRoots(roots);
    };
    // The Web view can clear an empty layer immediately. The native
    // CanvasGroup remains tweenable when all four Image slots are empty.
    if (roots.length === 0 || fadeMs <= 0) {
      resetImages();
      this.finishTransition(transition);
      return;
    }

    if (this.options.kind === "image") this.cancelMovement();
    const startAlphas = roots.map((root) => root.alpha);
    // Native DOFade OnKill invokes _ResetImages, which kills motion and
    // releases the focus targets before FinishCommand.
    return this.fade(
      transition,
      fadeMs,
      block,
      (progress) => {
        for (const [index, root] of roots.entries())
          root.alpha = startAlphas[index]! * (1 - progress);
      },
      resetImages,
    );
  }

  move(
    input: LargeBackgroundTweenInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    const root = this.root;
    if (!root || root.parent !== this.layer) return;

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

    // _ExecuteImageTween (2791 @ 0x1841D9B90) moves and scales the same
    // _offset with matched timing. Native lets older overlapping tweens
    // resume writing once a newer one ends. Web retires the previous one
    // when a new tween takes over the root.
    this.cancelMovement();
    applyCenteredTransform(root, from);
    if (input.durationMs <= 0) {
      applyCenteredTransform(root, to);
      onComplete?.();
      return;
    }

    const animation = input.block ? createExecutionHandle(true) : undefined;
    const movement = { animation };
    this.movement = movement;
    const isAlive = () =>
      this.movement === movement && root.parent === this.layer;
    void this.options.tween(
      input.durationMs,
      (progress) => {
        if (!isAlive()) return;
        applyCenteredTransform(root, {
          scaleX: from.scaleX + (to.scaleX - from.scaleX) * progress,
          scaleY: from.scaleY + (to.scaleY - from.scaleY) * progress,
          x: from.x + (to.x - from.x) * progress,
          y: from.y + (to.y - from.y) * progress,
        });
      },
      () => {
        if (this.movement !== movement) return;
        this.movement = undefined;
        if (root.parent !== this.layer) {
          animation?.end("reset");
          return;
        }
        applyCenteredTransform(root, to);
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
    if (!this.transition?.preparing) return;
    this.transition.animation?.end("force_end");
    this.transition = undefined;
  }

  private mountPuzzle(
    input: GridBackgroundInput,
    textures: (Texture | null)[],
    transition: Transition,
  ): ExecutionHandle | void {
    if (this.transition !== transition) return;
    transition.preparing = false;

    if (textures.some((texture) => !texture)) {
      if (this.options.kind === "background") {
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
    if (input.fadeMs <= 0) {
      this.retireRoots(outgoing);
      this.finishTransition(transition);
      return;
    }

    root.alpha = 0;
    return this.fade(
      transition,
      input.fadeMs,
      input.block,
      (progress) => {
        root.alpha = progress;
      },
      () => this.retireRoots(outgoing),
    );
  }

  private fade(
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
    void this.options.tween(
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
    this.transition?.animation?.end("reset");
    const transition = { onComplete, preparing: false };
    this.transition = transition;
    return transition;
  }

  private finishTransition(transition: Transition): void {
    if (this.transition !== transition) return;
    this.transition = undefined;
    transition.animation?.end();
  }

  private cancelMovement(): void {
    this.movement?.animation?.end("reset");
    this.movement = undefined;
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
