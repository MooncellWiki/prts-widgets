import { FillGradient, Graphics, type Container } from "pixi.js";

import { createExecutionHandle, type ExecutionHandle } from "../../execution";
import { STORY_HEIGHT, STORY_WIDTH, type CurtainInput } from "../../types";
import { dotweenDefaultEase } from "../core/DotweenEase";
import {
  MAX_SCALED_FRAME_DELTA_MS,
  type TweenRunner,
} from "../core/TweenRunner";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Width of AVGCurtain's feather strip in the 2791 sharedassets1 layout. */
const CURTAIN_GRADIENT_PX = 20;
const ZERO_EPSILON = Math.fround(1e-5);
const ZERO_SIZE = { x: 0, y: 0 };

const CURTAIN_STAGE_CORNERS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: STORY_WIDTH, y: 0 },
  { x: STORY_WIDTH, y: STORY_HEIGHT },
  { x: 0, y: STORY_HEIGHT },
];

/**
 * Native corner curtains (direction 1/3/5/7): `_GenSizeDeltaWithMultiplior`
 * scales only the local Y axis of a 1600x1600 AVGCurtain rect, but each
 * corner rect carries a 45° `m_LocalRotation` (z = ±0.3827) around a pivot
 * that sits off-stage past its corner. The inner edge therefore sweeps along
 * the same 45° normal `resolveCurtainVector` returns, at projection
 * `hinge · vector + 1600 * fill` -- a diagonal wipe, offset by the hinge.
 * Hinges are the `panel_curtains` pivots (sharedassets1, 2.7.91) in stage
 * space (y down). They sit 98.8-118.3px past the nearest stage corner, so
 * fills under ~0.062-0.074 never reach the stage, and the stage is fully
 * covered from ~0.946-0.958. The ±800px lateral span covers the whole stage
 * for every corner, so only the inner edge clips.
 */
const CURTAIN_CORNER_SIDE = 1600;
const CURTAIN_CORNER_HINGES: Readonly<
  Record<number, { x: number; y: number }>
> = {
  1: { x: 1204.69, y: -240.69 },
  3: { x: 1201.49, y: 938.18 },
  5: { x: 70.11, y: 938.18 },
  7: { x: 73.31, y: -240.69 },
};

interface CurtainSize {
  x: number;
  y: number;
}

