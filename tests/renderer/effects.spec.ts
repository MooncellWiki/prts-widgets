import { Application, Container, Texture, TickerPlugin } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import { createManualClock, createRenderer } from "../helpers/rendererFixtures";
import { createContext, FakeAudio } from "../helpers/runtimeFakes";

import type { CgItemInput } from "../../src/widgets/StoryPlayer/engine/types";

// Turns the -0 that `0 * -1` produces into +0 so `toEqual` stops
// distinguishing them. Deliberately narrow: `v || 0` would also swallow NaN
// and let a broken matrix pass.
function normalizeZero(values: number[]): number[] {
  return values.map((v) => (v === 0 ? 0 : v));
}

function createBlockerRenderer(): any {
  const renderer = createRenderer();
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
  fill: number,
  grad: boolean,
) {
  const draws: unknown[] = [];
  const state = {
    alpha: 1,
    direction,
    fill,
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
  };
  return { draws, state };
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

    expect(renderer.grayscaleAmount).toBe(0);
    renderer.frames.step(500);
    // Native AVGCameraEffect never calls SetEase, so DOTween.To runs with
    // DOTween 1.2.760's defaultEaseType=6 (OutQuad): halfway = 0.75, not the
    // linear 0.5.
    expect(renderer.grayscaleAmount).toBeCloseTo(0.75);
    renderer.frames.step(500);
    expect(renderer.grayscaleAmount).toBe(1);
  });

  it("starts the grayscale tween from the current amount for a negative initamount", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    renderer.frames.step();
    expect(renderer.grayscaleAmount).toBe(0.6);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, -1);

    // Native _TweenGrayscaleAmount checks MathUtil.LT(initAmount, 0): any
    // negative initamount means "start from the current grayscale amount",
    // not an explicit negative start.
    expect(renderer.grayscaleAmount).toBe(0.6);
    renderer.frames.step(500);
    expect(renderer.grayscaleAmount).toBeCloseTo(0.9);
  });

  it("writes an explicit grayscale initamount on the first update", () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.frames.manual = true;

    renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    renderer.frames.step();
    expect(renderer.grayscaleAmount).toBe(0.6);

    // MathUtil.LT(0.2, 0) is false, so native takes the argument as the tween
    // start and discards the 0.6 the effect manager currently holds.
    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0.2);

    expect(renderer.grayscaleAmount).toBe(0.6);
    renderer.frames.step(0);
    expect(renderer.grayscaleAmount).toBe(0.2);
    renderer.frames.step(500);
    expect(renderer.grayscaleAmount).toBeCloseTo(0.8);
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
    ['[cameraeffect(effect="Grayscale",fadetime=0.032,block=true)]', [null, 3]],
    ['[cameraeffect(effect="Grayscale",fadetime=0,block=true)]', [3, 3]],
    ["[camerashake(duration=0.032,block=true)]", [null, 3]],
  ])(
    "draws the next line in the frame %s completes",
    async (command, draws) => {
      const context = createContext([
        '[cameraeffect(effect="Colorinverse",keep=true,block=true)]',
        command,
        '[name="A"]after',
      ]);
      const renderer = createRenderer(context);
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
        expect(renderer.inverseAmount).toBe(1);
        expect(runtime.getDisplayedLineIndex()).toBeNull();
        app.ticker.update(16);
        app.ticker.update(32);
        expect(drawnLines).toEqual(draws);
        expect(renderer.grayscaleAmount).toBe(0);
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
      expect(renderer.grayscaleAmount).toBe(1);

      position.set(8, 4);
      skipped = runtime.skipNode();
      expect([position.x, position.y]).toEqual([0, 0]);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      renderer.frames.step(16);
      expect(runtime.getDisplayedLineIndex()).toBe(6);
      expect([position.x, position.y]).toEqual([0, 0]);
      expect(renderer.grayscaleAmount).toBe(1);
      expect(renderer.inverseAmount).toBe(1);
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
      expect(renderer.grayscaleAmount).toBeGreaterThan(0);
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

  it("draws a curtain as a solid body plus a fixed-width feather strip", async () => {
    const renderer = createRenderer();
    renderer.app = {};

    const fills: unknown[] = [];
    const state = {
      alpha: 1,
      fill: 0.5,
      grad: true,
      graphic: {
        alpha: 1,
        clear: () => {},
        poly() {
          return this;
        },
        fill(style: unknown) {
          fills.push(style);
          return this;
        },
        visible: false,
      },
    };

    // direction 6 maps to a rightward sweep, so the inner edge is a vertical
    // line at x = 640 and the feather occupies x = 620..640.
    renderer.updateCurtainState(state, { x: 1, y: 0 });

    expect(state.graphic.visible).toBe(true);
    // Body is opaque black; only the strip carries the gradient.
    expect(fills[0]).toBe(0x00_00_00);
    expect(fills).toHaveLength(2);
    const gradient = fills[1] as any;
    expect(gradient.start).toEqual({ x: 620, y: 0 });
    expect(gradient.end).toEqual({ x: 640, y: 0 });
  });

  it("draws corner curtains as 45° wipes hinged past the stage corner", () => {
    const renderer = createRenderer();
    renderer.app = {};
    const { draws, state } = createCurtainGraphicState(1, 0.07, false);
    const vector = renderer.resolveCurtainVector(1);

    // direction 1 is a 1600x1600 rect rotated -45° around a pivot at
    // (1204.69, -240.69), 116.9px past the top-right corner along the
    // inward normal: fill 0.07 (112px) never reaches the stage.
    renderer.updateCurtainState(state, vector);
    expect(state.graphic.visible).toBe(false);
    expect(draws).toEqual([]);

    // fill 0.5 puts the inner edge 800 - 116.9px into the stage: the 45°
    // line y = x - 314.0, not the stage diagonal.
    state.fill = 0.5;
    renderer.updateCurtainState(state, vector);
    expect(state.graphic.visible).toBe(true);
    expect(draws).toHaveLength(2);
    expect(toPointSet(draws[0] as number[])).toEqual(
      toPointSet([314.01, 0, 1280, 0, 1280, 720, 1034.01, 720]),
    );
    expect(draws[1]).toBe(0x00_00_00);

    // From fill ~0.957 the rect clears the opposite corner.
    draws.length = 0;
    state.fill = 0.96;
    renderer.updateCurtainState(state, vector);
    expect(toPointSet(draws[0] as number[])).toEqual(
      toPointSet([0, 0, 1280, 0, 1280, 720, 0, 720]),
    );
  });

  it("feathers corner curtains along the rotated inner edge", () => {
    const renderer = createRenderer();
    renderer.app = {};
    const { draws, state } = createCurtainGraphicState(3, 0.5, true);
    const vector = renderer.resolveCurtainVector(3);

    renderer.updateCurtainState(state, vector);

    // direction 3 hinges at (1201.49, 938.18), 98.8px past the bottom-right
    // corner; the inner edge sits at hinge . vector + 800. The 20px gradient
    // is a layout child inside the rect, so the body stops 20px short of the
    // edge and the feather runs along the 45° normal.
    const edge = 1201.49 * vector.x + 938.18 * vector.y + 800;
    expect(state.graphic.visible).toBe(true);
    expect(draws).toHaveLength(4);
    expect(draws[1]).toBe(0x00_00_00);
    const gradient = draws[3] as any;
    expect(gradient.start.x).toBeCloseTo(vector.x * (edge - 20));
    expect(gradient.start.y).toBeCloseTo(vector.y * (edge - 20));
    expect(gradient.end.x).toBeCloseTo(vector.x * edge);
    expect(gradient.end.y).toBeCloseTo(vector.y * edge);

    // Without `grad` the corner layout has no padding: the body reaches the
    // inner edge itself.
    draws.length = 0;
    state.grad = false;
    renderer.updateCurtainState(state, vector);
    expect(draws).toHaveLength(2);
    const projections = (draws[0] as number[]).flatMap((value, index, all) =>
      index % 2 === 0 ? [value * vector.x + all[index + 1]! * vector.y] : [],
    );
    expect(Math.max(...projections)).toBeCloseTo(edge);
  });

  it("leaves the straight-edge layout padding empty without grad", () => {
    const renderer = createRenderer();
    renderer.app = {};
    const { draws, state } = createCurtainGraphicState(0, 0.25, false);

    // Straight-edge AVGCurtains pad their layout group by 20px on the inner
    // edge whether or not the gradient is active: a fill=0.25 top curtain is
    // a 180px rect but only 160px of black.
    renderer.updateCurtainState(state, { x: 0, y: 1 });
    expect(draws).toEqual([[0, 160, 0, 0, 1280, 0, 1280, 160], 0x00_00_00]);

    // Under 20px nothing but the (inactive) gradient slot is left.
    draws.length = 0;
    state.fill = 0.02;
    renderer.updateCurtainState(state, { x: 0, y: 1 });
    expect(state.graphic.visible).toBe(false);
    expect(draws).toEqual([]);
  });

  it("snaps curtain alpha to 1 when `a` is absent, ignoring leftover alpha", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.tween = vi.fn(async () => {});

    // A previous command left the side at alpha 0.3.
    await renderer.setCurtain({
      alphaTo: 0.3,
      block: false,
      delayMs: 0,
      direction: 4,
      fadeMs: 0,
      fillFrom: 0.5,
      fillTo: 0.5,
      grad: false,
    });
    expect(renderer.curtains.get(4).alpha).toBe(0.3);

    // With `a` present but no `afrom`, the tween starts from the alpha
    // captured *before* the unconditional SetCurtainAlpha(1.0) snap.
    await renderer.setCurtain({
      alphaTo: 0.8,
      block: false,
      delayMs: 0,
      direction: 4,
      fadeMs: 150,
      fillFrom: 0.5,
      fillTo: 0.6,
      grad: false,
    });
    expect(renderer.curtains.get(4).alpha).toBe(0.3);

    // Without `a` native snaps to 1.0 before branching, so a bare `afrom`
    // is never applied and the leftover 0.3 does not survive.
    await renderer.setCurtain({
      alphaFrom: 0.2,
      block: false,
      delayMs: 0,
      direction: 4,
      fadeMs: 0,
      fillFrom: 0.5,
      fillTo: 0.5,
      grad: false,
    });
    expect(renderer.curtains.get(4).alpha).toBe(1);
  });

  it("keeps the grad feather while clearCurtains retracts the sides", async () => {
    const renderer = createRenderer();
    renderer.app = {};
    renderer.tween = vi.fn(async () => {});
    // FillGradient needs a real canvas context; this test is about the input
    // clearCurtains forwards, not the drawing.
    renderer.updateCurtainState = vi.fn();
    const spy = vi.spyOn(renderer, "setCurtain");

    await renderer.setCurtain({
      block: false,
      delayMs: 0,
      direction: 0,
      fadeMs: 0,
      fillFrom: 1,
      fillTo: 0.2,
      grad: true,
    });
    await renderer.clearCurtains(100, false);

    // Native HideCurtain only tweens sizeDelta toward zero; it never touches
    // alpha or the `_gradientImg` active state.
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        alphaFrom: 1,
        alphaTo: 1,
        direction: 0,
        fillTo: 0,
        grad: true,
      }),
    );
  });

  it("eases the curtain wipe with DOTween's default OutQuad", async () => {
    const manual = createManualClock();
    const renderer = createRenderer();
    renderer.app = {};
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);
    // FillGradient needs a real canvas context; this test is about the tween
    // curve, not the drawing.
    renderer.updateCurtainState = vi.fn();

    await renderer.setCurtain({
      block: false,
      delayMs: 0,
      direction: 6,
      fadeMs: 1000,
      fillFrom: 0,
      fillTo: 1,
      grad: false,
    });
    const state = renderer.curtains.get(6);
    expect(state.fill).toBe(0);

    manual.advance(500);
    manual.drainFrame();
    // Native SetCurtainSizeTween/SetCurtainAlphaTween never call SetEase, so
    // both the DOSizeDelta wipe and any DOFade run on DOTween's
    // defaultEaseType=6 (OutQuad): halfway = 0.75, not the linear 0.5.
    expect(state.fill).toBeCloseTo(0.75);

    manual.advance(500);
    manual.drainFrame();
    expect(state.fill).toBe(1);
  });
});

