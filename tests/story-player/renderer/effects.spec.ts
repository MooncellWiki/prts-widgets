import {
  Application,
  Assets,
  Container,
  DOMAdapter,
  Sprite,
  Texture,
  TickerPlugin,
  type FillGradient,
} from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SLIDE_MASK_TEXTURE_URL } from "../../../src/widgets/StoryPlayer/assets";
import { buildColorEffectMatrix } from "../../../src/widgets/StoryPlayer/engine/rendering/core/ColorEffectMatrix";
import { StoryRuntime } from "../../../src/widgets/StoryPlayer/engine/runtime";
import {
  createRenderedPlayback,
  createRenderer,
} from "../helpers/rendererFixtures";
import { createContext, FakeAudio } from "../helpers/runtimeFakes";

import type {
  BlockerInput,
  CgItemInput,
  CurtainInput,
} from "../../../src/widgets/StoryPlayer/engine/types";

// Turns the -0 that `0 * -1` produces into +0 so `toEqual` stops
// distinguishing them. Deliberately narrow: `v || 0` would also swallow NaN
// and let a broken matrix pass.
function normalizeZero(values: number[]): number[] {
  return values.map((v) => (v === 0 ? 0 : v));
}

function sceneColorFilter(gray: number, inverse = 0) {
  return expect.objectContaining({
    matrix: buildColorEffectMatrix(gray, inverse).map((value) =>
      expect.closeTo(value, 12),
    ),
  });
}

function createMaskRenderer(
  context?: Parameters<typeof createRenderer>[0],
  warn?: (detail: string) => void,
): any {
  const renderer = createRenderer(context, warn);
  renderer.app = {};
  renderer.frames.manual = true;
  renderer.layers.attach(new Container());
  return renderer;
}

const focusCgItemInput: CgItemInput = {
  alphaDelayMs: 0,
  alphaDurationMs: 0,
  alphaFrom: 1,
  alphaTo: 1,
  assetKey: "a",
  block: false,
  ease: "Linear",
  height: 0,
  key: "a",
  layer: 0,
  positionDelayMs: 0,
  positionDurationMs: 0,
  rotationDurationMs: 0,
  rotationFrom: -1,
  rotationTo: 0,
  scaleDelayMs: 0,
  scaleDurationMs: 0,
  scaleFrom: 1,
  scaleTo: 1,
  width: 0,
};

// Renderer stub for the focusout×cgitem interplay specs: textures resolve
// instantly and every tween jumps to its completed state.
function createFocusRenderer(): any {
  const renderer = createRenderer();
  renderer.app = {};
  renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);
  renderer.tween = vi.fn(
    async (
      _durationMs: number,
      update: (progress: number) => void,
      complete?: () => void,
    ) => {
      update(1);
      complete?.();
    },
  );
  renderer.updatePhaseTweenRunner.run = (
    ...args: Parameters<typeof renderer.tween>
  ) => renderer.tween(...args);
  return renderer;
}

// A CurtainRenderState whose graphic records every poly()/fill() argument.
function createCurtainGraphicState(
  direction: number,
  sizeDelta: { x: number; y: number },
  grad: boolean,
) {
  const draws: unknown[] = [];
  const state = {
    active: true,
    alpha: 1,
    direction,
    edgeFeather: true,
    grad,
    graphic: {
      alpha: 1,
      clear: () => {},
      poly(points: number[]) {
        draws.push(points);
        return this;
      },
      fill(style: unknown) {
        draws.push(style);
        return this;
      },
      visible: false,
    },
    sizeDelta,
  };
  return { draws, state };
}

function stubGradientCanvas() {
  return vi
    .spyOn(DOMAdapter.get(), "createCanvas")
    .mockImplementation((width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width ?? 0;
      canvas.height = height ?? 0;
      return Object.assign(canvas, {
        getContext: () => ({
          createLinearGradient: () => ({ addColorStop() {} }),
          fillRect() {},
        }),
      });
    });
}

function expectCurtainFeather(
  gradient: FillGradient,
  vector: { x: number; y: number },
  innerEdge: number,
): void {
  gradient.buildGradient();
  const sampleU = (distance: number, tangent = 0) => {
    const projection = innerEdge - 20 + distance;
    const pixel = {
      x: vector.x * projection - vector.y * tangent,
      y: vector.y * projection + vector.x * tangent,
    };
    return gradient.transform.applyInverse(pixel).x / gradient.texture.width;
  };
  const start = sampleU(0);
  const end = sampleU(20);
  expect(Math.min(start, end)).toBeCloseTo(0);
  expect(Math.max(start, end)).toBeCloseTo(1);
  expect(sampleU(10)).toBeCloseTo(0.5);
  expect(sampleU(0, 100)).toBeCloseTo(start);
  expect(sampleU(20, 100)).toBeCloseTo(end);
}

// Clipped polygons start wherever the clip enters the stage, so compare
// vertex sets (rounded to 0.01px) instead of flat arrays.
function toPointSet(points: number[]): string[] {
  const set: string[] = [];
  for (let index = 0; index < points.length; index += 2)
    set.push(`${points[index]!.toFixed(2)},${points[index + 1]!.toFixed(2)}`);
  return set.toSorted();
}

