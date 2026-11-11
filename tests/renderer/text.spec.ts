import { Ticker, UPDATE_PRIORITY } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import { parseRichChars } from "../../src/widgets/StoryPlayer/engine/richtext";
import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import { createManualClock, createRenderer } from "../helpers/rendererFixtures";
import { createContext, FakeAudio } from "../helpers/runtimeFakes";

describe("PixiStoryRenderer", () => {
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

  it("auto-advances consecutive blocking spellstickers using the show clips", async () => {
    vi.useFakeTimers();
    const context = createContext([
      '[spellsticker(id="s",style="SAMI",block=true)]<p=1>A</>',
      '[spellsticker(id="f",style="fire",block=true)]<p=1>B</>',
      '[name="A"]after',
    ]);
    const renderer = createRenderer(context);
    const show = vi.spyOn(renderer, "setSpellSticker");
    const hide = vi.spyOn(renderer, "hideSpellSticker");
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());
    try {
      runtime.setAutoPlayMode("button_auto");
      runtime.setAutoPlaySpeedLevel(2);
      await runtime.start();
      await vi.advanceTimersByTimeAsync(1749);
      expect(show).toHaveBeenCalledTimes(1);
      expect(hide).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(show).toHaveBeenCalledTimes(2);
      expect(hide.mock.calls).toEqual([["s"]]);

      await vi.advanceTimersByTimeAsync(1515);
      expect(hide.mock.calls).toEqual([["s"]]);
      await vi.advanceTimersByTimeAsync(2);
      expect(hide.mock.calls).toEqual([["s"], ["f"]]);
      expect(runtime.getDisplayedLineIndex()).toBe(3);
    } finally {
      runtime.destroy();
      renderer.destroy();
      vi.useRealTimers();
    }
  });

  it("counts the timer sticker up from 00:00:00 like the native stopwatch", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      const timer = {
        alpha: 1,
        style: null,
        text: "",
        visible: false,
        x: 0,
        y: 0,
      };
      renderer.timerStickerText = timer;
      renderer.ensureTimerStickerText = () => timer;
      renderer.tween = vi.fn(async () => {});

      await renderer.setTimerSticker({
        durationMs: 0,
        fromAlpha: 0,
        limitSeconds: 9999,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 935,
        y: 80,
      });

      // `AVGTimerView._StartCountTimer` fires `_TimerTick(0)` once
      // immediately and the value then counts up from zero -- `time` is a
      // timeout cap, not the initial value (02:46:39 must never show here).
      expect(timer.text).toBe("00:00:00");

      // Within the ~200ms internal tick the elapsed value is still 0s; the
      // first change lands on the whole-second boundary.
      vi.advanceTimersByTime(200);
      expect(timer.text).toBe("00:00:00");

      // Each value climbs by one per second, derived from the wall clock, so
      // throttled intervals cannot drift it.
      vi.advanceTimersByTime(800);
      expect(timer.text).toBe("00:00:01");
      vi.advanceTimersByTime(10_000);
      expect(timer.text).toBe("00:00:11");
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes the timer at the time cap and wraps hours at 24", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      const timer = {
        alpha: 1,
        style: null,
        text: "",
        visible: false,
        x: 0,
        y: 0,
      };
      renderer.timerStickerText = timer;
      renderer.ensureTimerStickerText = () => timer;
      renderer.tween = vi.fn(async () => {});
      const base = {
        durationMs: 0,
        fromAlpha: 0,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 0,
        y: 0,
      };

      // `TimeSpan.Hours` wraps at 24: 100000s renders as 03:46:40.
      expect(renderer.formatTimer(100_000)).toBe("03:46:40");

      // Reaching `time` fires `_TimerEnd`, which only clears the task; the
      // view stays visible frozen at the cap (not 00:00:00) and the interval
      // stops once the cap is reached.
      await renderer.setTimerSticker({ ...base, limitSeconds: 2 });
      expect(timer.text).toBe("00:00:00");
      vi.advanceTimersByTime(2200);
      expect(timer.text).toBe("00:00:02");
      expect(timer.visible).toBe(true);
      expect(renderer.timerStickerInterval).toBeNull();
      vi.advanceTimersByTime(1000);
      expect(timer.text).toBe("00:00:02");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops stale timer fades when a newer timersticker or clear takes over", async () => {
    const renderer = createRenderer();
    const timer = {
      alpha: 1,
      style: null,
      text: "",
      visible: false,
      x: 0,
      y: 0,
    };
    renderer.timerStickerText = timer;
    renderer.ensureTimerStickerText = () => timer;
    const tweens: Array<{
      done: () => void;
      step: (progress: number) => void;
    }> = [];
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        tweens.push({ done: done ?? (() => {}), step });
      },
    );
    const base = {
      durationMs: 1000,
      fromAlpha: 0,
      limitSeconds: undefined,
      sizePx: 24,
      toAlpha: 1,
      widthPx: 1280,
      x: 0,
      y: 0,
    };

    // Fade-in half done when timerclear arrives: the stale fade-in's late
    // step/done must not write alpha after the fade-out took over.
    await renderer.setTimerSticker(base);
    tweens[0]!.step(0.5);
    expect(timer.alpha).toBe(0.5);
    await renderer.clearTimerSticker({ durationMs: 300 });
    tweens[0]!.step(1);
    tweens[0]!.done();
    expect(timer.alpha).toBe(0.5);
    tweens[1]!.step(1);
    tweens[1]!.done();
    expect(timer.alpha).toBe(0);
    expect(timer.visible).toBe(false);

    // Fade-out half done when a new timersticker reactivates the slot: the
    // stale fade-out's done must not re-hide it or clamp its alpha.
    await renderer.setTimerSticker({ ...base, fromAlpha: 0.4 });
    expect(timer.visible).toBe(true);
    await renderer.clearTimerSticker({ durationMs: 300 });
    tweens[3]!.step(0.5);
    expect(timer.alpha).toBeCloseTo(0.2);
    await renderer.setTimerSticker({ ...base, fromAlpha: 0.2, toAlpha: 0.9 });
    tweens[3]!.step(1);
    tweens[3]!.done();
    expect(timer.visible).toBe(true);
    expect(timer.alpha).toBe(0.2);
    tweens[4]!.step(1);
    expect(timer.alpha).toBeCloseTo(0.9);
  });

  it("lets a completed timerclear fade retire the clock a timersticker just restarted", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      const timer = {
        alpha: 1,
        style: null,
        text: "",
        visible: false,
        x: 0,
        y: 0,
      };
      renderer.timerStickerText = timer;
      renderer.ensureTimerStickerText = () => timer;
      renderer.tween = vi.fn(async () => {});
      const base = {
        durationMs: 0,
        fromAlpha: 0,
        limitSeconds: 9999,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 0,
        y: 0,
      };

      await renderer.setTimerSticker(base);
      vi.advanceTimersByTime(3000);
      expect(timer.text).toBe("00:00:03");

      // A fading timerclear has not run `<StopTimer>b__7_0` yet, so the slot
      // still owns its count task: the next timersticker reuses it (no
      // 00:00:00 reseed) and RenderTimer's `DOKill(_canvas, complete: true)`
      // then completes that fade, nulling `m_countTimerTask` outright.
      await renderer.clearTimerSticker({ durationMs: 2000 });
      await renderer.setTimerSticker(base);

      expect(timer.text).toBe("00:00:03");
      expect(timer.visible).toBe(true);
      expect(renderer.timerStickerInterval).toBeNull();
      vi.advanceTimersByTime(5000);
      expect(timer.text).toBe("00:00:03");

      // With the task gone, the following timersticker rebuilds it and the
      // inline `_TimerTick(0)` reseeds the slot.
      await renderer.setTimerSticker(base);
      expect(timer.text).toBe("00:00:00");
      vi.advanceTimersByTime(1000);
      expect(timer.text).toBe("00:00:01");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves the timer slot untouched when timersticker omits time", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      const timer = {
        alpha: 1,
        style: null,
        text: "",
        visible: false,
        x: 0,
        y: 0,
      };
      renderer.timerStickerText = timer;
      renderer.ensureTimerStickerText = () => timer;
      renderer.tween = vi.fn(async () => {});
      const base = {
        durationMs: 0,
        fromAlpha: 0,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 0,
        y: 0,
      };

      await renderer.setTimerSticker({ ...base, limitSeconds: 9999 });
      vi.advanceTimersByTime(2000);
      expect(timer.text).toBe("00:00:02");

      // `RenderTimer` skips `_StartCountTimer` unless `time > 0` (native
      // default -1), so the running clock keeps its original start and the
      // slot is never reseeded to 00:00:00.
      await renderer.setTimerSticker(base);
      expect(timer.text).toBe("00:00:02");
      vi.advanceTimersByTime(1000);
      expect(timer.text).toBe("00:00:03");
    } finally {
      vi.useRealTimers();
    }
  });

  it("completes in-flight sticker typing before the hide fade", async () => {
    const renderer = createRenderer();
    // happy-dom cannot measure canvas fonts, and the fade runs through the
    // frame-driven tween; stub both so the test observes the text state.
    renderer.layoutSubtitle = vi.fn();
    let finishFade: (() => void) | null = null;
    renderer.tween = vi.fn(
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

    // Without a mounted app the typing loop parks right after registering its
    // target, so nothing has been typed yet.
    const sticker = renderer.stickerViews.get("a").text;
    expect(sticker.text).toBe("");
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
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      renderer.app = {};
      renderer.layoutSubtitle = vi.fn();
      renderer.tween = vi.fn(() => Promise.resolve());
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
      await vi.advanceTimersByTimeAsync(80);
      const sticker = renderer.stickerViews.get("a").text;
      expect(sticker.text).toBe("he");

      // _RecycleStickers (stickerclear / skip reset) calls HideSticker(0)
      // with no TryFinishType: the partial text is what fades out.
      await renderer.clearStickers(150);
      expect(sticker.text).toBe("he");
      expect(renderer.stickerViews.get("a").isTyping).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(sticker.text).toBe("he");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports sticker completion on the last character or a typing click", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createRenderer();
      renderer.app = {};
      renderer.layoutSubtitle = vi.fn();
      renderer.tween = vi.fn(() => Promise.resolve());
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
      expect(instant).toHaveBeenCalledTimes(1);

      const typed = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 10,
        id: "b",
        onTypingComplete: typed,
        text: "hi",
      });
      await vi.advanceTimersByTimeAsync(10);
      expect(typed).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10);
      expect(typed).toHaveBeenCalledTimes(1);

      const clicked = vi.fn();
      await renderer.setSticker({
        ...input,
        delayMs: 10,
        id: "clicked",
        onTypingComplete: clicked,
        text: "hey",
      });
      expect(renderer.finishStickerTyping("clicked")).toBe(true);
      expect(clicked).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
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
      await vi.advanceTimersByTimeAsync(10);
      await renderer.clearSticker("c", 0);
      await vi.advanceTimersByTimeAsync(100);
      expect(hidden).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

