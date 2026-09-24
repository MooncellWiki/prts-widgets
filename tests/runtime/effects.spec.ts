import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("maps camerashake to native defaults and parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[camerashake(xstrength=12,ystrength=8)]",
        "[camerashake(duration=0.5,randomness=40,vibrato=18,block=false,stop=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.shakeCalls).toEqual([
      {
        block: false,
        durationMs: 10_000,
        fadeOut: false,
        infinite: true,
        randomness: 90,
        stop: false,
        vibrato: 10,
        xStrength: 12,
        yStrength: 8,
      },
      {
        block: false,
        durationMs: 500,
        fadeOut: false,
        infinite: false,
        randomness: 40,
        stop: true,
        vibrato: 18,
        xStrength: 1,
        yStrength: 0,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps blocker RGBA endpoints, styles, and native zero-duration blocking", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[blocker(a=1,r=255,g=128,b=0,afrom=0,rfrom=0,gfrom=0,bfrom=0,style=slider,inverse=true,fadetime=0,block=true,image="mask")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.blockerCalls).toEqual([
      {
        block: false,
        fadeMs: 0,
        from: { a: 0, b: 0, g: 0, r: 0 },
        image: "mask",
        inverse: true,
        style: "slider",
        to: { a: 1, b: 0, g: 128, r: 255 },
      },
    ]);
  });

  it.each([
    {
      name: "keeps block",
      animateRatio: 0.5,
      expected: [
        [300, true],
        [1000, true],
      ],
    },
    {
      // quick_play speed family has animateRatio = 0; the constructor option
      // applies the same ratio to the default speed.
      name: "drops block at zero duration",
      animateRatio: 0,
      expected: [
        [0, false],
        [0, false],
      ],
    },
  ])(
    "scales blocker fadetime by animateRatio $animateRatio like native CalculateFadetime and $name",
    async ({ animateRatio, expected }) => {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          "[Blocker(a=1, r=0,g=0, b=0, fadetime=0.6, block=true)]",
          '[Blocker(a=0, r=0,g=0, b=0, fadetime=2, style="verticalslider", block=true)]',
          '[name="A"]ok',
        ]),
        renderer,
        new FakeAudio(),
        { animateRatio },
      );

      await runtime.start();

      expect(
        renderer.blockerCalls.map((call) => [call.fadeMs, call.block]),
      ).toEqual(expected);
    },
  );

  it("keeps cameraeffect values case-sensitive and degrades Chaos structurally", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        "[cameraeffect(effect=Grayscale,initamount=0.2,amount=0.8,fadetime=0.5,block=true,keep=true)]",
        "[cameraeffect(effect=Colorinverse,keep=true,block=true)]",
        "[cameraeffect(effect=Chaos,keep=true)]",
        "[cameraeffect(effect=grayscale,amount=1)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.cameraEffectCalls).toEqual([
      {
        amount: 0.8,
        block: true,
        durationMs: 500,
        effect: "Grayscale",
        initialAmount: 0.2,
        keep: true,
      },
      {
        amount: 1,
        block: false,
        durationMs: 0,
        effect: "Colorinverse",
        initialAmount: undefined,
        keep: true,
      },
    ]);
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "cameraeffect:Chaos",
        type: "unsupported_visual",
      }),
    ]);
  });

  it("scales cameraeffect fade time by the current-speed animateRatio", async () => {
    // Native 0x183E327C1: fadetime = raw * AVGController.animateRatio. The
    // default speed keeps ratio 1, so only ratio-bearing speeds change it.
    const scaledRenderer = new FakeRenderer();
    const scaled = new StoryRuntime(
      createContext([
        "[cameraeffect(effect=Grayscale,amount=1,fadetime=2,block=true)]",
        '[name="A"]ok',
      ]),
      scaledRenderer,
      new FakeAudio(),
      { animateRatio: 0.5 },
    );

    await scaled.start();

    expect(scaledRenderer.cameraEffectCalls.at(-1)?.durationMs).toBe(1000);

    const quickRenderer = new FakeRenderer();
    const quick = new StoryRuntime(
      createContext([
        "[cameraeffect(effect=Grayscale,amount=1,fadetime=2,block=true)]",
        '[name="A"]ok',
      ]),
      quickRenderer,
      new FakeAudio(),
    );

    quick.setAutoPlayMode("quick_play");
    await quick.start();

    expect(quickRenderer.cameraEffectCalls.at(-1)?.durationMs).toBe(0);
  });

  it("maps focusout duration, from and native blocking semantics without reading fadetime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[focusout(duration=1.5,type="bg",from=0.25,to=1,block=true)]',
        '[focusout(type="cgitem",id="cgitem_61_i02",from=-1,to=0.5,block=true,fadetime=9)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.focusOutCalls).toEqual([
      { block: true, durationMs: 1500, from: 0.25, id: "", to: 1, type: "bg" },
      {
        block: false,
        durationMs: 0,
        from: undefined,
        id: "cgitem_61_i02",
        to: 0.5,
        type: "cgitem",
      },
    ]);
  });

  it("maps focusparam defaults and keeps effect values case-sensitive", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[focusparam(effect="Grayscale",blur=false)]',
        '[focusparam(effect="Colorinverse")]',
        '[focusparam(effect="grayscale",blur=true)]',
        "[focusparam]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.focusParamCalls).toEqual([
      { blur: false, color: "Grayscale" },
      { blur: true, color: "Colorinverse" },
      { blur: true, color: "None" },
      { blur: true, color: "None" },
    ]);
  });

  it("maps curtain commands with native alpha and block args", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=0,fillfrom=0.01,fillto=0.2,fadetime=1.5,isblock=true)]",
        "[curtain(direction=4,fillto=0.08,a=0.5,fadetime=0.25,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: undefined,
        alphaTo: undefined,
        block: false,
        delayMs: 0,
        direction: 0,
        fadeMs: 1500,
        fillFrom: 0.01,
        fillTo: 0.2,
        grad: false,
      },
      {
        alphaFrom: undefined,
        alphaTo: 0.5,
        block: true,
        delayMs: 0,
        direction: 4,
        fadeMs: 250,
        fillFrom: 1,
        fillTo: 0.08,
        grad: false,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("ignores the non-native curtain ato key", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[curtain(direction=4,fillfrom=0.18,fillto=0.18,afrom=0,ato=1,fadetime=0.1,block=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.curtainCalls).toEqual([
      {
        alphaFrom: 0,
        alphaTo: undefined,
        block: true,
        delayMs: 0,
        direction: 4,
        fadeMs: 100,
        fillFrom: 0.18,
        fillTo: 0.18,
        grad: false,
      },
    ]);
  });

  it("clears all curtains when direction is omitted", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[curtain(fadetime=0.3,block=true)]", '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // _HideAllCurtains returns a literal false from every exit, so the clear path
    // never blocks even when the script asks for it.
    expect(renderer.curtainClearCalls).toEqual([
      {
        block: false,
        fadeMs: 300,
      },
    ]);
    expect(renderer.curtainCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });
});
