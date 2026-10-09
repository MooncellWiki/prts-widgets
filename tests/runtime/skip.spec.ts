import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("nofirstskip handles first-read skip by jumping to the next protected anchor", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[delay(time=30)]",
        '[skipnode(mode="nofirstskip")]',
        '[showitem(image="avg_npc_1",x=10,y=20)]',
        '[skipnode(mode="skip")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_timer");
    expect(runtime.canSkipNode()).toBe(true);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(30_000);

    await runtime.skipNode();
    await startPromise;
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it("does not lose the active process loop while skip cleanup is asynchronous", async () => {
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    vi.spyOn(renderer, "clearInterludes").mockReturnValue(cleanup);
    const runtime = new StoryRuntime(
      createContext([
        "[delay(time=30)]",
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    const skipPromise = runtime.skipNode();
    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_timer");
    finishCleanup();
    await skipPromise;
    await startPromise;

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("nofirstskip permits skip after the story has been read", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="nofirstskip")]',
        '[video(res="video/02.mp4")]',
        '[skipnode(mode="skip")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { firstRead: false },
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_video");
    expect(runtime.canSkipNode()).toBe(true);

    await runtime.skipNode();
    await startPromise;

    expect(renderer.videoStopped).toBe(true);
    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("maps unrecognized skipnode modes to can-skip like native CalSkipMode", async () => {
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[skipnode(mode="later")]', '[name="A"]ok']),
      new FakeRenderer(),
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    expect(warnings).toEqual([]);
    expect(runtime.canSkipNode()).toBe(true);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("skipnode can finish the story from a dialogue input wait", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]hello',
        '[skipnode(mode="skip")]',
        '[name="B"]next',
      ]),
      renderer,
      new FakeAudio(),
      {
        sleep,
        typingIntervalMs: 30,
      },
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.canSkipNode()).toBe(true);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "" });

    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("prioritizes SkipToThis, resumes after its anchor, and clears the timer sticker instantly", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]before', "[SkipToThis]", '[name="B"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });
    // Native skip routes through StickerPanel.OnReset → _RecycleStickers,
    // whose first step is AVGTimerView.StopTimer(0): instant hide.
    expect(renderer.timerClearCalls).toEqual([{ durationMs: 0 }]);
  });

  it("resets auto play mode to default after a SkipToThis jump", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[name="A"]before',
          "[SkipToThis]",
          '[name="B"]after',
          '[name="C"]later',
        ]),
        renderer,
        new FakeAudio(),
      );

      await runtime.start();
      runtime.setAutoPlayMode("button_auto");
      expect(runtime.getAutoPlayState().mode).toBe("button_auto");

      await runtime.skipNode();

      // Native SkipStory tail: set_autoPlayMode(DEFAULT) + stop the auto
      // coroutine, so auto playback does not continue past the anchor.
      expect(runtime.getAutoPlayState().mode).toBe("default");
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

      // The cancelled button-auto click never fires; "later" only shows on a
      // manual advance.
      await vi.advanceTimersByTimeAsync(5000);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

      await runtime.advance();
      expect(renderer.lastDialogue).toEqual({ speaker: "C", text: "later" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resets quick play mode to default after a SkipToThis jump", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[name="A"]before',
          "[SkipToThis]",
          '[name="B"]after',
          '[name="C"]later',
        ]),
        renderer,
        new FakeAudio(),
      );

      // Quick play is enabled before playback starts (switching while a line
      // waits for input emits the immediate quick click and advances past the
      // anchor, so the jump window would be gone).
      runtime.setAutoPlayMode("quick_play");
      await runtime.start();
      expect(runtime.getAutoPlayState().mode).toBe("quick_play");

      // Quick gear 0 types at 10ms/char: letting the clock run finishes the
      // line and leaves the 200ms quick auto click pending.
      await vi.advanceTimersByTimeAsync(150);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "before" });

      await runtime.skipNode();

      expect(runtime.getAutoPlayState().mode).toBe("default");
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

      // The cancelled quick click never fires; "later" only shows on a manual
      // advance.
      await vi.advanceTimersByTimeAsync(5000);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

      await runtime.advance();
      expect(renderer.lastDialogue).toEqual({ speaker: "C", text: "later" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("finishes the interrupted line and ends its command on skip", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext(['[name="A"]abcd', "[SkipToThis]", '[name="B"]next']),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      expect(renderer.lastDialogue.text).toBe("");
      await runtime.skipNode();

      // SkipStory ForceEnd()s the waiting dialog: ForceCommandEnd is
      // TryFinish (the full line lands) + _RestoreMessageWidth.
      expect(renderer.dialogueTexts).toContain("abcd");
      expect(renderer.finishDialogueCommandCalls).toBe(1);
      expect(renderer.lastDialogue.speaker).toBe("B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an open multiline run across a skip", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[multiline(name="A")]ab',
        "[SkipToThis]",
        '[multiline(name="A")]cd',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    // DialogPanel.ShouldResetOnSkip() is false, so the skip leaves its
    // multiline run and the typewriter's m_message intact: AppendText joins.
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "abcd" });
  });

  it("closes an end=true multiline run on the click that finishes its typing", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[multiline(name="A",end=true)]ab',
          "[SkipToThis]",
          '[multiline(name="A")]cd',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 20 },
      );

      await runtime.start();
      expect(renderer.lastDialogue.text).toBe("");
      await runtime.advance();
      expect(renderer.lastDialogue.text).toBe("ab");

      // _OnClicked checks m_multilineEnd after TryFinish as well, so the run
      // is already closed when the skip lands on the next multiline.
      await runtime.skipNode();
      await vi.advanceTimersByTimeAsync(200);
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "cd" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("disables segment skip when the story has no skip anchors", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]before', '[name="B"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "before" });
  });

  it("does not expose segment skip during an active command without anchors", async () => {
    const sleep = vi.fn(() => new Promise<void>(() => {}));
    const runtime = new StoryRuntime(
      createContext(["[delay(time=30)]", '[name="A"]unreachable']),
      new FakeRenderer(),
      new FakeAudio(),
      { sleep },
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(runtime.getState()).toBe("waiting_timer");
    void startPromise;
  });

  it("does not jump backward after passing SkipToThis", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[SkipToThis]", '[name="A"]after', '[name="B"]later']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("leaves the screen alone when the skip ends the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]hello',
        "[timersticker(x=30,y=90,size=24,time=10)]",
        '[name="B"]next',
        '[skipnode(mode="skip")]',
        '[name="C"]later',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.advance();
    expect(renderer.timerStickerCalls).toHaveLength(1);

    // mode="skip" makes get_isSkippable() true, so SkipStory takes
    // StopStory("Skipped") and returns before _ResetComponentsOnSkip -- native
    // resets no component at all on that fork.
    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(renderer.timerClearCalls).toEqual([]);
    expect(renderer.stickersClearCalls).toEqual([]);
    expect(renderer.subtitleClearCalls).toEqual([]);
    expect(renderer.spellStickerClearCount).toBe(0);
    expect(renderer.clearCharacterCutinCalls).toEqual([]);
  });
});
