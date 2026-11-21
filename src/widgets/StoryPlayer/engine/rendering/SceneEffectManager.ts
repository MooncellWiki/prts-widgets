import {
  ColorMatrixFilter,
  Sprite,
  TilingSprite,
  WebGLRenderer,
  WebGPURenderer,
  type Container,
  type Renderer,
} from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../execution";

import {
  SceneFocusOut,
  type FocusFrame,
  type FocusImagePair,
} from "./SceneFocusOut";
import { buildColorEffectMatrix } from "./core/ColorEffectMatrix";
import { dotweenDefaultEase } from "./core/DotweenEase";
import {
  FocusGhost,
  type FocusDrawable,
  type FocusExpression,
} from "./core/FocusGhost";
import {
  installSceneAlphaBlends,
  sourceAlphaBlend,
} from "./core/NativeSceneAlpha";
import { SceneFocusFilter } from "./core/SceneFocusFilter";

import type { FocusOutInput, FocusParamInput } from "../types";
import type { LayerGraph } from "./core/LayerGraph";
import type { TweenRunner } from "./core/TweenRunner";

type SceneEffectLayers = Pick<
  LayerGraph,
  "characters" | "sceneCamera" | "video"
>;

function findImage(target: Container): FocusDrawable | undefined {
  if (target instanceof Sprite || target instanceof TilingSprite) return target;
  for (const child of target.children) {
    const image = findImage(child);
    if (image) return image;
  }
}

/**
 * Native port: Torappu.AVG.AVGSceneEffectManager (2791 UpdateEffect
 * @ 0x1841D0E50, BindPostDisplay @ 0x1841D04F0). The scene camera's filter
 * captures its ordered draw list into the RGBA8 source for focusout.
 */
export class SceneEffectManager {
  private readonly focus: SceneFocusOut;
  private readonly ghosts = new Map<FocusDrawable, FocusGhost>();
  private readonly expressions = new WeakMap<Container, FocusExpression>();
  private readonly grayscaleTweens = new Set<ExecutionHandle>();
  private readonly sceneCamera: Container;
  private focusActive = false;
  private focusFilter?: SceneFocusFilter;
  private grayscaleAmount = 0;
  private inverseAmount = 0;
  private sceneColorFilter?: ColorMatrixFilter;

  constructor(
    private readonly layers: SceneEffectLayers,
    private readonly tween: TweenRunner["run"],
    now?: () => number,
  ) {
    this.sceneCamera = layers.sceneCamera;
    this.focus = new SceneFocusOut(tween, now);
    this.sceneCamera.onRender = (renderer) => this.prepareFocus(renderer);
    this.sceneCamera.once("destroyed", () => {
      this.focusFilter?.destroy();
      this.sceneColorFilter?.destroy();
      this.ghosts.clear();
    });
  }

  get focusFrame(): FocusFrame | undefined {
    return this.focus.frame;
  }

  setCameraEffect(
    effect: "Colorinverse" | "Grayscale",
    amount: number,
    durationMs: number,
    block: boolean,
    keep: boolean,
    initialAmount?: number,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    if (effect === "Colorinverse") {
      this.inverseAmount = amount;
      this.updateSceneColor();
      return;
    }
    // AVGCameraEffect._TweenGrayscaleAmount (2791 @ 0x1841885F0)
    // reads the current amount for negative initamount. Its DOTween setter
    // first writes on Update, even when quick play produces zero duration.
    const from =
      initialAmount !== undefined &&
      Math.fround(initialAmount) >= -Math.fround(1e-5)
        ? initialAmount
        : this.grayscaleAmount;
    const animation = createExecutionHandle(block);
    this.grayscaleTweens.add(animation);
    void this.tween(
      durationMs,
      (progress) => {
        this.grayscaleAmount = from + (amount - from) * progress;
        this.updateSceneColor();
      },
      () => {
        if (!this.grayscaleTweens.delete(animation)) return;
        // __ExecuteCameraEffect_b__0 (2791 @ 0x18419DEF0) calls
        // FinishCommand before clearing a grayscale effect with keep=false.
        animation.end();
        onComplete?.();
        if (!keep) {
          this.grayscaleAmount = 0;
          this.updateSceneColor();
        }
      },
      {
        deferZeroDuration: true,
        ease: dotweenDefaultEase,
        isAlive: () => this.grayscaleTweens.has(animation),
      },
    );
    return animation;
  }

