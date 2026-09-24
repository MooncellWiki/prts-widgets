import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("maps imagerotate strict parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[imagerotate(angle=-5,fadetime=0.1,block=true)]",
        '[imagerotate(angle=0,fadetime=10,isblock=false,image="70_i11")]',
        "[imagerotate]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.imageRotateCalls).toEqual([
      {
        angleDeg: -5,
        block: true,
        circles: 0,
        durationMs: 100,
        inverse: false,
      },
      {
        angleDeg: 0,
        block: false,
        circles: 0,
        durationMs: 10_000,
        inverse: false,
      },
      {
        angleDeg: 0,
        block: false,
        circles: 0,
        durationMs: 0,
        inverse: false,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps background with strict transform keys and native width/height multipliers", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[background(image="beach_1",x=24,y=-36,xScale=1.7,height=1.4)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // `height`/`width` are the `_LoadImage` sizeDelta multipliers
    // (GetOrDefault<float>(..., 1.0)); omitted width falls back to 1.
    expect(renderer.backgroundCalls).toEqual([
      {
        input: {
          scaleX: 1.7,
          scaleY: 1,
          block: false,
          fadeMs: 0,
          height: 1.4,
          screenAdapt: undefined,
          tiled: false,
          width: 1,
          x: 24,
          y: -36,
        },
        key: "beach_1",
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps image width/height multipliers and tiled with lowercase keys", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[Image(image="avg_5_boom", width=1, height=1,screenadapt="coverall")]',
        '[image(image="bg_0_am", tiled=true, fadetime=0, block=false)]',
        '[image(image="side_i01",width=1.5,Height=2,xScale=1.2)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // `width`/`height` are lowercase in _LoadImage (unlike xScale/yScale);
    // a CamelCase `Height` must not leak into the multiplier.
    expect(renderer.imageCalls).toEqual([
      {
        input: {
          block: false,
          fadeMs: 0,
          height: 1,
          scaleX: 1,
          scaleY: 1,
          screenAdapt: "coverall",
          tiled: false,
          width: 1,
          x: 0,
          y: 0,
        },
        key: "avg_5_boom",
      },
      {
        input: {
          block: false,
          fadeMs: 0,
          height: 1,
          scaleX: 1,
          scaleY: 1,
          screenAdapt: undefined,
          tiled: true,
          width: 1,
          x: 0,
          y: 0,
        },
        key: "bg_0_am",
      },
      {
        input: {
          block: false,
          fadeMs: 0,
          height: 1,
          scaleX: 1.2,
          scaleY: 1,
          screenAdapt: undefined,
          tiled: false,
          width: 1.5,
          x: 0,
          y: 0,
        },
        key: "side_i01",
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps backgroundtween with strict CamelCase keys", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[background(image="beach_1",x=24,y=-36,xScale=1.7,height=1.4)]',
        "[backgroundtween(xFrom=0,xTo=-720,duration=25,block=false)]",
        "[backgroundtween(duration=0.5,xScaleFrom=0.75,xScaleTo=0.8,yScaleFrom=0.75,yScaleTo=0.8)]",
        "[backgroundtween(y=360)]",
        "[backgroundtween(y=180,block=false)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.backgroundTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        ease: "Linear",
        loop: false,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 500,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: 0.75,
        xScaleTo: 0.8,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: 0.75,
        yScaleTo: 0.8,
        yTo: undefined,
      },
      // `duration` defaults to 0.0, and <= 0 completes both tweens instantly.
      {
        block: false,
        durationMs: 0,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 0,
        ease: "Linear",
        loop: false,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps imagetween ease/loop with native defaults", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        "[ImageTween(xFrom=0,xTo=-720,duration=25,block=false)]",
        '[ImageTween(xScaleFrom=1,xScaleTo=1.1,duration=15,ease="OutQuad")]',
        '[ImageTween(xScaleTo=1.2,duration=45,ease="6",block=true,loop=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // `ease` is read via GetEnum<Ease> and defaults to Linear; integer
    // literals pass through for the renderer's DOTween ordinal table. `loop`
    // maps to SetLoops(-1); loop+block mirrors native's LogError word for
    // word, typos included, and drops block so playback continues.
    expect(renderer.imageTweenCalls).toEqual([
      {
        block: false,
        durationMs: 25_000,
        ease: "Linear",
        loop: false,
        xFrom: 0,
        xScaleFrom: undefined,
        xScaleTo: undefined,
        xTo: -720,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 15_000,
        ease: "OutQuad",
        loop: false,
        xFrom: undefined,
        xScaleFrom: 1,
        xScaleTo: 1.1,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
      {
        block: false,
        durationMs: 45_000,
        ease: "6",
        loop: true,
        xFrom: undefined,
        xScaleFrom: undefined,
        xScaleTo: 1.2,
        xTo: undefined,
        yFrom: undefined,
        yScaleFrom: undefined,
        yScaleTo: undefined,
        yTo: undefined,
      },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        detail:
          "Loop and block both true when tween background! Will cause intinity lop!",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("maps backgroundtween ease and loop and warns on loop with block", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[background(image="beach_1")]',
        '[backgroundtween(xFrom=0,xTo=130,duration=1.5,ease="OutFlash",loop=true,block=false)]',
        '[backgroundtween(xFrom=-30,xTo=30,duration=3,ease="1",block=false)]',
        '[backgroundtween(xFrom=0,xTo=50,duration=2,ease="bogus",loop=true,block=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.backgroundTweenCalls).toEqual([
      expect.objectContaining({
        durationMs: 1500,
        ease: "OutFlash",
        loop: true,
      }),
      // `ease="1"` passes through as an ordinal string for the renderer to
      // resolve (Ease.Linear).
      expect.objectContaining({ durationMs: 3000, ease: "1", loop: false }),
      // Unparseable ease names keep the GetEnum Linear default.
      // loop+block still warns, but block is dropped so the never-ending
      // loop cannot stall playback.
      expect.objectContaining({
        block: false,
        durationMs: 2000,
        ease: "bogus",
        loop: true,
      }),
    ]);
    // `_ExecuteImageTween` logs this (sic) error when effectiveBlock and loop
    // are both true, because SetLoops(-1) never reaches
    // OnComplete(FinishCommand). The typo "intinity lop" is native.
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "backgroundtween",
        detail:
          "Loop and block both true when tween background! Will cause intinity lop!",
        type: "invalid_parameter",
      }),
    ]);
  });
});
