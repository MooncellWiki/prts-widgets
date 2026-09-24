import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import { createManualClock, createRenderer } from "../helpers/rendererFixtures";

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

describe("PixiStoryRenderer", () => {
  it("eases the cameraeffect grayscale tween with DOTween's default OutQuad", () => {
    const manual = createManualClock();
    const renderer = createRenderer();
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0);

    expect(renderer.grayscaleAmount).toBe(0);
    manual.advance(500);
    manual.drainFrame();
    // Native AVGCameraEffect never calls SetEase, so DOTween.To runs with
    // DOTween 1.2.760's defaultEaseType=6 (OutQuad): halfway = 0.75, not the
    // linear 0.5.
    expect(renderer.grayscaleAmount).toBeCloseTo(0.75);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBe(1);
  });

  it("starts the grayscale tween from the current amount for any negative initamount", async () => {
    const manual = createManualClock();
    const renderer = createRenderer();
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    await renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    expect(renderer.grayscaleAmount).toBe(0.6);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, -1);

    // Native _TweenGrayscaleAmount checks MathUtil.LT(initAmount, 0): any
    // negative initamount means "start from the current grayscale amount",
    // not an explicit negative start.
    expect(renderer.grayscaleAmount).toBe(0.6);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBeCloseTo(0.9);
  });

  it("starts the grayscale tween from an explicit non-negative initamount", async () => {
    const manual = createManualClock();
    const renderer = createRenderer();
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    await renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    expect(renderer.grayscaleAmount).toBe(0.6);

    // MathUtil.LT(0.2, 0) is false, so native takes the argument as the tween
    // start and discards the 0.6 the effect manager currently holds.
    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0.2);

    expect(renderer.grayscaleAmount).toBe(0.2);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBeCloseTo(0.8);
  });

  it("applies grayscale as Rec.601 luma desaturation, not an additive tint", async () => {
    const renderer = createRenderer();

    await renderer.setCameraEffect("Grayscale", 1, 0, false, true);

    // Native AVGSceneGrayScale blits with mat_grayscale and writes
    // _Params = (0.299, 0.587, 0.114, amount): Rec.601 luma desaturation
    // where a mid-gray pixel stays mid-gray. pixi's
    // ColorMatrixFilter.grayscale() builds an additive [s,s,s] matrix that
    // clips mid-grays to white around amount 1, so the matrix is composed
    // manually.
    const matrix = renderer.sceneLayer.filters[0].matrix as number[];
    expect(matrix.slice(0, 5)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(5, 10)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(10, 15)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(15, 20)).toEqual([0, 0, 0, 1, 0]);
  });

  it("composes Colorinverse over grayscale like the native _Inverse lerp", async () => {
    const renderer = createRenderer();

    await renderer.setCameraEffect("Colorinverse", 1, 0, false, true);

    // Native _Inverse lerps each channel toward 1-color in the same blit:
    // rows scale by -1 with offset 1. (normalizeZero turns the -0 produced
    // by 0 * -1 into +0, which toEqual distinguishes.)
    const inverseMatrix = renderer.sceneLayer.filters[0].matrix as number[];
    expect(normalizeZero(inverseMatrix.slice(0, 5))).toEqual([-1, 0, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(5, 10))).toEqual([0, -1, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(10, 15))).toEqual([
      0, 0, -1, 0, 1,
    ]);

    // With grayscale=1 kept from a previous command, desaturation and
    // inversion compose into one matrix.
    await renderer.setCameraEffect("Grayscale", 1, 0, false, true);
    const bothMatrix = renderer.sceneLayer.filters[0].matrix as number[];
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
    expect(world.getChildIndex(sprite)).toBe(2);
    expect(world.getChildIndex(renderer.layers.curtains)).toBe(3);
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