describe("PixiStoryRenderer", () => {
  it("eases the cameraeffect grayscale tween with DOTween's default OutQuad", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0);

    const sceneCamera = renderer.layers.sceneCamera;
    expect(sceneCamera.filters ?? []).toHaveLength(0);
    renderer.frames.step(500);
    // Native AVGCameraEffect never calls SetEase, so DOTween.To runs with
    // DOTween 1.2.760's defaultEaseType=6 (OutQuad): halfway = 0.75, not the
    // linear 0.5.
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.75)]);
    renderer.frames.step(500);
    expect(sceneCamera.filters).toEqual([sceneColorFilter(1)]);
  });

  it("starts the grayscale tween from the current amount for a negative initamount", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    renderer.frames.step();
    const sceneCamera = renderer.layers.sceneCamera;
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.6)]);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, -1);

    // Native _TweenGrayscaleAmount checks MathUtil.LT(initAmount, 0): any
    // negative initamount means "start from the current grayscale amount",
    // not an explicit negative start.
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.6)]);
    renderer.frames.step(500);
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.9)]);
  });

  it("writes an explicit grayscale initamount on the first update", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    renderer.frames.step();
    const sceneCamera = renderer.layers.sceneCamera;
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.6)]);

    // MathUtil.LT(0.2, 0) is false, so native takes the argument as the tween
    // start and discards the 0.6 the effect manager currently holds.
    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0.2);

    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.6)]);
    renderer.frames.step(0);
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.2)]);
    renderer.frames.step(500);
    expect(sceneCamera.filters).toEqual([sceneColorFilter(0.8)]);
  });

  it("applies grayscale as Rec.601 luma desaturation, not an additive tint", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Grayscale", 1, 0, false, true);
    renderer.frames.step();

    // Native AVGSceneGrayScale blits with mat_grayscale and writes
    // _Params = (0.299, 0.587, 0.114, amount): Rec.601 luma desaturation
    // where a mid-gray pixel stays mid-gray. pixi's
    // ColorMatrixFilter.grayscale() builds an additive [s,s,s] matrix that
    // clips mid-grays to white around amount 1, so the matrix is composed
    // manually.
    const matrix = renderer.layers.sceneCamera.filters[0].matrix as number[];
    expect(matrix.slice(0, 5)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(5, 10)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(10, 15)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(15, 20)).toEqual([0, 0, 0, 1, 0]);
  });

  it("composes Colorinverse over grayscale like the native _Inverse lerp", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Colorinverse", 1, 0, false, true);

    // Native _Inverse lerps each channel toward 1-color in the same blit:
    // rows scale by -1 with offset 1. (normalizeZero turns the -0 produced
    // by 0 * -1 into +0, which toEqual distinguishes.)
    const inverseMatrix = renderer.layers.sceneCamera.filters[0]
      .matrix as number[];
    expect(normalizeZero(inverseMatrix.slice(0, 5))).toEqual([-1, 0, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(5, 10))).toEqual([0, -1, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(10, 15))).toEqual([
      0, 0, -1, 0, 1,
    ]);

    // With grayscale=1 kept from a previous command, desaturation and
    // inversion compose into one matrix.
    renderer.setCameraEffect("Grayscale", 1, 0, false, true);
    renderer.frames.step();
    const bothMatrix = renderer.layers.sceneCamera.filters[0]
      .matrix as number[];
    expect(normalizeZero(bothMatrix.slice(0, 5))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
    expect(normalizeZero(bothMatrix.slice(5, 10))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
    expect(normalizeZero(bothMatrix.slice(10, 15))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
  });

  it.each([
    [
      '[cameraeffect(effect="Grayscale",fadetime=0.032,block=true)]',
      [null, 3],
      0,
    ],
    ['[cameraeffect(effect="Grayscale",fadetime=0,block=true)]', [3, 3], 0],
    ["[camerashake(duration=0.032,block=true)]", [null, 3], 0],
    ['[focusout(type="bg",to=1,duration=0.012,block=true)]', [null, 3], 12],
  ])(
    "draws the next line in the frame %s completes",
    async (command, draws, now) => {
      const context = createContext([
        '[cameraeffect(effect="Colorinverse",keep=true,block=true)]',
        command,
        '[name="A"]after',
      ]);
      const renderer = createRenderer(context, undefined, () => now);
      const app = new Application();
      const drawnLines: Array<number | null> = [];
      const runtime = new StoryRuntime(context, renderer, new FakeAudio());
      app.render = () => drawnLines.push(runtime.getDisplayedLineIndex());
      TickerPlugin.init.call(app, { autoStart: false });
      renderer.app = app;
      renderer.layers.attach(app.stage);
      renderer.dialogFrameTextureFailed = true;
      app.ticker.lastTime = 0;
      const started = runtime.start();
      try {
        const sceneCamera = renderer.layers.sceneCamera;
        expect(sceneCamera.filters).toEqual([sceneColorFilter(0, 1)]);
        expect(runtime.getDisplayedLineIndex()).toBeNull();
        for (const time of [16, 32]) {
          now = time;
          app.ticker.update(time);
        }
        expect(drawnLines).toEqual(draws);
        expect(sceneCamera.filters).toEqual([sceneColorFilter(0, 1)]);
        expect(renderer.layers.scene.position.x).toBe(0);
        expect(renderer.layers.scene.position.y).toBe(0);
      } finally {
        runtime.destroy();
        renderer.app = null;
        renderer.destroy();
        app.ticker.destroy();
        app.stage.destroy({ children: true });
        await started;
      }
    },
  );

  it("force-ends an infinite blocked shake and preserves other camera effects at a segment skip", async () => {
    const context = createContext([
      '[cameraeffect(effect="Colorinverse",keep=true)]',
      '[cameraeffect(effect="Grayscale",fadetime=0.064,keep=true)]',
      "[camerashake(block=true)]",
      '[name="A"]skipped',
      "[SkipToThis]",
      '[name="B"]after',
    ]);
    const renderer = createRenderer(context);
    renderer.app = {};
    renderer.frames.manual = true;
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    const position = renderer.layers.scene.position;
    let skipped: Promise<void> | undefined;
    try {
      await renderer.frames.advance(10_000);
      expect(runtime.getDisplayedLineIndex()).toBeNull();
      const sceneCamera = renderer.layers.sceneCamera;
      expect(sceneCamera.filters).toEqual([sceneColorFilter(1, 1)]);

      position.set(8, 4);
      skipped = runtime.skipNode();
      expect([position.x, position.y]).toEqual([0, 0]);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      renderer.frames.step(16);
      expect(runtime.getDisplayedLineIndex()).toBe(6);
      expect([position.x, position.y]).toEqual([0, 0]);
      expect(sceneCamera.filters).toEqual([sceneColorFilter(1, 1)]);
    } finally {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await Promise.all([started, skipped]);
    }
  });

  it("clears camera and focus effects on story end and stops pending tween writes", async () => {
    const context = createContext([
      '[cameraeffect(effect="Colorinverse",keep=true)]',
      '[cameraeffect(effect="Grayscale",fadetime=1,keep=true)]',
      '[focusparam(effect="Colorinverse",blur=false)]',
      '[focusout(type="bg",from=0.5,to=1,duration=1)]',
      "[camerashake()]",
      '[name="A"]text',
      '[skipnode(mode="skip")]',
    ]);
    const renderer = createRenderer(context);
    renderer.app = {};
    renderer.frames.manual = true;
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    try {
      renderer.frames.step(16);
      expect(renderer.layers.sceneCamera.filters).toEqual([
        sceneColorFilter(0.031744, 1),
      ]);
      expect(renderer.backgroundLayer.filters).toHaveLength(1);
      await runtime.skipNode();
      expect(runtime.getState()).toBe("finished");
      renderer.frames.step(1000);
      expect(renderer.layers.sceneCamera.filters).toHaveLength(0);
      expect(renderer.backgroundLayer.filters).toHaveLength(0);
      expect(renderer.layers.scene.position.x).toBe(0);
      expect(renderer.layers.scene.position.y).toBe(0);
    } finally {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await started;
    }
  });

  it("desaturates focusout targets with the same Rec.601 matrix as cameraeffect", async () => {
    const renderer = createRenderer();

    renderer.setFocusParam({ blur: false, color: "Grayscale" });
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to: 1,
      type: "bg",
    });

    // Native AVGSceneFocusOut.Render blits with the same mat_grayscale
    // material as AVGSceneGrayScale, so focusout must not fall back to pixi's
    // additive grayscale() tint either.
    const filters = renderer.backgroundLayer.filters as { matrix: number[] }[];
    expect(filters).toHaveLength(1);
    expect(filters[0]!.matrix.slice(0, 5)).toEqual([0.299, 0.587, 0.114, 0, 0]);
  });

  it("scales the focusout inverse channel by the focus amount", async () => {
    const renderer = createRenderer();

    renderer.setFocusParam({ blur: false, color: "Colorinverse" });
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to: 0.5,
      type: "bg",
    });

    // Native keeps `_Inverse` binary and blends the processed target back in
    // by the per-item amount through mat_blit_ghost; folding the amount into
    // `_Inverse` models that same lerp, so a half-focused target collapses to
    // flat mid-grey instead of fully inverting.
    const filters = renderer.backgroundLayer.filters as { matrix: number[] }[];
    expect(normalizeZero(filters[0]!.matrix.slice(0, 5))).toEqual([
      0, 0, 0, 0, 0.5,
    ]);
  });

  it("releases a blocking focusout on SkipToThis while its tween keeps running", async () => {
    const context = createContext([
      '[focusparam(effect="Colorinverse",blur=false)]',
      '[focusout(type="bg",from=0,to=1,duration=0.064,block=true)]',
      '[name="A"]skipped',
      "[SkipToThis]",
      '[name="B"]after',
    ]);
    const renderer = createRenderer(context);
    const app = new Application();
    app.render = () => {};
    TickerPlugin.init.call(app, { autoStart: false });
    renderer.app = app;
    renderer.layers.attach(app.stage);
    renderer.dialogFrameTextureFailed = true;
    app.ticker.lastTime = 0;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    const focusAmount = () => renderer.backgroundLayer.filters?.[0]?.matrix[4];
    let skipped: Promise<void> | undefined;
    try {
      app.ticker.update(16);
      expect(runtime.getDisplayedLineIndex()).toBeNull();
      renderer.layers.scene.position.set(4, 8);
      skipped = runtime.skipNode();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      app.ticker.update(32);
      expect(runtime.getDisplayedLineIndex()).toBe(5);
      expect(renderer.layers.scene.position.x).toBe(0);
      expect(renderer.layers.scene.position.y).toBe(0);
      expect(focusAmount()).toBeCloseTo(0.5);

      app.ticker.update(48);
      app.ticker.update(64);
      expect(focusAmount()).toBeCloseTo(1);
      expect(runtime.getDisplayedLineIndex()).toBe(5);
    } finally {
      runtime.destroy();
      app.ticker.destroy();
      app.stage.destroy({ children: true });
      await Promise.all([started, skipped]);
    }
  });

  it("treats focusout on an empty channel as a non-blocking native no-op", async () => {
    const renderer = createFocusRenderer();
    await renderer.showCgItem({ ...focusCgItemInput, key: "a" }).completion;
    renderer.tween.mockClear();

    // `_ExecuteFocusout` returns before any `UpdateEffect` when
    // `IsChannelEmpty()`: an empty cgitem id (not "all items"), `customchar`
    // without custom slots, or a type missing from `_channels`.
    for (const [type, id] of [
      ["cgitem", ""],
      ["customchar", ""],
      ["customchar", "m"],
      ["unknown", "a"],
    ])
      await renderer.setFocusOut({
        block: true,
        durationMs: 1000,
        from: 1,
        id,
        to: 1,
        type,
      });

    expect(renderer.tween).not.toHaveBeenCalled();
    expect(renderer.cgItemView.targets("a")[0].filters ?? []).toHaveLength(0);
    expect(renderer.charLayer.filters ?? []).toHaveLength(0);
  });

  it("binds a stored cgitem focus amount on show and drops it on dispose", async () => {
    const renderer = createFocusRenderer();
    const filtersOf = (key: string) =>
      renderer.cgItemView.targets(key)[0].filters ?? [];

    // `SetWhenBind` stores the amount before the display object exists and
    // `TryRegister` replays it on registration.
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "a",
      to: 1,
      type: "cgitem",
    });
    await renderer.showCgItem({ ...focusCgItemInput, key: "a" }).completion;
    expect(filtersOf("a").length).toBeGreaterThan(0);

    // `BeforeItemDisposed` removes the stored amount: a re-show after the
    // hide completes comes back clean.
    await renderer.clearCgItems("a", 0)?.completion;
    await renderer.showCgItem({ ...focusCgItemInput, key: "a" }).completion;
    expect(filtersOf("a")).toHaveLength(0);

    // Same for a same-key replacement, which disposes the old slot first.
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "a",
      to: 1,
      type: "cgitem",
    });
    expect(filtersOf("a").length).toBeGreaterThan(0);
    await renderer.showCgItem({ ...focusCgItemInput, key: "a" }).completion;
    expect(filtersOf("a")).toHaveLength(0);
  });

  it("unbinds a replacement's focus channel when the old clear-all fade ends", async () => {
    const renderer = createFocusRenderer();
    const command = {
      block: false,
      durationMs: 0,
      id: "a",
      to: 1,
      type: "cgitem",
    };
    await renderer.showCgItem(focusCgItemInput).completion;
    const old = renderer.cgItemView.targets("a")[0];
    await renderer.setFocusOut(command);
    let finishFade: (() => void) | undefined;
    renderer.tween.mockImplementationOnce(
      async (_duration: number, _step: unknown, complete: () => void) => {
        finishFade = complete;
      },
    );
    renderer.clearCgItems(undefined, 1000, "Linear", true);
    await renderer.showCgItem(focusCgItemInput).completion;
    const current = renderer.cgItemView.targets("a")[0];
    expect(current).not.toBe(old);
    expect(current.filters).toHaveLength(1);

    await renderer.setFocusOut({ ...command, to: 0 });
    expect(current.filters).toHaveLength(0);
    expect(old.filters).toHaveLength(1);
    finishFade?.();
    expect(old.destroyed).toBe(true);

    await renderer.setFocusOut(command);
    expect(current.filters).toHaveLength(0);
    await renderer.showCgItem({ ...focusCgItemInput, key: "b" }).completion;
    expect(renderer.cgItemView.targets("b")[0].filters ?? []).toHaveLength(0);
  });

  it("draws a curtain as a solid body plus a fixed-width feather strip", () => {
    const { curtainView } = createRenderer();
    const { draws, state } = createCurtainGraphicState(
      6,
      { x: 640, y: 720 },
      true,
    );

    const canvas = stubGradientCanvas();
    try {
      // The body is black up to x=620, then the feather covers x=620..640.
      const vector = { x: 1, y: 0 };
      curtainView.updateCurtainState(state, vector);
      expect(state.graphic.visible).toBe(true);
      expect(draws).toHaveLength(4);
      expect(draws[1]).toBe(0x00_00_00);
      expectCurtainFeather(draws[3] as FillGradient, vector, 640);
    } finally {
      canvas.mockRestore();
    }
  });

  it("draws corner curtains as 45° wipes hinged past the stage corner", () => {
    const { curtainView } = createRenderer();
    const { draws, state } = createCurtainGraphicState(
      1,
      { x: 1600, y: 112 },
      false,
    );
    const vector = curtainView.resolveCurtainVector(1);

    // direction 1 is a 1600x1600 rect rotated -45° around a pivot at
    // (1204.69, -240.69), 116.9px past the top-right corner along the
    // inward normal: fill 0.07 (112px) never reaches the stage.
    curtainView.updateCurtainState(state, vector);
    expect(state.graphic.visible).toBe(false);
    expect(draws).toEqual([]);

    // fill 0.5 puts the inner edge 800 - 116.9px into the stage: the 45°
    // line y = x - 314.0, not the stage diagonal.
    state.sizeDelta.y = 800;
    curtainView.updateCurtainState(state, vector);
    expect(state.graphic.visible).toBe(true);
    expect(draws).toHaveLength(2);
    expect(toPointSet(draws[0] as number[])).toEqual(
      toPointSet([314.01, 0, 1280, 0, 1280, 720, 1034.01, 720]),
    );
    expect(draws[1]).toBe(0x00_00_00);

    // From fill ~0.957 the rect clears the opposite corner.
    draws.length = 0;
    state.sizeDelta.y = 1536;
    curtainView.updateCurtainState(state, vector);
    expect(toPointSet(draws[0] as number[])).toEqual(
      toPointSet([0, 0, 1280, 0, 1280, 720, 0, 720]),
    );
  });

  it.each([
    { direction: 1, hinge: { x: 1204.69, y: -240.69 } },
    { direction: 3, hinge: { x: 1201.49, y: 938.18 } },
    { direction: 5, hinge: { x: 70.11, y: 938.18 } },
    { direction: 7, hinge: { x: 73.31, y: -240.69 } },
  ])(
    "samples corner $direction along the feather normal",
    ({ direction, hinge }) => {
      const { curtainView } = createRenderer();
      const { draws, state } = createCurtainGraphicState(
        direction,
        { x: 1600, y: 800 },
        true,
      );
      const vector = curtainView.resolveCurtainVector(direction);
      const edge = hinge.x * vector.x + hinge.y * vector.y + 800;
      const canvas = stubGradientCanvas();
      try {
        curtainView.updateCurtainState(state, vector);
        expect(state.graphic.visible).toBe(true);
        expect(draws).toHaveLength(4);
        expect(draws[1]).toBe(0x00_00_00);
        expectCurtainFeather(draws[3] as FillGradient, vector, edge);

        // The unfeathered corner body reaches the inner edge.
        draws.length = 0;
        state.grad = false;
        curtainView.updateCurtainState(state, vector);
        expect(draws).toHaveLength(2);
        const projections = (draws[0] as number[]).flatMap(
          (value, index, all) =>
            index % 2 === 0
              ? [value * vector.x + all[index + 1]! * vector.y]
              : [],
        );
        expect(Math.max(...projections)).toBeCloseTo(edge);
      } finally {
        canvas.mockRestore();
      }
    },
  );

  it("leaves the straight-edge layout padding empty without grad", () => {
    const { curtainView } = createRenderer();
    const { draws, state } = createCurtainGraphicState(
      0,
      { x: 1280, y: 180 },
      false,
    );

    // A partial top curtain keeps the inner 20px of its 180px rect empty.
    curtainView.updateCurtainState(state, { x: 0, y: 1 });
    expect(draws).toEqual([[0, 160, 0, 0, 1280, 0, 1280, 160], 0x00_00_00]);

    // Under 20px nothing but the (inactive) gradient slot is left.
    draws.length = 0;
    state.sizeDelta.y = 14.4;
    curtainView.updateCurtainState(state, { x: 0, y: 1 });
    expect(state.graphic.visible).toBe(false);
    expect(draws).toEqual([]);
  });
});

