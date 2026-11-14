import { setImmediate } from "node:timers/promises";

import { Ticker, UPDATE_PRIORITY } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import { parseRichChars } from "../../src/widgets/StoryPlayer/engine/richtext";
import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import { createManualClock, createRenderer } from "../helpers/rendererFixtures";
import { createContext, FakeAudio } from "../helpers/runtimeFakes";

import type { TimerStickerInput } from "../../src/widgets/StoryPlayer/engine/types";

const timerInput = {
  durationMs: 1000,
  fromAlpha: 0,
  limitSeconds: 9999,
  sizePx: 24,
  toAlpha: 1,
  widthPx: 1280,
  x: 935,
  y: 80,
} satisfies TimerStickerInput;

function transparentText(text: string): string {
  return `<_c00000000>${text}</_c00000000>`;
}

function createTickerPlayback(script: string[]) {
  const context = createContext(script);
  const renderer = createRenderer(context);
  const ticker = new Ticker();
  ticker.lastTime = 0;
  renderer.app = { ticker };
  const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
    typingIntervalMs: 40,
  });
  return {
    destroy() {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
    },
    renderer,
    runtime,
    ticker,
  };
}

describe("PixiStoryRenderer", () => {
  it("waits for a frame even when Delay is zero", async () => {
    vi.useFakeTimers();
    const { destroy, runtime, ticker } = createTickerPlayback([
      "[delay(time=0)]",
      '[name="A"]after',
    ]);
    try {
      const started = runtime.start();
      await vi.advanceTimersByTimeAsync(1);
      expect(runtime.getState()).toBe("waiting_timer");
      expect(runtime.getDisplayedLineIndex()).toBeNull();

      const draw = vi.fn(() => runtime.getDisplayedLineIndex());
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(16);
      expect(draw).toHaveReturnedWith(2);
      await started;
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("force-ends SkipToThis at the old speed and begins the destination after Update", async () => {
    const { destroy, renderer, runtime, ticker } = createTickerPlayback([
      '[name="A"]A',
      "[SkipToThis]",
      '[name="B"]B',
    ]);
    const setDialogue = vi.spyOn(renderer, "setDialogue");
    const finishMode = vi.fn(() => runtime.getAutoPlayState().mode);
    vi.spyOn(renderer, "finishDialogueCommand").mockImplementation(finishMode);
    try {
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      ticker.update(16);
      const skipped = runtime.skipNode();
      await setImmediate();

      expect(finishMode).toHaveReturnedWith("button_auto");
      expect(runtime.getAutoPlayState().mode).toBe("default");
      expect(runtime.getDisplayedLineIndex()).toBe(1);

      const draw = vi.fn(() => [
        runtime.getDisplayedLineIndex(),
        setDialogue.mock.lastCall?.[1],
      ]);
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(64);
      expect(draw).toHaveReturnedWith([
        3,
        expect.objectContaining({ visibleCount: 0 }),
      ]);
      await skipped;
    } finally {
      destroy();
    }
  });

  it.each(["[theater(mode=true)]", "[stopmusic]"])(
    "continues after %s before drawing the resumed frame",
    async (command) => {
      const { destroy, runtime, ticker } = createTickerPlayback([
        '[name="A"]A',
        command,
        '[name="B"]B',
      ]);
      try {
        await runtime.start();
        ticker.update(48);
        const advancing = runtime.advance();
        ticker.update(64);

        const draw = vi.fn(() => runtime.getDisplayedLineIndex());
        ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
        ticker.update(80);
        expect(draw).toHaveReturnedWith(3);
        await advancing;
      } finally {
        destroy();
      }
    },
  );

  it("leaves a new sticker sequence at its start in quick play", async () => {
    const { destroy, renderer, runtime, ticker } = createTickerPlayback([
      '[sticker(id="s",text="A",duration=0,block=false)]',
      '[stickertween(id="s",sfrom=1.25,sto=2,sduration=1,isend=true)]',
      '[name="B"]B',
    ]);
    renderer.layoutSubtitle = vi.fn();
    const tween = vi.spyOn(renderer.updatePhaseTweenRunner, "run");
    try {
      runtime.setAutoPlayMode("quick_play");
      await runtime.start();
      // The only tween is the sticker's zero-duration fade-in.
      expect(tween).toHaveBeenCalledTimes(1);
      ticker.update(1000);
      const { scale } = renderer.stickerViews.get("s").root;
      expect([scale.x, scale.y]).toEqual([1.25, 1.25]);
    } finally {
      destroy();
    }
  });

  it("runs frame-end callbacks after the scene draws and only once", () => {
    const renderer = createRenderer();
    const ticker = new Ticker();
    renderer.app = { ticker };
    const order: string[] = [];
    try {
      ticker.add(() => order.push("draw"), undefined, UPDATE_PRIORITY.LOW);
      renderer.onFrameEnd(() => order.push("finish"));
      const cancel = renderer.onFrameEnd(() => order.push("cancelled"));
      cancel();
      ticker.update(16);
      ticker.update(32);
      expect(order).toEqual(["draw", "finish", "draw"]);
    } finally {
      ticker.destroy();
    }
  });

  it("samples auto-play mode after the frame update on both sides of the wait", async () => {
    const context = createContext(['[subtitle(text="A")]', '[name="B"]next']);
    const renderer = createRenderer(context);
    const ticker = new Ticker();
    renderer.app = { ticker };
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    const setManualDuringUpdate = () => {
      const unsubscribe = renderer.onFrameUpdate(() => {
        unsubscribe();
        runtime.setAutoPlayMode("default");
      });
    };
    try {
      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      setManualDuringUpdate();
      ticker.update(16);
      ticker.update(2000);

      runtime.setAutoPlayMode("button_auto");
      ticker.update(2016); // first WaitUntil
      ticker.update(2032); // initialize the 1530 ms deadline
      ticker.update(3561);
      ticker.update(3562); // deadline reached, still needs the second WaitUntil
      expect(runtime.getState()).toBe("waiting_input");
      setManualDuringUpdate();
      ticker.update(3578);
      expect(runtime.getState()).toBe("waiting_input");
      expect(runtime.getDisplayedLineIndex()).toBe(1);

      runtime.setAutoPlayMode("button_auto");
      ticker.update(3594); // click and FinishCommand at frame end
      expect(runtime.getState()).toBe("running");
      expect(runtime.getDisplayedLineIndex()).toBe(1);
      ticker.update(3610); // command coroutine resumes
      expect(runtime.getDisplayedLineIndex()).toBe(2);
    } finally {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
    }
  });

  it("lets the quick-play click finish a subtitle whose interval passed between frames", async () => {
    vi.useFakeTimers();
    const context = createContext(['[subtitle(text="A")]', '[name="B"]next']);
    const renderer = createRenderer(context);
    const ticker = new Ticker();
    ticker.lastTime = 0;
    renderer.app = { ticker };
    const setSubtitle = vi.spyOn(renderer, "setSubtitle");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
      typingIntervalMs: 40,
    });
    try {
      await runtime.start();
      ticker.update(16);
      ticker.update(32);
      await vi.advanceTimersByTimeAsync(41);
      expect(setSubtitle.mock.lastCall?.[0]).toMatchObject({ visibleCount: 0 });

      runtime.setAutoPlayMode("quick_play");
      expect(setSubtitle.mock.lastCall?.[0]).toMatchObject({ visibleCount: 1 });
      ticker.update(48);
      expect(runtime.getState()).toBe("waiting_input");
      expect(runtime.getDisplayedLineIndex()).toBe(1);
    } finally {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
      vi.useRealTimers();
    }
  });

  it("completes a zero-delay multiline in the next update before drawing", async () => {
    vi.useFakeTimers();
    const context = createContext([
      "[multiline(delay=0)]abc",
      '[name="A"]next',
    ]);
    const renderer = createRenderer(context);
    const ticker = new Ticker();
    renderer.app = { ticker };
    const setDialogue = vi.spyOn(renderer, "setDialogue");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
      typingIntervalMs: 40,
    });
    try {
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      await vi.advanceTimersByTimeAsync(16);
      expect(setDialogue).toHaveBeenCalledTimes(1);
      expect(setDialogue.mock.lastCall?.[1]).toMatchObject({ visibleCount: 0 });

      const draw = vi.fn(() => {
        expect(setDialogue.mock.lastCall?.[1]).toMatchObject({
          visibleCount: 3,
        });
      });
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(16);
      expect(draw).toHaveBeenCalledTimes(1);
    } finally {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
      vi.useRealTimers();
    }
  });

  it.each([0, 0.04])(
    "finishes non-blocking sticker show and append before drawing the resumed frame (delay=%s)",
    async (delay) => {
      const context = createContext([
        '[name="A"]A',
        `[sticker(id="s",text="one",multi=true,delay=${delay},duration=0,block=false)]`,
        '[sticker(id="s",text="two",multi=true)]',
        '[name="B"]next',
      ]);
      const renderer = createRenderer(context);
      renderer.layoutSubtitle = vi.fn();
      const ticker = new Ticker();
      ticker.lastTime = 0;
      renderer.app = { ticker };
      const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
        typingIntervalMs: 40,
      });
      try {
        await runtime.start();
        ticker.update(48);
        const advancing = runtime.advance();
        ticker.update(64); // FinishCommand at frame end.

        const draw = vi.fn(() => {
          const sticker = renderer.stickerViews.get("s");
          return {
            isTyping: sticker?.isTyping,
            line: runtime.getDisplayedLineIndex(),
            text: sticker?.text.text,
          };
        });
        ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
        ticker.update(80); // The command coroutine resumes before this draw.
        await advancing;
        expect(draw).toHaveReturnedWith({
          isTyping: false,
          line: 4,
          text: "onetwo",
        });
      } finally {
        runtime.destroy();
        renderer.app = null;
        ticker.destroy();
        renderer.destroy();
      }
    },
  );

  it("keeps a decision blocking through the draw when an old auto click is due", async () => {
    const context = createContext([
      '[sticker(id="s",text="typing",duration=0,block=false)]',
      '[decision(options="A;B",values="1;2")]',
      `[subtitle(text="${"X".repeat(240)}")]`,
    ]);
    const renderer = createRenderer(context);
    renderer.layoutSubtitle = vi.fn();
    const ticker = new Ticker();
    ticker.lastTime = 0;
    renderer.app = { ticker };
    const setSubtitle = vi.spyOn(renderer, "setSubtitle");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    try {
      runtime.setAutoPlayMode("button_auto");
      runtime.setAutoPlaySpeedLevel(1);
      const started = runtime.start();
      ticker.update(16); // First WaitUntil passes.
      ticker.update(32); // Start the 590 ms wait from the sticker's type end.
      ticker.update(622); // The auto click will fire on the next update.

      const decision = renderer.decisionView.container;
      const stopUpdate = renderer.onFrameUpdate(() => {
        stopUpdate();
        decision.children[1].emit("pointertap");
      });
      const draw = vi.fn(() => ({
        decisionVisible: renderer.decisionView.container === decision,
        selection: runtime.getDecisionSelectValue(),
        state: runtime.getState(),
      }));
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(638);
      expect(draw).toHaveReturnedWith({
        decisionVisible: true,
        selection: 1,
        state: "waiting_decision",
      });
      expect(renderer.decisionView.container).toBeNull();
      expect(setSubtitle).not.toHaveBeenCalled();

      ticker.update(654); // Resume the command loop before drawing.
      expect(setSubtitle).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibleCount: 0 }),
        expect.any(Object),
      );
      ticker.update(670);
      expect(setSubtitle).toHaveBeenLastCalledWith(
        expect.objectContaining({ visibleCount: 1 }),
        undefined,
      );
      await started;
    } finally {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
    }
  });

  it("continues after synchronous spellsticker commands before drawing", async () => {
    const context = createContext([
      '[name="A"]A',
      '[spellsticker(id="s",block=false)]<p=1>Spell</>',
      '[spellsticker(id="s",action="hide",block=false)]',
      "[spellstickerclear(block=false)]",
      '[name="B"]next',
    ]);
    const renderer = createRenderer(context);
    const ticker = new Ticker();
    ticker.lastTime = 0;
    renderer.app = { ticker };
    const clear = vi.spyOn(renderer, "clearSpellStickers");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    try {
      await runtime.start();
      ticker.update(48);
      const advancing = runtime.advance();
      ticker.update(64);

      const draw = vi.fn(() => ({
        cleared: clear.mock.calls.length,
        line: runtime.getDisplayedLineIndex(),
      }));
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(80);
      expect(draw).toHaveReturnedWith({ cleared: 1, line: 5 });
      await advancing;
    } finally {
      runtime.destroy();
      renderer.app = null;
      ticker.destroy();
      renderer.destroy();
    }
  });

  it("auto-advances consecutive blocking spellstickers using the show clips", async () => {
    const context = createContext([
      '[spellsticker(id="s",style="SAMI",block=true)]<p=1>A</>',
      '[spellsticker(id="f",style="fire",block=true)]<p=1>B</>',
      '[name="A"]after',
    ]);
    const renderer = createRenderer(context);
    renderer.frames.manual = true;
    const show = vi.spyOn(renderer, "setSpellSticker");
    const hide = vi.spyOn(renderer, "hideSpellSticker");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    try {
      runtime.setAutoPlayMode("button_auto");
      runtime.setAutoPlaySpeedLevel(2);
      await runtime.start();
      await renderer.frames.advance(16, 16, 1749);
      expect(show).toHaveBeenCalledTimes(1);
      expect(hide).not.toHaveBeenCalled();
      await renderer.frames.advance(1, 16, 16);
      expect(show).toHaveBeenCalledTimes(2);
      expect(hide.mock.calls).toEqual([["s"]]);

      await renderer.frames.advance(16, 16, 1516);
      expect(hide.mock.calls).toEqual([["s"]]);
      await renderer.frames.advance(1, 16, 16);
      expect(hide.mock.calls).toEqual([["s"], ["f"]]);
      expect(runtime.getDisplayedLineIndex()).toBe(3);
    } finally {
      runtime.destroy();
      renderer.destroy();
    }
  });

  it("counts up from zero on whole-second wall-clock boundaries", () => {
    vi.useFakeTimers({ now: 900 });
    const { destroy, renderer, ticker } = createTickerPlayback([]);
    try {
      renderer.setTimerSticker(timerInput);
      const timer = renderer.timerView.root;
      expect(timer.text).toBe("00:00:00");

      vi.advanceTimersByTime(99);
      ticker.update(99);
      expect(timer.text).toBe("00:00:00");
      vi.advanceTimersByTime(1);
      ticker.update(100);
      expect(timer.text).toBe("00:00:01");
      vi.advanceTimersByTime(10_000);
      ticker.update(10_100);
      expect(timer.text).toBe("00:00:11");

      // ResetTime lets the next frame publish even in the same wall second.
      renderer.setTimerSticker(timerInput);
      expect(timer.text).toBe("00:00:11");
      ticker.update(10_116);
      expect(timer.text).toBe("00:00:00");
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it.each([
    { elapsedSeconds: 5, expected: "00:00:05", limitSeconds: 3 },
    { elapsedSeconds: 100_000, expected: "03:46:40", limitSeconds: 100_000 },
  ])(
    "freezes the last sampled reading at $expected after timeout",
    ({ elapsedSeconds, expected, limitSeconds }) => {
      vi.useFakeTimers({ now: 0 });
      const { destroy, renderer, ticker } = createTickerPlayback([]);
      try {
        renderer.setTimerSticker({ ...timerInput, limitSeconds });
        const timer = renderer.timerView.root;
        expect(timer.text).toBe("00:00:00");

        vi.setSystemTime(elapsedSeconds * 1000);
        ticker.update(elapsedSeconds * 1000);
        expect(timer.text).toBe(expected);
        expect(timer.visible).toBe(true);

        vi.advanceTimersByTime(1000);
        ticker.update((elapsedSeconds + 1) * 1000);
        expect(timer.text).toBe(expected);
        renderer.setTimerSticker({ ...timerInput, limitSeconds });
        expect(timer.text).toBe("00:00:00");
      } finally {
        destroy();
        vi.useRealTimers();
      }
    },
  );

  it("fades with OutQuad and retires a replaced tween", () => {
    const { destroy, renderer, ticker } = createTickerPlayback([]);
    try {
      renderer.setTimerSticker({ ...timerInput, limitSeconds: undefined });
      const timer = renderer.timerView.root;
      ticker.update(500);
      expect(timer.alpha).toBe(0.75);

      renderer.clearTimerSticker({ durationMs: 1000 });
      ticker.update(1000);
      expect(timer.alpha).toBe(0.1875);
      expect(timer.visible).toBe(true);
      ticker.update(1500);
      expect(timer.alpha).toBe(0);
      expect(timer.visible).toBe(false);
    } finally {
      destroy();
    }
  });

  it.each([
    { duration: 0.000001, alphaAt65Ms: 0.75 },
    { duration: 0.00001, alphaAt65Ms: 0.75 },
    { duration: 0.000011, alphaAt65Ms: 1 },
  ])(
    "uses the native fade-in threshold for duration=$duration",
    async ({ duration, alphaAt65Ms }) => {
      const { destroy, renderer, runtime, ticker } = createTickerPlayback([
        `[timersticker(time=60,duration=${duration})]`,
        '[name="A"]hold',
      ]);
      try {
        await runtime.start();
        ticker.update(65);
        expect(renderer.timerView.root.alpha).toBe(alphaAt65Ms);
        ticker.update(130);
        expect(renderer.timerView.root.alpha).toBe(1);
      } finally {
        destroy();
      }
    },
  );

  it("keeps ticking during a fade and completes it before showing again", () => {
    vi.useFakeTimers({ now: 0 });
    const { destroy, renderer, ticker } = createTickerPlayback([]);
    try {
      renderer.setTimerSticker(timerInput);
      const timer = renderer.timerView.root;
      vi.advanceTimersByTime(3000);
      ticker.update(3000);
      expect(timer.text).toBe("00:00:03");

      renderer.clearTimerSticker({ durationMs: 2000 });
      vi.advanceTimersByTime(1000);
      ticker.update(4000);
      expect(timer.text).toBe("00:00:04");
      renderer.setTimerSticker(timerInput);

      expect(timer.visible).toBe(true);
      vi.advanceTimersByTime(5000);
      ticker.update(9000);
      expect(timer.alpha).toBe(1);
      expect(timer.visible).toBe(true);
      expect(timer.text).toBe("00:00:04");

      renderer.setTimerSticker(timerInput);
      expect(timer.text).toBe("00:00:00");
      vi.advanceTimersByTime(1000);
      ticker.update(10_000);
      expect(timer.text).toBe("00:00:01");
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("defers a zero-duration clear and completes it on a same-frame show", () => {
    vi.useFakeTimers({ now: 0 });
    const { destroy, renderer, ticker } = createTickerPlayback([]);
    try {
      renderer.setTimerSticker(timerInput);
      const timer = renderer.timerView.root;
      vi.advanceTimersByTime(4000);
      ticker.update(4000);

      renderer.clearTimerSticker({ durationMs: 0 });
      expect(timer.visible).toBe(true);
      expect(timer.alpha).toBe(1);
      renderer.setTimerSticker(timerInput);
      expect(timer.text).toBe("00:00:04");

      vi.advanceTimersByTime(1000);
      ticker.update(5000);
      expect(timer.visible).toBe(true);
      expect(timer.text).toBe("00:00:04");

      renderer.setTimerSticker(timerInput);
      expect(timer.text).toBe("00:00:00");
      renderer.clearTimerSticker({ durationMs: 0 });
      expect(timer.visible).toBe(true);
      ticker.update(5016);
      expect(timer.visible).toBe(false);
      expect(timer.alpha).toBe(0);
      vi.advanceTimersByTime(1000);
      ticker.update(6000);
      expect(timer.text).toBe("00:00:00");
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("leaves the running clock untouched when timersticker omits time", () => {
    vi.useFakeTimers({ now: 0 });
    const { destroy, renderer, ticker } = createTickerPlayback([]);
    try {
      renderer.setTimerSticker(timerInput);
      const timer = renderer.timerView.root;
      vi.advanceTimersByTime(2000);
      ticker.update(2000);
      expect(timer.text).toBe("00:00:02");

      renderer.setTimerSticker({ ...timerInput, limitSeconds: undefined });
      expect(timer.text).toBe("00:00:02");
      vi.advanceTimersByTime(1000);
      ticker.update(3000);
      expect(timer.text).toBe("00:00:03");
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("clears stickers after the natural story-end wait", async () => {
    vi.useFakeTimers({ now: 950 });
    const { destroy, renderer, runtime, ticker } = createTickerPlayback([
      '[sticker(id="left",text="still here",duration=0,block=false)]',
      "[timersticker(time=60)]",
    ]);
    renderer.layoutSubtitle = vi.fn();
    try {
      const started = runtime.start();
      const sticker = renderer.stickerViews.get("left").root;
      const timer = renderer.timerView.root;
      expect(runtime.getState()).toBe("waiting_timer");
      expect(timer.visible).toBe(true);

      vi.advanceTimersByTime(50);
      ticker.update(50);
      expect(timer.text).toBe("00:00:01");
      ticker.update(249);
      expect(runtime.getState()).toBe("waiting_timer");
      expect(sticker.visible).toBe(true);
      expect(timer.visible).toBe(true);

      const draw = vi.fn(() => sticker.visible);
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(250);
      await started;
      expect(runtime.getState()).toBe("finished");
      expect(draw).toHaveReturnedWith(false);
      expect(timer.visible).toBe(true);

      ticker.update(266);
      expect(timer.visible).toBe(false);
      expect(timer.alpha).toBe(0);
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("finishes the skip reset before showing the timer at the destination", async () => {
    vi.useFakeTimers({ now: 0 });
    const { destroy, renderer, runtime, ticker } = createTickerPlayback([
      "[timersticker(time=60)]",
      '[name="A"]before',
      "[SkipToThis]",
      "[timersticker(time=60)]",
      '[name="B"]after',
    ]);
    try {
      await runtime.start();
      const timer = renderer.timerView.root;
      vi.advanceTimersByTime(3000);
      ticker.update(3000);
      expect(timer.text).toBe("00:00:03");

      const skipping = runtime.skipNode();
      await setImmediate();
      expect(timer.visible).toBe(true);
      ticker.update(3016);
      await skipping;
      expect(timer.visible).toBe(true);
      expect(timer.text).toBe("00:00:00");

      vi.advanceTimersByTime(1000);
      ticker.update(4016);
      expect(timer.text).toBe("00:00:01");
    } finally {
      destroy();
      vi.useRealTimers();
    }
  });

  it("completes in-flight sticker typing before the hide fade", async () => {
    const renderer = createRenderer();
    // happy-dom cannot measure canvas fonts, and the fade runs through the
    // frame-driven tween; stub both so the test observes the text state.
    renderer.layoutSubtitle = vi.fn();
    let finishFade: (() => void) | null = null;
    renderer.updatePhaseTweenRunner.run = vi.fn(
      (
        _durationMs: number,
        _step: (progress: number) => void,
        done?: () => void,
      ) => {
        finishFade = done ?? null;
        return Promise.resolve();
      },
    );
    await renderer.setSticker({
      alignment: "left",
      append: false,
      delayMs: 40,
      fadeMs: 0,
      id: "a",
      sizePx: 24,
      text: "hello",
      widthPx: 1280,
      x: 10,
      y: 20,
    });

    const sticker = renderer.stickerViews.get("a").text;
    expect(sticker.text).toBe(transparentText("hello"));
    expect(renderer.stickerViews.get("a").isTyping).toBe(true);

    // Hide mid-typing: native runs TryFinishType before HideSticker, so the
    // full text appears instantly and is what fades out.
    const hiding = renderer.clearSticker("a", 150);
    expect(sticker.text).toBe("hello");
    expect(renderer.stickerViews.get("a").isTyping).toBe(false);

    (finishFade as unknown as () => void)();
    await hiding;
    expect(sticker.text).toBe("");
    expect(renderer.stickerViews.get("a").root.visible).toBe(false);
  });

  it("recycles stickers without finishing their typing", async () => {
    const renderer = createRenderer();
    renderer.frames.manual = true;
    renderer.layoutSubtitle = vi.fn();
    renderer.updatePhaseTweenRunner.run = vi.fn(() => Promise.resolve());
    await renderer.setSticker({
      alignment: "left",
      append: false,
      delayMs: 40,
      fadeMs: 0,
      id: "a",
      sizePx: 24,
      text: "hello",
      widthPx: 1280,
      x: 10,
      y: 20,
    });
    renderer.frames.step(81);
    const sticker = renderer.stickerViews.get("a").text;
    const partial = `he${transparentText("llo")}`;
    expect(sticker.text).toBe(partial);

    // _RecycleStickers (stickerclear / skip reset) calls HideSticker(0)
    // with no TryFinishType: the partial text is what fades out.
    await renderer.clearStickers(150);
    expect(sticker.text).toBe(partial);
    expect(renderer.stickerViews.get("a").isTyping).toBe(false);
    renderer.frames.step(200);
    expect(sticker.text).toBe(partial);
  });

  it("advances sticker iterators on tag, character and completion steps", async () => {
    const ticker = new Ticker();
    try {
      const renderer = createRenderer();
      renderer.app = { ticker };
      renderer.layoutSubtitle = vi.fn();
      renderer.updatePhaseTweenRunner.run = vi.fn(() => Promise.resolve());
      const input = {
        alignment: "left" as const,
        append: false,
        fadeMs: 0,
        sizePx: 24,
        widthPx: 1280,
        x: 0,
        y: 0,
      };

      const instant = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 0,
        id: "a",
        onTypingComplete: instant,
        text: "hi",
      });
      expect(renderer.stickerViews.get("a").isTyping).toBe(true);
      expect(instant).not.toHaveBeenCalled();
      const draw = vi.fn(() => {
        expect(renderer.stickerViews.get("a").text.text).toBe("hi");
        expect(instant).toHaveBeenCalledExactlyOnceWith();
      });
      ticker.addOnce(draw, undefined, UPDATE_PRIORITY.LOW);
      ticker.update(16);
      expect(draw).toHaveBeenCalledTimes(1);

      const typed = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 10,
        id: "b",
        onTypingComplete: typed,
        text: "<i>A</i>",
      });
      const view = renderer.stickerViews.get("b");
      ticker.update(27);
      expect(view.text.text).toBe(`<_i>${transparentText("A")}</_i>`);
      ticker.update(37);
      expect(view.text.text).toBe("<_i>A</_i>");
      ticker.update(66);
      expect(view.isTyping).toBe(true);
      expect(typed).not.toHaveBeenCalled();
      ticker.update(67);
      expect(view.isTyping).toBe(false);
      expect(typed).toHaveBeenCalledExactlyOnceWith();

      await renderer.setSticker({
        ...input,
        delayMs: -10,
        id: "surrogate",
        text: "😀A",
      });
      const surrogate = renderer.stickerViews.get("surrogate");
      ticker.update(108);
      expect(surrogate.text.text).toBe(transparentText("😀A"));
      ticker.update(148);
      expect(surrogate.text.text).toBe(`😀${transparentText("A")}`);

      const clicked = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 10,
        id: "clicked",
        onTypingComplete: clicked,
        text: "hey",
      });
      ticker.update(179);
      expect(renderer.stickerViews.get("clicked").text.text).toBe("hey");
      expect(renderer.finishStickerTyping("clicked")).toBe(true);
      expect(clicked).toHaveBeenCalledTimes(1);
      ticker.update(229);
      expect(clicked).toHaveBeenCalledTimes(1);

      // Typing cut short by a hide (TryFinishType) does not report here; the
      // runtime's hide branch raises its own auto click.
      const hidden = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 10,
        id: "c",
        onTypingComplete: hidden,
        text: "hey",
      });
      ticker.update(240);
      await renderer.clearSticker("c", 0);
      ticker.update(340);
      expect(hidden).not.toHaveBeenCalled();
    } finally {
      ticker.destroy();
    }
  });
});

function createSubtitleRenderer() {
  const renderer = createRenderer();
  const manual = createManualClock();
  renderer.updatePhaseTweenRunner = new TweenRunner(() => true, manual.clock);
  renderer.layoutSubtitle = vi.fn();
  renderer.subtitleView.mount();
  const subtitle = renderer.uiLayer.children.at(-1);
  // Count the fades while keeping the real runner so alpha reaches its target.
  const original = renderer.updatePhaseTweenRunner.run.bind(
    renderer.updatePhaseTweenRunner,
  );
  const tween = vi.fn((...args: unknown[]) => original(...args));
  renderer.updatePhaseTweenRunner.run = tween;
  return { manual, renderer, subtitle, tween };
}

describe("PixiStoryRenderer subtitle", () => {
  const layout = {
    alignment: "left" as const,
    sizePx: 24,
    widthPx: 1280,
    x: 0,
    y: 100,
  };
  const reveal = (text: string, visibleCount?: number) => {
    const chars = parseRichChars(text);
    return { chars, visibleCount: visibleCount ?? chars.length };
  };

  it("fades a hidden subtitle in but never replays the fade for consecutive ones", async () => {
    const { manual, renderer, subtitle, tween } = createSubtitleRenderer();

    renderer.setSubtitle(reveal("hello"), layout);
    expect(subtitle.visible).toBe(true);
    expect(tween).toHaveBeenCalledTimes(1);
    expect(tween.mock.calls[0][0]).toBe(150);
    manual.advance(150);
    manual.drainFrame();
    expect(subtitle.alpha).toBe(1);

    tween.mockClear();
    renderer.setSubtitle(reveal("world"), layout);
    // Native set_isHidden(false) is a no-op while already visible.
    expect(tween).not.toHaveBeenCalled();
    expect(subtitle.text).toBe("world");
    expect(subtitle.alpha).toBe(1);

    await renderer.clearSubtitle(0);
    expect(subtitle.visible).toBe(false);
    expect(subtitle.alpha).toBe(0);
    renderer.setSubtitle(reveal("again"), layout);
    expect(tween).toHaveBeenCalledTimes(1);
    expect(subtitle.text).toBe("again");
  });

  it("lets the ongoing fade-in finish when the next subtitle arrives", () => {
    const { manual, renderer, subtitle, tween } = createSubtitleRenderer();

    renderer.setSubtitle(reveal("hello"), layout);
    manual.advance(30);
    manual.drainFrame();
    expect(subtitle.alpha).toBeCloseTo(0.2);

    // In quick play the next subtitle can arrive during the 150ms fade.
    renderer.setSubtitle(reveal("world"), layout);
    expect(tween).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i += 1) {
      manual.advance(50);
      manual.drainFrame();
    }
    expect(subtitle.alpha).toBe(1);
  });

  it("keeps the transparent tail in the layout without letting it cast a shadow", () => {
    const { renderer, subtitle } = createSubtitleRenderer();
    const { chars } = reveal("hello");

    renderer.setSubtitle({ chars, visibleCount: 0 }, layout);
    expect(subtitle.text).toBe("<_c00000000>hello</_c00000000>");
    expect(subtitle.style.tagStyles._c00000000).toEqual({
      dropShadow: false,
      fill: "#00000000",
    });
    renderer.setSubtitle({ chars, visibleCount: 1 });
    expect(subtitle.text).toBe("h<_c00000000>ello</_c00000000>");
    renderer.setSubtitle({ chars, visibleCount: 5 });
    expect(subtitle.text).toBe("hello");
  });

  it("keeps italic text italic while it is hidden and applies per-line alignment", () => {
    const { renderer, subtitle } = createSubtitleRenderer();
    const { chars } = reveal("<i>ab</i>c");

    renderer.setSubtitle(
      { chars, visibleCount: 0 },
      {
        ...layout,
        alignment: "center",
      },
    );
    expect(subtitle.style.align).toBe("center");
    expect(subtitle.style.tagStyles._i).toEqual({ fontStyle: "italic" });
    expect(subtitle.text).toBe(
      "<_i><_c00000000>ab</_c00000000></_i><_c00000000>c</_c00000000>",
    );
    renderer.setSubtitle({ chars, visibleCount: 1 });
    expect(subtitle.text).toBe(
      "<_i>a</_i><_i><_c00000000>b</_c00000000></_i><_c00000000>c</_c00000000>",
    );
    renderer.setSubtitle({ chars, visibleCount: 3 });
    expect(subtitle.text).toBe("<_i>ab</_i>c");
  });
});

// happy-dom cannot measure canvas fonts; retain real StickerView instances
// and stub only text layout, so lifecycle and tween ownership are exercised.
// The stub stands in for an alignment offset of `alignOffset` inside the rect.
function createStickerRenderer(alignOffset = 0): any {
  const renderer = createRenderer();
  renderer.layoutSubtitle = vi.fn((text, x) => {
    text.x = x + alignOffset;
  });
  return renderer;
}

async function showSticker(renderer: any, text = "hello"): Promise<any> {
  await renderer.setSticker({
    alignment: "left",
    append: false,
    delayMs: 0,
    fadeMs: 0,
    id: "st",
    sizePx: 24,
    text,
    widthPx: 200,
    x: 100,
    y: 50,
  });
  // Transforms and alpha live on the view's rect (`root`), not on the text.
  return renderer.stickerViews.get("st").root;
}

describe("PixiStoryRenderer stickerTween", () => {
  it("accumulates sticker tweens until isend and schedules join versus append", async () => {
    const renderer = createStickerRenderer();

    // fadeMs=0 fades in synchronously while the renderer is unmounted
    // (TweenRunner completes instantly without an app), so alpha settles at 1.
    const sticker = await showSticker(renderer);

    const tweenCalls: Array<{
      done?: () => void;
      durationMs: number;
      step: (progress: number) => void;
    }> = [];
    renderer.updatePhaseTweenRunner.run = vi.fn(
      (durationMs: number, step: (p: number) => void, done?: () => void) => {
        tweenCalls.push({ done, durationMs, step });
        return Promise.resolve();
      },
    );

    // isend=false only accumulates (native SequenceBuilder.Push without a
    // seqEnd step); nothing plays yet.
    renderer.stickerTween({
      id: "st",
      isend: false,
      join: false,
      position: {
        durationMs: 500,
        from: { x: 100, y: 50 },
        to: { x: 300, y: 150 },
      },
      timeScale: 0,
    });
    expect(tweenCalls).toHaveLength(0);

    // isend=true builds and plays: position appended (starts at 0), alpha
    // joined (also starts at 0), so the total is the longest step = 500ms.
    renderer.stickerTween({
      alpha: { durationMs: 300, from: 1, to: 0.2 },
      id: "st",
      isend: true,
      join: true,
      timeScale: 0.5,
    });
    expect(tweenCalls.map((call) => call.durationMs)).toEqual([1000]);
    // BuildSequence snaps every step to its own `from` before the sequence
    // plays (each AVGTweenFactory._Create*Tween writes the transform first).
    expect(sticker.x).toBe(100);
    expect(sticker.alpha).toBe(1);

    tweenCalls[0]!.step(0.5); // 500ms wall time, 250ms sequence time
    expect(sticker.x).toBe(200);
    expect(sticker.y).toBe(100);
    // The joined 300ms alpha step is 250/300 of the way from 1 to 0.2.
    expect(sticker.alpha).toBeCloseTo(0.3333, 4);

    tweenCalls[0]!.step(1);
    tweenCalls[0]!.done?.();
    expect(sticker.x).toBe(300);
    expect(sticker.y).toBe(150);
    expect(sticker.alpha).toBeCloseTo(0.2);

    // Append scheduling serializes instead: 200ms position then 100ms rotation.
    renderer.stickerTween({
      id: "st",
      isend: true,
      join: false,
      position: { durationMs: 200, from: { x: 0, y: 0 }, to: { x: 100, y: 0 } },
      rotation: { durationMs: 100, from: 0, to: 90 },
    });
    expect(tweenCalls.map((call) => call.durationMs)).toEqual([1000, 300]);
    // The up-front snap already pulled the sticker back to posfrom.
    expect(sticker.x).toBe(0);
    tweenCalls[1]!.step(1);
    // Native rotates in degrees (localEulerAngles.z); pixi stores radians.
    expect(sticker.rotation).toBeCloseTo(Math.PI / 2);
    expect(sticker.x).toBe(100);
  });

  it("invalidates in-flight sticker tweens when a newer tween or re-show lands", async () => {
    const renderer = createStickerRenderer();
    const sticker = await showSticker(renderer);

    const steps: Array<(progress: number) => void> = [];
    renderer.updatePhaseTweenRunner.run = vi.fn(
      (_durationMs: number, step: (p: number) => void) => {
        steps.push(step);
        return Promise.resolve();
      },
    );

    renderer.stickerTween({
      id: "st",
      isend: true,
      join: false,
      position: {
        durationMs: 100,
        from: { x: 100, y: 50 },
        to: { x: 400, y: 0 },
      },
    });
    steps[0]!(0.5);
    expect(sticker.x).toBe(250);

    // A newer sequence bumps the session, so the older step stops applying
    // (native instead lets two DOTween sequences fight over the transform;
    // skipping that glitch is a deliberate web adaptation).
    renderer.stickerTween({
      id: "st",
      isend: true,
      join: false,
      position: { durationMs: 100, from: { x: 250, y: 0 }, to: { x: 0, y: 0 } },
    });
    steps[0]!(1);
    expect(sticker.x).toBe(250);
    steps[1]!(1);
    expect(sticker.x).toBe(0);

    // Re-showing the same id goes through RenderSticker._ResetView natively,
    // which kills m_seq (TweenExtensions.Kill); StickerView.invalidate mirrors it.
    await renderer.setSticker({
      alignment: "left",
      append: false,
      delayMs: 0,
      fadeMs: 0,
      id: "st",
      sizePx: 24,
      text: "again",
      widthPx: 200,
      x: 0,
      y: 0,
    });
    steps[1]!(0.5);
    expect(sticker.x).toBe(0);
  });
});

describe("StickerView lifecycle", () => {
  it("finishes only the requested sticker's typing", async () => {
    const renderer = createStickerRenderer();
    const input = {
      alignment: "left" as const,
      delayMs: 40,
      fadeMs: 0,
      sizePx: 24,
      widthPx: 200,
      x: 0,
      y: 0,
    };
    const textOf = (id: string) => renderer.stickerViews.get(id).text.text;
    await renderer.setSticker({ ...input, append: false, id: "a", text: "A" });
    await renderer.setSticker({ ...input, append: false, id: "b", text: "B" });

    expect(renderer.finishStickerTyping("b")).toBe(true);
    expect(textOf("b")).toBe("B");
    expect(textOf("a")).toBe(transparentText("A"));
    expect(renderer.finishStickerTyping("b")).toBe(false);

    await renderer.setSticker({ ...input, append: true, id: "a", text: "+" });
    expect(renderer.finishStickerTyping("a")).toBe(true);
    expect(textOf("a")).toBe("A+");

    await renderer.setSticker({ ...input, append: false, id: "c", text: "C" });
    await renderer.clearSticker("a", 0);
    expect(renderer.finishStickerTyping("a")).toBe(false);
    expect(renderer.stickerViews.get("c").isTyping).toBe(true);
    await renderer.clearStickers(0);
    expect(renderer.finishStickerTyping("c")).toBe(false);
  });

  it.each(["center", "right"] as const)(
    "lays out %s-aligned stickers using the full message during typing",
    async (alignment) => {
      const renderer = createStickerRenderer();
      renderer.frames.manual = true;
      const layout = vi.fn((text: { text: string; x: number }, x: number) => {
        text.x = x + 40;
        return text.text;
      });
      renderer.layoutSubtitle = layout;
      await renderer.setSticker({
        alignment,
        append: false,
        delayMs: 40,
        fadeMs: 0,
        id: "st1",
        sizePx: 24,
        text: "<i>AB</i>\nCD",
        widthPx: 200,
        x: 0,
        y: 0,
      });
      const { text } = renderer.stickerViews.get("st1");
      expect(layout).toHaveReturnedWith("<_i>AB</_i>\nCD");
      expect(text.style.align).toBe(alignment);
      expect(text.style.tagStyles._c00000000).toEqual({
        dropShadow: false,
        fill: "#00000000",
      });
      expect(text.text).toBe(
        `<_i>${transparentText("AB")}</_i>${transparentText("\nCD")}`,
      );

      renderer.frames.step(81);
      expect(text.text).toBe(
        `<_i>A</_i><_i>${transparentText("B")}</_i>${transparentText("\nCD")}`,
      );
      expect(layout).toHaveBeenCalledTimes(1);
      expect(text.x).toBe(40);
      await renderer.clearStickers(0);
    },
  );

  it("retimes a visible sticker without losing its accumulated typing time", async () => {
    const renderer = createStickerRenderer();
    renderer.frames.manual = true;
    const complete = vi.fn();
    const input = {
      alignment: "left" as const,
      append: false,
      delayMs: 80,
      fadeMs: 0,
      sizePx: 24,
      text: "ABCDE",
      widthPx: 200,
      x: 0,
      y: 0,
    };
    await renderer.setSticker({ ...input, id: "old" });
    await renderer.setSticker({
      ...input,
      id: "current",
      onTypingComplete: complete,
    });
    const old = renderer.stickerViews.get("old");
    const current = renderer.stickerViews.get("current");
    renderer.frames.step(35);
    expect(current.text.text).toBe(transparentText("ABCDE"));

    renderer.setStickerTypeWriterDelay("current", 10);
    expect(current.text.text).toBe(transparentText("ABCDE"));
    renderer.frames.step(1);
    expect(current.text.text).toBe(`ABC${transparentText("DE")}`);
    renderer.frames.step(14);
    expect(current.text.text).toBe(`ABCD${transparentText("E")}`);
    renderer.frames.step(1);
    expect(current.text.text).toBe("ABCDE");
    expect(complete).not.toHaveBeenCalled();

    // The two finishing steps also use the current interval.
    renderer.frames.step(4);
    renderer.setStickerTypeWriterDelay("current", 5);
    renderer.frames.step(5);
    expect(complete).not.toHaveBeenCalled();
    renderer.frames.step(1);
    expect(complete).toHaveBeenCalledExactlyOnceWith();
    expect(old.text.text).toBe(transparentText("ABCDE"));
    await renderer.clearStickers();
  });

  it.each([
    {
      resetText: false,
      initial: `H${transparentText("ELLO!")}`,
      next: `HE${transparentText("LLO!")}`,
      full: "HELLO!",
      remainingMs: 160,
    },
    {
      resetText: true,
      initial: transparentText("!"),
      next: "!",
      full: "!",
      remainingMs: 0,
    },
  ])(
    "continues or resets the sticker's visible prefix (resetText=$resetText)",
    async ({ resetText, initial, next, full, remainingMs }) => {
      const renderer = createStickerRenderer();
      renderer.frames.manual = true;
      const firstComplete = vi.fn();
      const appendComplete = vi.fn();
      const layout = {
        alignment: "left" as const,
        delayMs: 40,
        fadeMs: 0,
        id: "st1",
        sizePx: 24,
        widthPx: 200,
        x: 0,
        y: 0,
      };
      await renderer.setSticker({
        ...layout,
        append: false,
        onTypingComplete: firstComplete,
        text: "HELLO",
      });
      const { text } = renderer.stickerViews.get("st1");
      renderer.frames.step(55);
      expect(text.text).toBe(`H${transparentText("ELLO")}`);

      await renderer.setSticker({
        ...layout,
        append: true,
        onTypingComplete: appendComplete,
        resetText,
        text: "!",
      });
      renderer.frames.step(40);
      expect(text.text).toBe(initial);
      renderer.frames.step(1);
      expect(text.text).toBe(next);
      renderer.frames.step(remainingMs);
      expect(text.text).toBe(full);
      expect(appendComplete).not.toHaveBeenCalled();
      renderer.frames.step(80);
      expect(firstComplete).not.toHaveBeenCalled();
      expect(appendComplete).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it("keeps the fade-in, tween and transform when appending (native AppendText)", async () => {
    const renderer = createStickerRenderer(40);
    renderer.frames.manual = true;
    const tweens: Array<{
      durationMs: number;
      step: (progress: number) => void;
      done?: () => void;
    }> = [];
    renderer.updatePhaseTweenRunner.run = vi.fn((durationMs, step, done) => {
      tweens.push({ durationMs, done, step });
      return Promise.resolve();
    });
    const layout = {
      alignment: "center" as const,
      delayMs: 0,
      fadeMs: 1000,
      sizePx: 24,
      widthPx: 1000,
      x: 80,
      y: 500,
    };
    // level_main_15-04_beg.txt:231-232: a block=false show with duration=1,
    // then an append on the same id before a single frame has run.
    await renderer.setSticker({
      ...layout,
      append: false,
      id: "st1",
      text: "A",
    });
    renderer.stickerTween({
      id: "st1",
      isend: true,
      join: false,
      position: {
        durationMs: 500,
        from: { x: 80, y: 500 },
        to: { x: 280, y: 400 },
      },
    });
    await renderer.setSticker({
      ...layout,
      append: true,
      id: "st1",
      text: "B",
    });

    const view = renderer.stickerViews.get("st1");
    expect(tweens.map((tween) => tween.durationMs)).toEqual([1000, 500]);
    tweens[0]!.step(0.5);
    expect(view.root.alpha).toBe(0.5);
    tweens[0]!.step(1);
    tweens[0]!.done?.();
    expect(view.root.alpha).toBe(1);

    // The tween sequence keeps running and the append did not snap the rect
    // back to the show's x/y; the alignment offset stays on the text.
    tweens[1]!.step(1);
    expect(view.root.x).toBe(280);
    expect(view.root.y).toBe(400);
    expect(view.text.x).toBe(40);
    expect(view.text.text).toBe(transparentText("AB"));
    expect(view.finishTyping()).toBe(true);
    expect(view.text.text).toBe("AB");
  });

  it("resets rotation and scale on re-show and recycle, not on hide", async () => {
    const renderer = createStickerRenderer();
    const root = await showSticker(renderer);
    renderer.updatePhaseTweenRunner.run = vi.fn((_ms, _step, done) => {
      done?.();
      return Promise.resolve();
    });
    const spin = () =>
      renderer.stickerTween({
        id: "st",
        isend: true,
        join: true,
        rotation: { durationMs: 0, from: 0, to: 90 },
        scale: { durationMs: 0, from: 0, to: 2 },
      });

    spin();
    expect(root.rotation).toBeCloseTo(Math.PI / 2);
    expect(root.scale.x).toBe(2);
    expect(root.scale.y).toBe(2);
    // HideSticker leaves the transform alone.
    await renderer.clearSticker("st", 150);
    expect(root.rotation).toBeCloseTo(Math.PI / 2);
    // RenderSticker -> _ResetView -> _ResetStickerTransform.
    await showSticker(renderer);
    expect(root.rotation).toBe(0);
    expect(root.scale.x).toBe(1);

    spin();
    // _RecycleStickers resets the transform before HideSticker(0).
    await renderer.clearStickers(150);
    expect(root.rotation).toBe(0);
    expect(root.scale.y).toBe(1);
  });

  it("pushes the 2791 scale group after alpha", async () => {
    const renderer = createStickerRenderer();
    const root = await showSticker(renderer);
    const steps: Array<(progress: number) => void> = [];
    renderer.updatePhaseTweenRunner.run = vi.fn((_ms, step) => {
      steps.push(step);
      return Promise.resolve();
    });
    renderer.stickerTween({
      alpha: { durationMs: 100, from: 0, to: 1 },
      id: "st",
      isend: true,
      join: false,
      scale: { durationMs: 100, from: 0, to: 2 },
    });
    // Appended after alpha: the scale window opens at 100ms of 200ms, pinned
    // to its `from` until then (the up-front BuildSequence snap).
    expect(root.scale.x).toBe(0);
    steps[0]!(0.5);
    expect(root.alpha).toBe(1);
    expect(root.scale.x).toBe(0);
    steps[0]!(0.75);
    expect(root.scale.x).toBe(1);
    expect(root.scale.y).toBe(1);
  });

  it("isolates view cancellation and drops callbacks after destruction", async () => {
    const renderer = createStickerRenderer();
    renderer.frames.manual = true;
    const tweens: Array<{
      step: (progress: number) => void;
      done?: () => void;
    }> = [];
    renderer.updatePhaseTweenRunner.run = vi.fn((_ms, step, done) => {
      tweens.push({ step, done });
      return Promise.resolve();
    });
    const firstDone = vi.fn();
    const secondDone = vi.fn();
    const input = {
      alignment: "left" as const,
      append: false,
      delayMs: 40,
      fadeMs: 150,
      sizePx: 24,
      widthPx: 200,
      x: 0,
      y: 0,
    };
    await renderer.setSticker({
      ...input,
      id: "a",
      text: "aa",
      onTypingComplete: firstDone,
    });
    await renderer.setSticker({
      ...input,
      id: "b",
      text: "bb",
      onTypingComplete: secondDone,
    });
    const a = renderer.stickerViews.get("a");
    const b = renderer.stickerViews.get("b");
    a.destroy();
    // Stale fade callbacks must not touch a destroyed Pixi Text.
    expect(() => {
      tweens[0]!.step(1);
      tweens[0]!.done?.();
    }).not.toThrow();
    renderer.frames.step(100);
    expect(b.text.text).toBe("bb");
    expect(b.isTyping).toBe(true);
    expect(secondDone).not.toHaveBeenCalled();
    renderer.frames.step(61);
    expect(firstDone).not.toHaveBeenCalled();
    expect(secondDone).toHaveBeenCalledExactlyOnceWith();
    expect(b.isTyping).toBe(false);
    b.destroy();
  });
});
