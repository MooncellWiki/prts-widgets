import { ColorMatrixFilter, type Container } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../execution";

import { SceneFocusOut } from "./SceneFocusOut";
import { buildColorEffectMatrix } from "./core/ColorEffectMatrix";
import { dotweenDefaultEase } from "./core/DotweenEase";

import type { FocusOutInput, FocusParamInput } from "../types";
import type { LayerGraph } from "./core/LayerGraph";
import type { TweenRunner } from "./core/TweenRunner";

type SceneEffectLayers = Pick<
  LayerGraph,
  "background" | "characters" | "gridBackground" | "images" | "sceneCamera"
>;

/**
 * Native port: Torappu.AVG.AVGSceneEffectManager (2791 UpdateEffect
 * @ 0x1841D0E50, BindPostDisplay @ 0x1841D04F0). Pixi container filters
 * supply the scene color pass and focus overlays.
 */
export class SceneEffectManager {
  private readonly focus: SceneFocusOut;
  private readonly grayscaleTweens = new Set<ExecutionHandle>();
  private readonly sceneCamera: Container;
  private grayscaleAmount = 0;
  private inverseAmount = 0;
  private sceneColorFilter: ColorMatrixFilter | null = null;

  constructor(
    layers: SceneEffectLayers,
    private readonly tween: TweenRunner["run"],
  ) {
    this.sceneCamera = layers.sceneCamera;
    this.focus = new SceneFocusOut(
      new Map([
        ["bg", layers.background],
        ["char", layers.characters],
        // AVGImagePanel registers ck_cg_1/2 on its image layers.
        ["cg", layers.images],
        // LargeBackgroundPanel._BindCamEffectTarget (2791 @ 0x1841D81E0)
        // binds fixed ck_lbg_* image slots. The persistent Pixi layer
        // carries their shared focus amount across puzzle replacements.
        ["lbg", layers.gridBackground],
      ]),
      tween,
    );
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
    this.updateSceneColor();
    this.focus.reset();
  }

  private updateSceneColor(): void {
    if (this.grayscaleAmount === 0 && this.inverseAmount === 0) {
      this.sceneCamera.filters = [];
      this.sceneColorFilter = null;
      return;
    }

    // AVGSceneGrayScale.Render (2791 @ 0x1841FB700) applies both channels
    // in one pass over the scene camera, including its CG item canvas.
    this.sceneColorFilter ??= new ColorMatrixFilter();
    this.sceneColorFilter.matrix = buildColorEffectMatrix(
      this.grayscaleAmount,
      this.inverseAmount,
    );
    this.sceneCamera.filters = [this.sceneColorFilter];
  }
}