describe("PixiStoryRenderer blocker", () => {
  interface CapturedTween {
    complete: () => void;
    step: (progress: number) => void;
  }

  function captureTweens(renderer: any): CapturedTween[] {
    const tweens: CapturedTween[] = [];
    renderer.tween = vi.fn(
      (
        _durationMs: number,
        step: (progress: number) => void,
        complete?: () => void,
      ) => {
        tweens.push({ complete: complete ?? (() => {}), step });
        return new Promise<void>(() => {});
      },
    );
    return tweens;
  }

  it("renders the blocker below the curtains container", async () => {
    const renderer = createBlockerRenderer();

    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: { a: Number.NaN, b: Number.NaN, g: Number.NaN, r: Number.NaN },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });

    const world = renderer.layers.world as Container;
    const sprite = renderer.blockerSprite;
    // Native panel_blocker (sibling 1) renders below panel_curtains
    // (sibling 3): curtains cover the blocker when both are up. The web world
    // (scene, cgItems, curtains) takes the blocker right below the curtains.
    expect(sprite.parent).toBe(world);
    expect(world.getChildIndex(sprite)).toBeLessThan(
      world.getChildIndex(renderer.layers.curtains),
    );
  });

  it("saturates 0-255 endpoints at the tint write instead of rescaling mid-fade", async () => {
    const renderer = createBlockerRenderer();
    const tweens = captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 300,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 255, g: 255, r: 255 },
    });

    const sprite = renderer.blockerSprite;
    // Halfway the raw channels are 127.5; the GPU-side clamp saturates them,
    // it does not divide by 255 (which would render mid-gray ~128).
    tweens[0]!.step(0.5);
    expect(sprite.tint).toBe(0xff_ff_ff);
    expect(renderer.readBlockerColor()).toEqual({
      a: 0.5,
      b: 127.5,
      g: 127.5,
      r: 127.5,
    });

    // Below 1/255 the channel still ramps briefly before saturating.
    tweens[0]!.step(0.001);
    expect((sprite.tint >> 16) & 0xff).toBe(65);
  });

  it("drops stale tween callbacks once a new blocker command takes over", async () => {
    const renderer = createBlockerRenderer();
    const tweens = captureTweens(renderer);

    // First command fades out to a=0; its completion would reset the texture
    // and hide the sprite.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    // Second command (DOKill equivalent) takes over while the first tween
    // would still be mid-flight.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0.5, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    expect(sprite.visible).toBe(true);

    tweens[0]!.step(1);
    expect(renderer.readBlockerColor().a).toBe(1);
    tweens[0]!.complete();
    expect(sprite.visible).toBe(true);

    // The active tween keeps writing.
    tweens[1]!.step(0.5);
    expect(renderer.readBlockerColor().a).toBe(0.75);
  });

  it("mounts the slide mask wipe for slider style with the native material constants", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    const tweens = captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    const filter = renderer.blockerSlideFilter;
    expect(sprite.filters).toEqual([filter]);
    // Torappu/UI/AVG/SlideMask material floats: _Slide/_End/_Width.
    const uniforms = filter.filterUniforms.uniforms;
    expect(uniforms.uSlide).toBeCloseTo(0.601, 6);
    expect(uniforms.uEnd).toBeCloseTo(0.641, 6);
    expect(uniforms.uExtent).toBeCloseTo(0.787, 6);
    expect(uniforms.uVertical).toBe(0);

    // The tweened raw alpha drives the shader reveal progress; the sprite
    // itself stays opaque so the filter input rgb is the untinted tint.
    tweens[0]!.step(0.5);
    expect(filter.alpha).toBe(0.5);
    expect(renderer.readBlockerColor().a).toBe(0.5);
    expect(sprite.alpha).toBe(1);
  });

  it("switches the wipe axis and extent for verticalslider and mirrors it with inverse", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: true,
      style: "verticalslider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    const filter = renderer.blockerSlideFilter;
    // ENABLE_VERTICAL uses _Height = 1.0 and samples uv.y.
    expect(filter.isVertical()).toBe(true);
    expect(filter.filterUniforms.uniforms.uExtent).toBeCloseTo(1, 6);
    // localScale.y = -1 mirrors the mask coordinate, and the flip keeps the
    // full-screen coverage (mirrored around the centered anchor): the 1x1
    // white quad stretched to 720 carries the sign as scale.y = -720.
    expect(filter.filterUniforms.uniforms.uFlipY).toBe(1);
    expect(filter.filterUniforms.uniforms.uFlipX).toBe(0);
    expect(sprite.scale.y).toBe(-720);
    expect(Math.abs(sprite.height)).toBe(720);

    // inverse = false never resets the sign (only destroy does), and the
    // next default-style animated command runs _CleanMaterial.
    await renderer.setBlocker({
      block: false,
      fadeMs: 500,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();
    expect(sprite.filters).toEqual([]);
    expect(sprite.scale.y).toBe(-720);
    expect(sprite.alpha).toBe(1);
  });

  it("hands alpha back to the sprite when the slide wipe is unmounted", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    const tweens = captureTweens(renderer);

    // A non-blocking slider settles mid-alpha (act53side_07_beg:474 and
    // act47side_05_end:44 are the two block=false sliders in the corpus).
    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0.5, b: 0, g: 0, r: 0 },
    });
    tweens[0]!.step(1);

    // _CleanMaterial takes the wipe away; the blocker must drop straight back
    // to the 0.5 veil rather than sitting fully opaque until the next frame's
    // tween step lands.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: Number.NaN, b: Number.NaN, g: Number.NaN, r: Number.NaN },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    expect(sprite.filters).toEqual([]);
    expect(sprite.alpha).toBe(0.5);
  });

  it("reuses the slide filter instance across unmount and remount", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);

    const slider = {
      block: false,
      fadeMs: 1000,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider" as const,
      to: { a: 1, b: 0, g: 0, r: 0 },
    };
    await renderer.setBlocker(slider);
    const filter = renderer.blockerSlideFilter;

    await renderer.setBlocker({
      ...slider,
      style: "default" as const,
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();

    // `_SetMaterial` re-fetches the same cached slide_mask Material; the web
    // port must not rebuild the shader/UniformGroup per mount either.
    await renderer.setBlocker(slider);
    expect(renderer.blockerSlideFilter).toBe(filter);
  });

  it("keeps the material untouched on the zero-duration slider branch", async () => {
    const renderer = createBlockerRenderer();

    // A zero-duration slider command runs before _GenTweenerWithParam, so no
    // material is mounted (and none persisted yet).
    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: true,
      style: "slider",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();

    // After an animated slider mounts the wipe, a zero-duration command
    // (slider or default) leaves the material in place.
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    const filter = renderer.blockerSlideFilter;
    expect(renderer.blockerSprite.filters).toEqual([filter]);

    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBe(filter);
    // The instant color write still routes through the attached filter.
    expect(filter.alpha).toBe(0);
  });
});