  setFocusOut(
    input: FocusOutInput,
    onComplete?: () => void,
  ): ExecutionHandle | void {
    return this.focus.setFocus(input, onComplete);
  }

  setFocusParam(input: FocusParamInput): void {
    this.focus.setParam(input);
  }

  setImageFocusTargets(
    pair: FocusImagePair,
    fore?: Container,
    back?: Container,
    swap?: boolean,
  ): void {
    this.focus.setImageTargets(pair, fore, back, swap);
  }

  setLargeBackgroundFocusTargets(targets: readonly Container[]): void {
    this.focus.setLargeBackgroundTargets(targets);
  }

  releaseFixedFocusTarget(target: Container): void {
    this.focus.releaseFixedTarget(target);
  }

  setFocusExpression(target: Container, expression: FocusExpression): void {
    this.expressions.set(target, expression);
  }

  bindCgItem(id: string, target: Container): void {
    this.focus.bindCgItem(id, target);
  }

  releaseCgItem(id: string, target: Container): void {
    this.focus.releaseCgItem(id, target);
  }

  reset(): void {
    for (const tween of this.grayscaleTweens) tween.end("reset");
    this.grayscaleTweens.clear();
    this.grayscaleAmount = 0;
    this.inverseAmount = 0;
    this.focus.reset();
    this.disableFocus();
    this.updateFilters();
  }

  private prepareFocus(renderer: Renderer): void {
    const frame = this.focusFrame;
    if (
      !frame ||
      !(renderer instanceof WebGLRenderer || renderer instanceof WebGPURenderer)
    ) {
      this.disableFocus();
      return;
    }
    installSceneAlphaBlends(renderer);
    if (!this.focusActive) {
      this.focusActive = true;
      this.layers.characters.blendMode = sourceAlphaBlend;
      this.layers.video.blendMode = sourceAlphaBlend;
      this.focusFilter ??= new SceneFocusFilter();
      this.updateFilters();
    }
    this.focusFilter!.configure(frame.config);

    const current = new Set<FocusDrawable>();
    for (const { target, amount, soft } of frame.targets) {
      if (target.destroyed || !target.parent) continue;
      const image = findImage(target);
      if (!image) continue;
      current.add(image);
      let ghost = this.ghosts.get(image);
      if (!ghost) {
        ghost = new FocusGhost(image);
        this.ghosts.set(image, ghost);
      }
      ghost.sync(amount, soft, this.expressions.get(target));
    }
    for (const [image, ghost] of this.ghosts) {
      if (current.has(image)) continue;
      ghost.destroy();
      this.ghosts.delete(image);
    }
  }

  private disableFocus(): void {
    if (!this.focusActive) return;
    this.focusActive = false;
    this.layers.characters.blendMode = "inherit";
    this.layers.video.blendMode = "inherit";
    for (const ghost of this.ghosts.values()) ghost.destroy();
    this.ghosts.clear();
    this.updateFilters();
  }

  private updateSceneColor(): void {
    this.updateFilters();
    if (this.sceneColorFilter)
      this.sceneColorFilter.matrix = buildColorEffectMatrix(
        this.grayscaleAmount,
        this.inverseAmount,
      );
  }

  private updateFilters(): void {
    const filters = [];
    if (this.focusActive && this.focusFilter) filters.push(this.focusFilter);
    if (this.grayscaleAmount !== 0 || this.inverseAmount !== 0) {
      // AVGSceneEffectManager.EFFECT_ORDER (2791 @ 0x1841D4F00) places
      // AVGSceneGrayScale after the focusout composite on the same camera.
      this.sceneColorFilter ??= new ColorMatrixFilter({
        antialias: "inherit",
        resolution: "inherit",
      });
      filters.push(this.sceneColorFilter);
    }
    const previous = this.sceneCamera.filters;
    if (
      previous?.length === filters.length &&
      filters.every((filter, index) => previous[index] === filter)
    )
      return;
    this.sceneCamera.filters = filters;
  }
}