const curtainInput: CurtainInput = {
  block: false,
  delayMs: 0,
  direction: 0,
  fadeMs: 0,
  fillFrom: 0.25,
  fillTo: 0.5,
  grad: false,
};

describe("PixiStoryRenderer curtain", () => {
  it("samples live alpha when a delayed track starts", () => {
    const renderer = createMaskRenderer();
    renderer.setCurtain({ ...curtainInput, alphaTo: 0.3 });
    const graphic = renderer.layers.curtains.children[0];
    expect(graphic.alpha).toBe(0.3);

    const previous = renderer.setCurtain({
      ...curtainInput,
      alphaTo: 0.8,
      block: true,
      delayMs: 50,
      fadeMs: 150,
    });
    expect(graphic.alpha).toBe(0.3);

    renderer.setCurtain({ ...curtainInput, alphaFrom: 0.2, fadeMs: 200 });
    expect(graphic.alpha).toBe(1);
    renderer.frames.step(125);
    // The old alpha track starts from the live value of 1. The new command
    // has no alpha track, so its size tween leaves this sample alone.
    expect(graphic.alpha).toBeCloseTo(0.85);
    renderer.frames.step(75);
    expect(previous.endReason).toBe("complete");
    expect(graphic.alpha).toBeCloseTo(0.8);
  });

  it("retracts the sides while keeping their alpha and feather state", () => {
    const renderer = createMaskRenderer();
    // The test canvas cannot rasterize FillGradient.
    vi.spyOn(renderer.curtainView, "updateCurtainState").mockImplementation(
      () => {},
    );
    renderer.setCurtain({ ...curtainInput, direction: 4 });
    renderer.setCurtain({ ...curtainInput, alphaTo: 0.3, grad: true });
    const { curtains } = renderer.layers;
    const top = renderer.curtainView.curtains.get(0);
    curtains.sortChildren();
    expect(curtains.children[0]).toBe(top.graphic);

    renderer.clearCurtains(100);
    renderer.frames.step(50);
    expect(top.sizeDelta).toEqual({ x: 320, y: 90 });
    expect(top.alpha).toBe(0.3);
    expect(top.grad).toBe(true);
    expect(renderer.layers.curtains.children).toHaveLength(2);

    renderer.frames.step(50);
    expect(top.active).toBe(false);
    expect(top.alpha).toBe(1);
    expect(top.sizeDelta).toEqual({ x: 1280, y: 720 });
    expect(curtains.children).toHaveLength(2);
  });

  it("keeps delayed sequences running after a standalone retraction resets the slot", () => {
    const renderer = createMaskRenderer();
    const animation = renderer.setCurtain({
      ...curtainInput,
      alphaFrom: 0.4,
      alphaTo: 0.8,
      block: true,
      delayMs: 100,
      fadeMs: 100,
    });
    const graphic = renderer.layers.curtains.children[0];

    renderer.clearCurtains(50);
    renderer.frames.step(50);
    expect(graphic.visible).toBe(false);
    expect(graphic.alpha).toBe(1);
    expect(animation.endReason).toBeUndefined();

    renderer.frames.step(150);
    expect(animation.endReason).toBe("complete");
    expect(graphic.visible).toBe(false);
    expect(graphic.alpha).toBeCloseTo(0.8);
  });

  it("retracts first-use sides opened while the all-side retraction is running", () => {
    const renderer = createMaskRenderer();
    renderer.setCurtain({ ...curtainInput, direction: 2 });
    renderer.clearCurtains(400);
    expect(renderer.layers.curtains.children).toHaveLength(1);

    renderer.setCurtain({ ...curtainInput, direction: 0, fadeMs: 500 });
    renderer.setCurtain({ ...curtainInput, direction: 4, fadeMs: 500 });
    const [, top, bottom] = renderer.layers.curtains.children;
    expect(top.visible).toBe(true);
    expect(bottom.visible).toBe(true);

    renderer.frames.step(200);
    renderer.frames.step(200);
    expect(top.visible).toBe(false);
    expect(bottom.visible).toBe(false);

    renderer.frames.step(100);
    expect(top.visible).toBe(false);
    expect(bottom.visible).toBe(false);
  });

  it.each([
    { fillFrom: 2, fillTo: 0, height: 340 },
    { fillFrom: -0.5, fillTo: 0.5, height: 160 },
    { fillFrom: 0.5, fillTo: 2, height: 720 },
  ])(
    "samples the unclamped tween from $fillFrom to $fillTo",
    ({ fillFrom, fillTo, height }) => {
      const renderer = createMaskRenderer();
      renderer.setCurtain({ ...curtainInput, fadeMs: 100, fillFrom, fillTo });
      renderer.recycleCurtains();
      renderer.frames.step(50);
      const graphic = renderer.layers.curtains.children[0];
      expect(graphic.visible).toBe(true);
      expect(graphic.getLocalBounds().height).toBeCloseTo(height);
    },
  );

  it("uses the destination fill to disable padding for a full straight curtain", () => {
    const renderer = createMaskRenderer();
    renderer.setCurtain({ ...curtainInput, fillTo: 0.25 });
    const graphic = renderer.layers.curtains.children[0];
    expect(graphic.getLocalBounds().height).toBeCloseTo(160);

    renderer.setCurtain({ ...curtainInput, fadeMs: 100, fillTo: 1 });
    expect(graphic.getLocalBounds().height).toBeCloseTo(180);
    renderer.frames.step(50);
    // Default OutQuad samples 75% at half time.
    expect(graphic.getLocalBounds().height).toBeCloseTo(585);
    renderer.frames.step(50);
    expect(graphic.getLocalBounds().height).toBeCloseTo(720);
  });
});

