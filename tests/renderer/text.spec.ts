import { Text } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { TweenRunner } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import { createManualClock, createRenderer } from "../helpers/rendererFixtures";

describe("PixiStoryRenderer", () => {
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
    const sticker = renderer.stickerTexts.get("a");
    expect(sticker.text).toBe("");
    expect(renderer.stickerTypingTargets.has("a")).toBe(true);

    // Hide mid-typing: native runs TryFinishType before HideSticker, so the
    // full text appears instantly and is what fades out.
    const hiding = renderer.clearSticker("a", 150);
    expect(sticker.text).toBe("hello");
    expect(renderer.stickerTypingTargets.has("a")).toBe(false);

    (finishFade as unknown as () => void)();
    await hiding;
    expect(sticker.text).toBe("");
    expect(sticker.visible).toBe(false);
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
      const sticker = renderer.stickerTexts.get("a");
      expect(sticker.text).toBe("he");

      // _RecycleStickers (stickerclear / skip reset) calls HideSticker(0)
      // with no TryFinishType: the partial text is what fades out.
      await renderer.clearStickers(150);
      expect(sticker.text).toBe("he");
      expect(renderer.stickerTypingTargets.has("a")).toBe(false);
      await vi.advanceTimersByTimeAsync(200);
      expect(sticker.text).toBe("he");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports sticker typing end only when the typewriter finishes on its own", async () => {
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
  renderer.subtitleText = new Text({
    style: renderer.createOverlayTextStyle(24, 1280),
    text: "",
  });
  renderer.subtitleText.visible = false;
  renderer.app = {};
  renderer.layoutSubtitle = vi.fn();
  // Count the fades, but keep the real runner behind the spy: stubbing the
  // tween out entirely hides whether the alpha ever reaches its terminal value.
  const original = renderer.tween.bind(renderer);
  const tween = vi.fn((...args: unknown[]) => original(...args));
  renderer.tween = tween;
  return { manual, renderer, tween };
}

describe("PixiStoryRenderer subtitle", () => {
  const baseInput = {
    alignment: "left" as const,
    delayMs: 0,
    sizePx: 24,
    text: "hello",
    widthPx: 1280,
    x: 0,
    y: 100,
  };

  it("fades a hidden subtitle in but never replays the fade for consecutive ones", async () => {
    const { manual, renderer, tween } = createSubtitleRenderer();
    const subtitle = renderer.subtitleText;

    await renderer.setSubtitle({ ...baseInput });
    expect(subtitle.visible).toBe(true);
    expect(tween).toHaveBeenCalledTimes(1);
    expect(tween.mock.calls[0][0]).toBe(150);
    manual.advance(150);
    manual.drainFrame();
    expect(subtitle.alpha).toBe(1);

    tween.mockClear();
    await renderer.setSubtitle({ ...baseInput, text: "world" });
    // Native `_SetHiddenInternal`: set_isHidden(false) is a no-op while the
    // panel is already visible -- seamless text swap, no second fade-in.
    expect(tween).not.toHaveBeenCalled();
    expect(subtitle.text).toBe("world");
    expect(subtitle.alpha).toBe(1);

    // After a real hide, the next subtitle fades in again.
    await renderer.clearSubtitle(0);
    expect(subtitle.visible).toBe(false);
    await renderer.setSubtitle({ ...baseInput, text: "again" });
    expect(tween).toHaveBeenCalledTimes(1);
    expect(subtitle.text).toBe("again");
  });

  it("lets an interrupted fade-in finish instead of stranding the alpha", async () => {
    const { manual, renderer, tween } = createSubtitleRenderer();
    const subtitle = renderer.subtitleText;

    await renderer.setSubtitle({ ...baseInput });
    manual.advance(30);
    manual.drainFrame();
    expect(subtitle.alpha).toBeCloseTo(0.2);

    // quick_play schedules its auto click 25-100ms apart, so the next subtitle
    // routinely lands inside the 150ms fade. Native's no-op set_isHidden(false)
    // never reaches DOKill, so the running DOFade keeps going to 1.
    await renderer.setSubtitle({ ...baseInput, text: "world" });
    expect(tween).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i += 1) {
      manual.advance(50);
      manual.drainFrame();
    }
    expect(subtitle.alpha).toBe(1);
  });

  it("types against a transparent tail so the full-text layout is fixed from t0", async () => {
    vi.useFakeTimers();
    try {
      const { renderer } = createSubtitleRenderer();
      const onTypingComplete = vi.fn();

      const pending = renderer.setSubtitle({
        ...baseInput,
        delayMs: 10,
        onTypingComplete,
      });
      const subtitle = renderer.subtitleText;
      // t0 already carries the whole message as a hidden span, so wrapping
      // matches the final layout instead of re-flowing per character.
      expect(subtitle.text).toBe("<_c00000000>hello</_c00000000>");
      // PIXI's tagged-text shadow pass forces an opaque fill and ignores the
      // run's own, so the tail has to opt out of the drop shadow or every
      // unrevealed character shows up as legible grey ghosting.
      expect(subtitle.style.tagStyles._c00000000).toEqual({
        dropShadow: false,
        fill: "#00000000",
      });
      await vi.advanceTimersByTimeAsync(10);
      expect(subtitle.text).toBe("h<_c00000000>ello</_c00000000>");
      await vi.advanceTimersByTimeAsync(40);
      expect(subtitle.text).toBe("hello");
      await pending;

      expect(onTypingComplete).toHaveBeenCalledTimes(1);
      expect(renderer.subtitleTypingTarget).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports instant subtitles as finished and applies per-line alignment", async () => {
    const { renderer } = createSubtitleRenderer();
    const onTypingComplete = vi.fn();

    await renderer.setSubtitle({
      ...baseInput,
      alignment: "center",
      onTypingComplete,
    });

    expect(onTypingComplete).toHaveBeenCalledTimes(1);
    // Native TextAnchor.UpperCenter aligns every wrapped line, not just the
    // block.
    expect(renderer.subtitleText.style.align).toBe("center");
  });
});

// happy-dom cannot measure pixi Text fonts, so the sticker slot becomes a
// plain transform object; stickerTween only touches x/y/alpha/rotation.
function createStickerRenderer(): any {
  const renderer = createRenderer();
  renderer.ensureStickerText = vi.fn((id: string) => {
    let sticker = renderer.stickerTexts.get(id);
    if (!sticker) {
      sticker = { alpha: 1, rotation: 0, visible: false, x: 0, y: 0 };
      renderer.stickerTexts.set(id, sticker);
    }
    return sticker;
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
  return renderer.stickerTexts.get("st");
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
    // which kills m_seq (TweenExtensions.Kill); bumpStickerSessions mirrors it.
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