function sizeAxis(direction: number): keyof CurtainSize {
  // _GenSizeDeltaWithMultiplior (2791 @ 0x1841AAE00).
  return direction === 2 || direction === 6 ? "x" : "y";
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function lerpSize(
  from: CurtainSize,
  to: CurtainSize,
  progress: number,
): CurtainSize {
  return {
    x: lerp(from.x, to.x, progress),
    y: lerp(from.y, to.y, progress),
  };
}

interface CurtainRenderState {
  active: boolean;
  alpha: number;
  direction: number;
  edgeFeather: boolean;
  feather?: FillGradient;
  grad: boolean;
  graphic: Graphics;
  originSize: CurtainSize;
  sizeDelta: CurtainSize;
  vector: { x: number; y: number };
}

/** Torappu.AVG.AVGCurtainPanel's direction slots, drawn as clipped Pixi polygons. */
export class CurtainView {
  private readonly curtains = new Map<number, CurtainRenderState>();

  constructor(
    private readonly layer: Container,
    private readonly tweens: TweenRunner,
    private readonly onWarning?: (detail: string) => void,
  ) {
    // 2791 panel_curtains serializes its children in direction order.
    layer.sortableChildren = true;
  }

  /** _ExecuteCurtain (2791 @ 0x1841AA580). */
  show(input: CurtainInput, onComplete?: () => void): ExecutionHandle | void {
    const { direction, grad } = input;
    const vector = this.resolveCurtainVector(direction);
    if (!vector) {
      this.onWarning?.(`unsupported curtain direction: ${direction}`);
      return;
    }

    const state = this.ensureCurtainState(direction, vector);
    const axis = sizeAxis(direction);
    const origin = state.originSize;
    const sizeTo = { ...origin, [axis]: origin[axis] * clamp01(input.fillTo) };
    const alphaTo =
      input.alphaTo === undefined ? undefined : clamp01(input.alphaTo);
    state.active = true;
    state.grad = grad;
    // SetEdgeFeatherEnabled (2791 @ 0x18423D270) restores layout padding
    // except for a near-full target without a gradient. Similar uses 0.01f.
    state.edgeFeather =
      grad ||
      Math.abs(Math.fround(Math.fround(input.fillTo) - 1)) > Math.fround(0.01);

    if (input.fadeMs <= 0) {
      state.sizeDelta = sizeTo;
      state.alpha = alphaTo ?? 1;
      this.updateCurtainState(state, vector);
      return;
    }

    if (input.fillFrom !== undefined) {
      state.sizeDelta = {
        ...origin,
        [axis]: origin[axis] * clamp01(input.fillFrom),
      };
    }
    // SetCurtainAlphaTween snaps to afrom when the alpha track is built.
    // Without a track, _ExecuteCurtain only writes alpha=1 at dispatch.
    state.alpha =
      alphaTo === undefined ? 1 : clamp01(input.alphaFrom ?? state.alpha);
    this.updateCurtainState(state, vector);
    const { delayMs, fadeMs } = input;
    const animation = input.block ? createExecutionHandle(true) : undefined;
    const totalMs = delayMs + fadeMs;
    let sizeFrom: CurtainSize | undefined;
    let alphaFrom: number | undefined;
    // Sequence.ApplyInternalCycle (2791 @ 0x18442B5B0) starts the child
    // tweens at the interval boundary. They sample the live slot values.
    this.tweens.start(
      totalMs,
      (progress) => {
        const elapsedMs = progress * totalMs - delayMs;
        if (elapsedMs < 0) return;
        const eased =
          progress === 1 ? 1 : dotweenDefaultEase(elapsedMs / fadeMs);
        sizeFrom ??= state.sizeDelta;
        state.sizeDelta = lerpSize(sizeFrom, sizeTo, eased);
        if (alphaTo !== undefined) {
          alphaFrom ??= state.alpha;
          state.alpha = lerp(alphaFrom, alphaTo, eased);
        }
        this.updateCurtainState(state, vector);
      },
      {
        maxFrameDeltaMs: MAX_SCALED_FRAME_DELTA_MS,
        onCancel: () => animation?.end("reset"),
        onComplete: () => {
          animation?.end();
          onComplete?.();
        },
        // DOKill(AVGCurtain, true) misses these Sequences in 2791. Keep
        // them live until completion or teardown of the entire Web view.
        target: this,
      },
    );
    return animation;
  }

  /** _HideAllCurtains / HideCurtain (2791 @ 0x1841AAF20 / 0x18423CB70). */
  clear(fadeMs = 0): void {
    for (const state of this.curtains.values()) {
      if (fadeMs <= 0) {
        this.resetCurtain(state);
        continue;
      }
      // The RectTransform target belongs to the standalone retraction.
      this.tweens.killTarget(state);
      let sizeFrom: CurtainSize | undefined;
      this.tweens.start(
        fadeMs,
        (progress) => {
          sizeFrom ??= state.sizeDelta;
          state.sizeDelta = lerpSize(sizeFrom, ZERO_SIZE, progress);
          this.updateCurtainState(state, state.vector);
        },
        {
          ease: dotweenDefaultEase,
          maxFrameDeltaMs: MAX_SCALED_FRAME_DELTA_MS,
          onComplete: () => this.resetCurtain(state),
          target: state,
        },
      );
    }
  }

  /** RecycleCurtain (2791 @ 0x18423CD10) keeps the slot's size and alpha. */
  recycle(): void {
    for (const state of this.curtains.values()) {
      if (
        state.active &&
        (Math.fround(state.alpha) <= ZERO_EPSILON ||
          Math.fround(state.sizeDelta.y) <= ZERO_EPSILON)
      ) {
        state.active = false;
        this.updateCurtainState(state, state.vector);
      }
    }
  }

  reset(): void {
    this.tweens.killTarget(this);
    for (const state of this.curtains.values()) {
      this.tweens.killTarget(state);
      state.graphic.destroy();
      state.feather?.destroy();
    }
    this.curtains.clear();
  }

  private ensureCurtainState(
    direction: number,
    vector: CurtainRenderState["vector"],
  ): CurtainRenderState {
    const existing = this.curtains.get(direction);
    if (existing) return existing;

    const graphic = new Graphics({
      label: `curtain-${direction}`,
      zIndex: direction,
    });
    graphic.visible = false;
    this.layer.addChild(graphic);
    const originSize = CURTAIN_CORNER_HINGES[direction]
      ? { x: CURTAIN_CORNER_SIDE, y: CURTAIN_CORNER_SIDE }
      : { x: STORY_WIDTH, y: STORY_HEIGHT };
    const state: CurtainRenderState = {
      active: false,
      alpha: 1,
      direction,
      edgeFeather: true,
      grad: false,
      graphic,
      originSize,
      sizeDelta: { ...originSize, [sizeAxis(direction)]: 0 },
      vector,
    };
    this.curtains.set(direction, state);
    return state;
  }

  /** ResetCurtain (2791 @ 0x18423CE20) restores the inactive rect. */
  private resetCurtain(state: CurtainRenderState): void {
    this.tweens.killTarget(state);
    state.active = false;
    state.alpha = 1;
    state.edgeFeather = true;
    state.sizeDelta = state.originSize;
    this.updateCurtainState(state, state.vector);
  }

  private updateCurtainState(
    state: CurtainRenderState,
    vector: { x: number; y: number },
  ): void {
    state.graphic.alpha = clamp01(state.alpha);
    state.graphic.clear();
    state.feather?.destroy();
    state.feather = undefined;

    const extent = state.sizeDelta[sizeAxis(state.direction)];
    if (!state.active || state.graphic.alpha <= 0 || extent <= 0) {
      state.graphic.visible = false;
      return;
    }

    const threshold = this.curtainThreshold(state.direction, vector, extent);

    // Straight edges reserve room in their layout padding. The corner
    // gradient takes up space as a 20px child only while it is enabled.
    const inset =
      state.grad ||
      (state.edgeFeather && !CURTAIN_CORNER_HINGES[state.direction])
        ? CURTAIN_GRADIENT_PX
        : 0;
    const bodyEnd = threshold - inset;
    const body = this.buildCurtainBand(vector, null, bodyEnd);
    const feather = state.grad
      ? this.buildCurtainBand(vector, bodyEnd, threshold)
      : [];
    // Corner hinges sit off-stage, so small fills clip away entirely.
    state.graphic.visible = body.length >= 6 || feather.length >= 6;

    if (body.length >= 6) state.graphic.poly(body).fill(0x00_00_00);
    if (feather.length < 6) return;

    state.feather = new FillGradient({
      colorStops: [
        { color: "rgba(0, 0, 0, 1)", offset: 0 },
        { color: "rgba(0, 0, 0, 0)", offset: 1 },
      ],
      end: { x: vector.x * threshold, y: vector.y * threshold },
      start: { x: vector.x * bodyEnd, y: vector.y * bodyEnd },
      textureSpace: "global",
      type: "linear",
    });
    state.graphic.poly(feather).fill(state.feather);
  }

  /**
   * Projection along `vector` where the curtain's inner edge sits. Straight
   * edges hinge on the stage edge. Corners hinge off-stage at
   * CURTAIN_CORNER_HINGES. The extent is the native rect size on its sweep axis.
   */
  private curtainThreshold(
    direction: number,
    vector: { x: number; y: number },
    extent: number,
  ): number {
    const hinge = CURTAIN_CORNER_HINGES[direction];
    if (hinge) return hinge.x * vector.x + hinge.y * vector.y + extent;

    const projections = CURTAIN_STAGE_CORNERS.map(
      (point) => point.x * vector.x + point.y * vector.y,
    );
    return Math.min(...projections) + extent;
  }

  /** Stage rect clipped to `low <= projection <= high`; `null` low means unbounded. */
  private buildCurtainBand(
    vector: { x: number; y: number },
    low: number | null,
    high: number,
  ): number[] {
    let polygon = this.clipCurtainPolygon(
      [...CURTAIN_STAGE_CORNERS],
      vector,
      high,
    );
    if (low !== null) {
      polygon = this.clipCurtainPolygon(
        polygon,
        { x: -vector.x, y: -vector.y },
        -low,
      );
    }
    if (polygon.length < 3) return [];
    return polygon.flatMap((point) => [point.x, point.y]);
  }

  private clipCurtainPolygon(
    polygon: Array<{ x: number; y: number }>,
    vector: { x: number; y: number },
    threshold: number,
  ): Array<{ x: number; y: number }> {
    const output: Array<{ x: number; y: number }> = [];
    const last = polygon.at(-1);
    if (!last) return output;
    let previous = last;
    let previousInside = this.isCurtainPointInside(previous, vector, threshold);

    for (const current of polygon) {
      const currentInside = this.isCurtainPointInside(
        current,
        vector,
        threshold,
      );
      if (currentInside !== previousInside)
        output.push(
          this.intersectCurtainEdge(previous, current, vector, threshold),
        );
      if (currentInside) output.push(current);
      previous = current;
      previousInside = currentInside;
    }

    return output;
  }

  private isCurtainPointInside(
    point: { x: number; y: number },
    vector: { x: number; y: number },
    threshold: number,
  ): boolean {
    return point.x * vector.x + point.y * vector.y <= threshold + 1e-6;
  }

  private intersectCurtainEdge(
    start: { x: number; y: number },
    end: { x: number; y: number },
    vector: { x: number; y: number },
    threshold: number,
  ): { x: number; y: number } {
    const startProjection = start.x * vector.x + start.y * vector.y;
    const endProjection = end.x * vector.x + end.y * vector.y;
    const delta = endProjection - startProjection;
    if (Math.abs(delta) <= 1e-6) return { ...start };

    const ratio = (threshold - startProjection) / delta;
    return {
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    };
  }

  /**
   * Inward half-plane normal per direction, following `_curtainWidgets`
   * order (0 top, then clockwise). The corner diagonals are the native 45°
   * rect rotation, not the stage diagonal.
   */
  private resolveCurtainVector(
    direction: number,
  ): { x: number; y: number } | null {
    const mappedAngles: Record<number, number> = {
      0: 180,
      1: 225,
      2: 270,
      3: 315,
      4: 0,
      5: 45,
      6: 90,
      7: 135,
    };

    const angleDeg = mappedAngles[direction];
    if (angleDeg === undefined) return null;

    const radians = (angleDeg * Math.PI) / 180;
    return {
      x: Math.sin(radians),
      y: -Math.cos(radians),
    };
  }
}