function createSubtitleRenderer() {
  const renderer = createRenderer();
  const manual = createManualClock();
  renderer.tweenRunner = new TweenRunner(() => true, manual.clock);
  renderer.layoutSubtitle = vi.fn();
  renderer.subtitleView.mount();
  const subtitle = renderer.uiLayer.children.at(-1);
  // Count the fades while keeping the real runner so alpha reaches its target.
  const original = renderer.tween.bind(renderer);
  const tween = vi.fn((...args: unknown[]) => original(...args));
  renderer.tween = tween;
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
    renderer.tween = vi.fn(
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
    });
    expect(tweenCalls).toHaveLength(0);

    // isend=true builds and plays: position appended (starts at 0), alpha
    // joined (also starts at 0), so the total is the longest step = 500ms.
    renderer.stickerTween({
      alpha: { durationMs: 300, from: 1, to: 0.2 },
      id: "st",
      isend: true,
      join: true,
    });
    expect(tweenCalls.map((call) => call.durationMs)).toEqual([500]);
    // BuildSequence snaps every step to its own `from` before the sequence
    // plays (each AVGTweenFactory._Create*Tween writes the transform first).
    expect(sticker.x).toBe(100);
    expect(sticker.alpha).toBe(1);

    tweenCalls[0]!.step(0.5); // 250ms elapsed
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
    expect(tweenCalls.map((call) => call.durationMs)).toEqual([500, 300]);
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
    renderer.tween = vi.fn((_durationMs: number, step: (p: number) => void) => {
      steps.push(step);
      return Promise.resolve();
    });

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
    expect(textOf("a")).toBe("");
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

  it("retimes a visible sticker without losing its accumulated typing time", async () => {
    vi.useFakeTimers();
    try {
      const renderer = createStickerRenderer();
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
      await vi.advanceTimersByTimeAsync(35);
      expect(current.text.text).toBe("");

      renderer.setStickerTypeWriterDelay("current", 10);
      await vi.advanceTimersByTimeAsync(0);
      expect(current.text.text).toBe("ABC");
      await vi.advanceTimersByTimeAsync(14);
      expect(current.text.text).toBe("ABCD");
      await vi.advanceTimersByTimeAsync(1);
      expect(current.text.text).toBe("ABCDE");
      expect(complete).toHaveBeenCalledExactlyOnceWith();
      expect(old.text.text).toBe("");
      await renderer.clearStickers();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { resetText: false, initial: "H", next: "HE", full: "HELLO!" },
    { resetText: true, initial: "", next: "!", full: "!" },
  ])(
    "continues or resets the sticker's visible prefix (resetText=$resetText)",
    async ({ resetText, initial, next, full }) => {
      vi.useFakeTimers();
      try {
        const renderer = createStickerRenderer();
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
        await vi.advanceTimersByTimeAsync(55);
        expect(text.text).toBe("H");

        await renderer.setSticker({
          ...layout,
          append: true,
          onTypingComplete: appendComplete,
          resetText,
          text: "!",
        });
        await vi.advanceTimersByTimeAsync(39);
        expect(text.text).toBe(initial);
        await vi.advanceTimersByTimeAsync(1);
        expect(text.text).toBe(next);
        await vi.advanceTimersByTimeAsync(160);
        expect(text.text).toBe(full);
        expect(firstComplete).not.toHaveBeenCalled();
        expect(appendComplete).toHaveBeenCalledExactlyOnceWith();
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("keeps the fade-in, tween and transform when appending (native AppendText)", async () => {
    const renderer = createStickerRenderer(40);
    const tweens: Array<{
      durationMs: number;
      step: (progress: number) => void;
      done?: () => void;
    }> = [];
    renderer.tween = vi.fn((durationMs, step, done) => {
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
    expect(view.text.text).toBe("AB");
  });

  it("resets rotation and scale on re-show and recycle, not on hide", async () => {
    const renderer = createStickerRenderer();
    const root = await showSticker(renderer);
    renderer.tween = vi.fn((_ms, _step, done) => {
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
    renderer.tween = vi.fn((_ms, step) => {
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
    vi.useFakeTimers();
    try {
      const renderer = createStickerRenderer();
      renderer.app = {};
      const tweens: Array<{
        step: (progress: number) => void;
        done?: () => void;
      }> = [];
      renderer.tween = vi.fn((_ms, step, done) => {
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
      await vi.advanceTimersByTimeAsync(100);
      expect(firstDone).not.toHaveBeenCalled();
      expect(secondDone).toHaveBeenCalledTimes(1);
      expect(b.text.text).toBe("bb");
      expect(b.isTyping).toBe(false);
      b.destroy();
    } finally {
      vi.useRealTimers();
    }
  });
});