const blockerInput: BlockerInput = {
  block: false,
  fadeMs: 0,
  from: { a: Number.NaN, b: Number.NaN, g: Number.NaN, r: Number.NaN },
  inverse: false,
  style: "default",
  to: { a: 1, b: 0, g: 0, r: 0 },
};

const textureAssets: { load: (url: string) => Promise<Texture> } = Assets;

describe("PixiStoryRenderer blocker", () => {
  afterEach(() => {
    if (Assets.cache.has(SLIDE_MASK_TEXTURE_URL))
      Assets.cache.remove(SLIDE_MASK_TEXTURE_URL);
  });

  it("draws the blocker between the scene and the stamp and curtain layers", () => {
    const renderer = createMaskRenderer();
    renderer.setBlocker(blockerInput);
    renderer.setCurtain(curtainInput);

    const { animTexts, blocker, curtains, sceneCamera, world } =
      renderer.layers;
    expect(blocker.children[0]).toBeInstanceOf(Sprite);
    expect(curtains.children).toHaveLength(1);
    expect(world.children).toEqual([sceneCamera, blocker, animTexts, curtains]);
  });

  it("applies OutQuad to raw 0-255 color endpoints and clips only the tint", () => {
    const renderer = createMaskRenderer();
    renderer.setBlocker({
      ...blockerInput,
      fadeMs: 300,
      to: { a: 1, b: 255, g: 255, r: 255 },
    });

    const sprite = renderer.layers.blocker.children[0];
    renderer.frames.step(150);
    expect(sprite.alpha).toBe(0.75);
    expect(sprite.tint).toBe(0xff_ff_ff);
    expect(renderer.blockerView.color).toEqual({
      a: 0.75,
      b: 191.25,
      g: 191.25,
      r: 191.25,
    });
  });

  it("kills the old DOColor without its transparent cleanup", () => {
    const renderer = createMaskRenderer();
    const first = renderer.setBlocker({
      ...blockerInput,
      block: true,
      fadeMs: 100,
      from: { ...blockerInput.from, a: 1 },
      to: { ...blockerInput.to, a: 0 },
    });
    const sprite = renderer.layers.blocker.children[0];
    renderer.frames.step(50);
    expect(sprite.alpha).toBe(0.25);

    // The next tween inherits the live color when the from channels are absent.
    const second = renderer.setBlocker({
      ...blockerInput,
      block: true,
      fadeMs: 200,
    });
    expect(first.endReason).toBe("reset");
    expect(sprite.alpha).toBe(0.25);
    renderer.frames.step(100);
    expect(sprite.visible).toBe(true);
    expect(sprite.alpha).toBeCloseTo(0.8125);
    expect(second.endReason).toBeUndefined();
    renderer.frames.step(100);
    expect(second.endReason).toBe("complete");
  });

  it("sets the wipe axis, persistent inverse and material constants", () => {
    Assets.cache.set(SLIDE_MASK_TEXTURE_URL, Texture.WHITE);
    const renderer = createMaskRenderer();
    const slider: BlockerInput = {
      ...blockerInput,
      fadeMs: 200,
      style: "slider",
      to: { ...blockerInput.to, a: 0.6 },
    };
    renderer.setBlocker(slider);
    const sprite = renderer.layers.blocker.children[0];
    const filter = sprite.filters[0];
    const uniforms = filter.filterUniforms.uniforms;
    expect(uniforms.uSlide).toBeCloseTo(0.601, 6);
    expect(uniforms.uEnd).toBeCloseTo(0.641, 6);
    expect(uniforms.uExtent).toBeCloseTo(0.787, 6);
    expect(filter.isVertical()).toBe(false);
    renderer.frames.step(100);
    expect(filter.alpha).toBeCloseTo(0.45);
    expect(sprite.alpha).toBe(1);

    renderer.setBlocker({ ...slider, inverse: true, style: "verticalslider" });
    expect(sprite.filters[0]).toBe(filter);
    expect(filter.isVertical()).toBe(true);
    expect(uniforms.uExtent).toBeCloseTo(1, 6);
    expect(uniforms.uFlipY).toBe(1);
    expect(uniforms.uFlipX).toBe(0);
    expect(sprite.scale.y).toBe(-720);

    renderer.setBlocker({ ...blockerInput, fadeMs: 100 });
    expect(sprite.filters).toEqual([]);
    expect(sprite.scale.y).toBe(-720);
    expect(sprite.alpha).toBeCloseTo(0.45);
    renderer.setBlocker(slider);
    expect(sprite.filters[0]).toBe(filter);
  });

  it("leaves the material and inverse unchanged during an instant color write", () => {
    const renderer = createMaskRenderer();
    renderer.setBlocker({ ...blockerInput, inverse: true, style: "slider" });
    const sprite = renderer.layers.blocker.children[0];
    expect(sprite.filters ?? []).toHaveLength(0);
    expect(sprite.scale.x).toBe(1280);

    Assets.cache.set(SLIDE_MASK_TEXTURE_URL, Texture.WHITE);
    renderer.setBlocker({ ...blockerInput, fadeMs: 100, style: "slider" });
    const filter = sprite.filters[0];
    renderer.setBlocker({
      ...blockerInput,
      to: { ...blockerInput.to, a: 0 },
    });
    renderer.frames.step(100);
    expect(sprite.filters[0]).toBe(filter);
    expect(filter.alpha).toBe(0);
  });

  it("keeps cached art when a replacement fails to load", async () => {
    const url = "https://torappu.prts.wiki/assets/avg/images/mask.png";
    Assets.cache.set(url, Texture.EMPTY);
    const warn = vi.fn();
    const renderer = createMaskRenderer(undefined, warn);
    const load = vi
      .spyOn(Assets, "load")
      .mockRejectedValueOnce(new Error("404"));
    try {
      expect(
        renderer.setBlocker({ ...blockerInput, image: "mask" }),
      ).toBeUndefined();
      const sprite = renderer.layers.blocker.children[0];
      expect(sprite.texture).toBe(Texture.EMPTY);
      const pending = renderer.setBlocker({
        ...blockerInput,
        image: "missing",
        to: { ...blockerInput.to, a: 0.5 },
      });
      expect(pending.endReason).toBeUndefined();
      await pending.assetsReady;
      expect(pending.endReason).toBe("complete");
      expect(sprite.texture).toBe(Texture.EMPTY);
      expect(sprite.alpha).toBe(0.5);
      expect(warn).toHaveBeenCalledWith("missing blocker image: missing");
    } finally {
      load.mockRestore();
      Assets.cache.remove(url);
    }
  });

  it("discards a cold texture after renderer teardown", async () => {
    const ready = Promise.withResolvers<Texture>();
    const load = vi
      .spyOn(textureAssets, "load")
      .mockReturnValueOnce(ready.promise);
    const renderer = createMaskRenderer();
    try {
      const pending = renderer.setBlocker({
        ...blockerInput,
        image: "delayed",
      });
      renderer.app = null;
      renderer.destroy();
      ready.resolve(Texture.EMPTY);
      await pending.assetsReady;
      expect(pending.endReason).toBe("reset");
      expect(renderer.layers.blocker.children).toHaveLength(0);
    } finally {
      load.mockRestore();
    }
  });
});

describe("StoryPlayer blocker and curtain playback", () => {
  it.each([
    {
      mode: "default",
      expected: [
        [0.75, undefined, 0],
        [1, 0.2, 0],
        [1, 0.2, 0],
        [1, expect.closeTo(0.65), 0],
        [1, 0.8, 1],
      ],
    },
    {
      mode: "quick_play",
      expected: Array.from({ length: 5 }, () => [1, 0.8, 1]),
    },
  ] as const)(
    "draws the next command on the completion frame in $mode",
    async ({ expected, mode }) => {
      const draws: unknown[] = [];
      const { app, destroy, runtime } = await createRenderedPlayback(
        [
          "[blocker(afrom=0,a=1,fadetime=0.1,block=true)]",
          "[curtain(direction=0,fillfrom=0.25,fillto=1,afrom=0.2,a=0.8,delay=0.05,fadetime=0.1,block=true)]",
          '[cgitem(image="marker")]',
          '[name="A"]next',
        ],
        ({ blocker, cgItems, curtains }) => {
          draws.push([
            blocker.children[0]?.alpha,
            curtains.children[0]?.alpha,
            cgItems.children.length,
          ]);
        },
      );
      runtime.setAutoPlayMode(mode);
      const started = runtime.start();
      try {
        for (const time of [50, 100, 125, 200, 250]) app.ticker.update(time);
        expect(draws).toEqual(expected);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it.each([
    { alpha: "", direction: 0, name: "zero height", visible: false },
    { alpha: "", direction: 2, name: "zero width", visible: true },
    { alpha: ",afrom=0,a=1", direction: 2, name: "zero alpha", visible: false },
  ])(
    "recycles nonblocking curtains at dispatch with $name",
    async ({ alpha, direction, visible }) => {
      const context = createContext([
        `[curtain(direction=${direction},fillfrom=0,fillto=0.5,fadetime=0.1${alpha})]`,
        '[name="A"]next',
      ]);
      const renderer = createMaskRenderer(context);
      renderer.dialogFrameTextureFailed = true;
      const runtime = new StoryRuntime(context, renderer, new FakeAudio());
      try {
        await runtime.start();
        expect(runtime.getDisplayedLineIndex()).toBe(2);
        const graphic = renderer.layers.curtains.children[0];
        expect(graphic.visible).toBe(false);
        renderer.frames.step(50);
        expect(graphic.visible).toBe(visible);
      } finally {
        runtime.destroy();
        renderer.app = null;
        renderer.destroy();
      }
    },
  );

  it("inherits alpha from a recycled slot when afrom is omitted", async () => {
    const context = createContext([
      "[curtain(direction=0,fillto=0,a=0,fadetime=0)]",
      "[curtain(direction=0,fillfrom=0.5,fillto=0.5,a=1,fadetime=0.1,block=true)]",
      '[name="A"]next',
    ]);
    const renderer = createMaskRenderer(context);
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    try {
      const graphic = renderer.layers.curtains.children[0];
      expect(graphic.alpha).toBe(0);
      expect(graphic.visible).toBe(false);

      renderer.frames.step(50);
      expect(graphic.alpha).toBeCloseTo(0.75);
      expect(graphic.visible).toBe(true);
      expect(runtime.getDisplayedLineIndex()).toBeNull();

      renderer.frames.step(50);
      expect(runtime.getDisplayedLineIndex()).toBe(3);
    } finally {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await started;
    }
  });

  it("continues mounted blocker and curtain tweens after SkipToThis", async () => {
    const context = createContext([
      "[curtain(direction=0,fillfrom=0.25,fillto=0.5,fadetime=0.1)]",
      "[blocker(afrom=0,a=1,fadetime=0.1,block=true)]",
      '[name="A"]skipped',
      "[SkipToThis]",
      '[name="B"]after',
    ]);
    const renderer = createMaskRenderer(context);
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    const { blocker, curtains } = renderer.layers;
    try {
      renderer.frames.step(25);
      expect(blocker.children[0]?.alpha).toBeCloseTo(0.4375);
      expect(runtime.getDisplayedLineIndex()).toBeNull();
      const skipped = runtime.skipNode();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      renderer.frames.step(25);
      await skipped;
      expect(runtime.getDisplayedLineIndex()).toBe(5);
      expect(blocker.children[0]?.alpha).toBeCloseTo(0.75);
      expect(curtains.children[0]?.getLocalBounds().height).toBeCloseTo(295);

      renderer.frames.step(50);
      expect(blocker.children[0]?.alpha).toBe(1);
      expect(curtains.children[0]?.getLocalBounds().height).toBeCloseTo(340);
    } finally {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await started;
    }
  });

  it("skips a pending blocker load and rejects the old texture when it arrives", async () => {
    const context = createContext([
      '[blocker(image="cold",fadetime=1)]',
      '[name="A"]skipped',
      "[SkipToThis]",
      "[blocker(a=0.5,fadetime=0)]",
      '[name="B"]after',
    ]);
    const ready = Promise.withResolvers<Texture>();
    const load = vi
      .spyOn(textureAssets, "load")
      .mockReturnValueOnce(ready.promise);
    const renderer = createMaskRenderer(context);
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    try {
      expect(runtime.getDisplayedLineIndex()).toBeNull();
      expect(renderer.layers.blocker.children).toHaveLength(0);
      const skipped = runtime.skipNode();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      renderer.frames.step(16);
      await skipped;
      expect(runtime.getDisplayedLineIndex()).toBe(5);

      ready.resolve(Texture.EMPTY);
      await renderer.frames.advance(16);
      const sprite = renderer.layers.blocker.children[0];
      expect(sprite.texture).toBe(Texture.WHITE);
      expect(sprite.alpha).toBe(0.5);
    } finally {
      load.mockRestore();
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await started;
    }
  });

  it("keeps waiting for cold blocker art after the previous tween completes", async () => {
    const context = createContext([
      "[blocker(afrom=0,a=1,fadetime=0.1)]",
      '[blocker(image="cold",a=0.5,fadetime=0.1,block=true)]',
      '[name="A"]after',
    ]);
    const ready = Promise.withResolvers<Texture>();
    const load = vi
      .spyOn(textureAssets, "load")
      .mockReturnValueOnce(ready.promise);
    const renderer = createMaskRenderer(context);
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const started = runtime.start();
    try {
      renderer.frames.step(100);
      const sprite = renderer.layers.blocker.children[0];
      expect(sprite.alpha).toBe(1);
      expect(runtime.getDisplayedLineIndex()).toBeNull();

      ready.resolve(Texture.EMPTY);
      await renderer.frames.advance(0);
      expect(sprite.texture).toBe(Texture.EMPTY);
      expect(runtime.getDisplayedLineIndex()).toBeNull();
      renderer.frames.step(100);
      expect(sprite.alpha).toBe(0.5);
      expect(runtime.getDisplayedLineIndex()).toBe(3);
    } finally {
      load.mockRestore();
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
      await started;
    }
  });

  it.each([
    { direction: 0, height: 454.5 },
    { direction: 4, height: 252 },
  ])(
    "lets a skipped curtain sequence release the next wait for direction $direction",
    async ({ direction, height }) => {
      const context = createContext([
        "[curtain(direction=0,fillfrom=0,fillto=0.5,fadetime=0.1,block=true)]",
        '[name="A"]skipped',
        "[SkipToThis]",
        `[curtain(direction=${direction},fillfrom=0,fillto=0.8,fadetime=0.2,block=true)]`,
        '[name="B"]after',
      ]);
      const renderer = createMaskRenderer(context);
      renderer.dialogFrameTextureFailed = true;
      const runtime = new StoryRuntime(context, renderer, new FakeAudio());
      const started = runtime.start();
      let skipped: Promise<void> | undefined;
      try {
        renderer.frames.step(25);
        skipped = runtime.skipNode();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        renderer.frames.step(25);
        expect(runtime.getDisplayedLineIndex()).toBeNull();

        // The earlier blocking sequence uses the same FinishCommand slot.
        renderer.frames.step(50);
        expect(runtime.getDisplayedLineIndex()).toBe(5);
        const next = renderer.curtainView.curtains.get(direction);
        // On the same side the new track starts from the old sequence's final size.
        expect(next.sizeDelta.y).toBeCloseTo(height);
        renderer.frames.step(150);
        expect(next.sizeDelta.y).toBe(576);
      } finally {
        runtime.destroy();
        renderer.app = null;
        renderer.destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it("resets both views when the story ends with animations still in progress", async () => {
    const context = createContext([
      "[blocker(a=1,fadetime=1)]",
      "[curtain(direction=0,fillfrom=0.25,fillto=0.5,delay=0.5,fadetime=1)]",
      '[name="A"]end',
      '[skipnode(mode="skip")]',
    ]);
    const renderer = createMaskRenderer(context);
    renderer.dialogFrameTextureFailed = true;
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    await runtime.start();
    try {
      const { blocker, curtains } = renderer.layers;
      renderer.frames.step(100);
      const sprite = blocker.children[0];
      const graphic = curtains.children[0];
      await runtime.skipNode();
      expect(runtime.getState()).toBe("finished");
      expect(sprite.destroyed).toBe(true);
      expect(graphic.destroyed).toBe(true);
      renderer.frames.elapse(2000);
      expect(blocker.children).toHaveLength(0);
      expect(curtains.children).toHaveLength(0);
    } finally {
      runtime.destroy();
      renderer.app = null;
      renderer.destroy();
    }
  });
});
