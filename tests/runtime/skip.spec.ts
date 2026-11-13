import { setImmediate } from "node:timers/promises";

import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type {
  RuntimeWarning,
  StoryMetadata,
  StoryShowItemSlot,
} from "../../src/widgets/StoryPlayer/engine/types";

function storyMetadata(overrides: Partial<StoryMetadata> = {}): StoryMetadata {
  return {
    args: {},
    characterSortType: "BY_GAIN_TIME_DOWN",
    denyAutoSwitchScene: false,
    dontClearGameObjectPoolOnStart: false,
    fitMode: "DEFAULT",
    id: "",
    isAutoable: true,
    isSkippable: true,
    isTutorial: false,
    isVideoOnly: false,
    title: "",
    ...overrides,
  };
}

describe("StoryRuntime", () => {
  it("nofirstskip handles first-read skip by jumping to the next protected anchor", async () => {
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
    );

    const startPromise = runtime.start();

    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_timer");
    expect(runtime.canSkipNode()).toBe(true);

    await runtime.skipNode();
    await startPromise;
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
  });

  it.each([
    { skipAtMs: 20, beforeSkip: [20], afterSkip: [16, 16], remainingMs: 1530 },
    {
      skipAtMs: 540,
      beforeSkip: [41, 16, 483],
      afterSkip: [],
      remainingMs: 1047,
    },
  ])(
    "carries the auto click across a protected skip at $skipAtMs ms",
    async ({ beforeSkip, afterSkip, remainingMs }) => {
      const renderer = new FakeRenderer();
      renderer.frames.manual = true;
      const runtime = new StoryRuntime(
        createContext([
          '[subtitle(text="A")]',
          '[skipnode(mode="nofirstskip")]',
          "[stickerclear(block=true)]",
          '[name="B"]after',
        ]),
        renderer,
        new FakeAudio(),
      );
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      await renderer.frames.advance(...beforeSkip);
      const skipping = runtime.skipNode();
      await setImmediate();
      await renderer.frames.advance(afterSkip[0] ?? 0);
      await skipping;
      expect(runtime.getAutoPlayState().mode).toBe("button_auto");
      expect(runtime.getState()).toBe("waiting_input");

      // The subtitle captures a 1530ms wait at type-end, or when
      // ForceCommandEnd reveals it during the jump.
      await renderer.frames.advance(...afterSkip.slice(1), remainingMs - 1);
      expect(renderer.lastDialogue.speaker).toBe("");
      await renderer.frames.advance(1, 16, 16);
      expect(renderer.lastDialogue.speaker).toBe("B");
      runtime.destroy();
    },
  );

  it("waits for asynchronous skip cleanup before resuming a skipped delay", async () => {
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
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
        firstRead: false,
        sleep,
        typingIntervalMs: 30,
      },
    );

    await runtime.start();

    // Replay: CheckIfSkippableInCurMode allows nofirstskip once !isFirstRead,
    // so the button stays available while "hello" waits and the skip dequeues
    // the trailing skip anchor into a whole-story stop.
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.canSkipNode()).toBe(true);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "" });

    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("keeps the skip affordance hidden inside a nofirstskip segment on first read", async () => {
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
    );

    const startPromise = runtime.start();
    await Promise.resolve();

    // Native port: _UpdateSkipStatus (2.7.81 VA 0x183F934E0) drives the skip
    // button with get_isSkippable, whose CheckIfSkippableInCurMode term turns
    // false once the nofirstskip anchor executed on a first read. The button
    // is gone for the whole locked segment -- without this gate the click
    // would dequeue the trailing skip anchor and end the story, letting a
    // first read skip the very video nofirstskip is meant to protect.
    expect(runtime.getState()).toBe("waiting_video");
    expect(runtime.canSkipNode()).toBe(false);

    await runtime.skipNode();

    // No-op, exactly like clicking a button that is not there.
    expect(runtime.getState()).toBe("waiting_video");
    void startPromise;
  });

  it("re-enables the skip affordance once the trailing skip anchor executes", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]locked',
        '[skipnode(mode="skip")]',
        '[name="B"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "locked" });
    expect(runtime.canSkipNode()).toBe(false);

    // _ExecuteSkipNode on the trailing anchor runs UpdateStorySkipMode, whose
    // _UpdateSkipStatus call brings the button back with curSkipMode=skip.
    await runtime.advance();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "ok" });
    expect(runtime.canSkipNode()).toBe(true);
  });

  it("prioritizes SkipToThis, resumes after its anchor, and queues a zero-duration timer clear", async () => {
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
    // whose first step queues AVGTimerView.StopTimer(0).
    expect(renderer.timerClearCalls).toEqual([{ durationMs: 0 }]);
  });

  it("cancels a queued skip continuation when the player is destroyed", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext(['[name="A"]before', "[SkipToThis]", '[name="B"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    const skipping = runtime.skipNode();
    await setImmediate();
    runtime.destroy();
    await skipping;

    await renderer.frames.advance(16);
    expect(runtime.getDisplayedLineIndex()).toBe(1);
  });

  it.each([true, false])(
    "only force-finishes a blocking sticker on skip (block=%s)",
    async (block) => {
      const renderer = new FakeRenderer();
      const finishTyping = vi.spyOn(renderer, "finishStickerTyping");
      const recycle = vi
        .spyOn(renderer, "clearStickers")
        .mockImplementationOnce(() => {
          expect(finishTyping.mock.calls.map(([id]) => id)).toEqual([
            "background",
            "current",
          ]);
        });
      const runtime = new StoryRuntime(
        createContext([
          '[sticker(id="background",text="background",delay=0.04,block=false)]',
          `[sticker(id="current",text="HELLO",delay=0.04,block=${block})]`,
          '[name="A"]before',
          "[SkipToThis]",
          '[name="B"]after',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 40 },
      );

      await runtime.start();
      expect(finishTyping.mock.calls.map(([id]) => id)).toEqual(
        block ? ["background"] : ["background", "current"],
      );
      await runtime.skipNode();

      expect(recycle).toHaveBeenCalledExactlyOnceWith(150);
      expect(renderer.lastDialogue.speaker).toBe("B");
      runtime.destroy();
    },
  );

  it("resets auto play mode to default after a SkipToThis jump", async () => {
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
    await renderer.frames.advance(16, 16, 5000, 16, 16);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

    await runtime.advance();
    expect(renderer.lastDialogue).toEqual({ speaker: "C", text: "later" });
  });

  // 不再有 quick_play 变体：native 2.7.61 OnSkipBtnClicked（0x183e16ee0）在
  // QUICK_PLAY 下直接丢弃跳过点击，skipNode 对 quick_play 是无操作（见下方
  // 「ignores skip clicks during quick play」），skiptothis 尾部的模式重置只
  // 会经 button_auto 等非快速档路径触达。

  it("leaves theater mode on a SkipToThis jump but keeps its exit restore", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[theater]",
        '[name="A"]before',
        "[SkipToThis]",
        '[name="B"]after',
        "[theater(mode=false)]",
        '[name="C"]later',
      ]),
      renderer,
      new FakeAudio(),
    );

    runtime.setAutoPlayMode("button_auto");
    await runtime.start();
    expect(renderer.lastDialogue?.speaker).toBe("A");

    await runtime.skipNode();

    expect(runtime.getAutoPlayState().mode).toBe("default");
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

    // Native zeroes isTheaterMode along with the rest of m_storyCache: no
    // auto click fires, and a click advances instead of being swallowed.
    await renderer.frames.advance(16, 16, 5000, 16, 16);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

    await runtime.advance();
    expect(renderer.lastDialogue?.speaker).toBe("C");
    // The pre-theater auto state lives outside m_storyCache, so the later
    // [theater(mode=false)] still restores it.
    expect(runtime.getAutoPlayState().mode).toBe("button_auto");
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

  it.each([
    { phase: "before frame end", framesBeforeSkip: [], finishedBeforeSkip: 0 },
    { phase: "after frame end", framesBeforeSkip: [16], finishedBeforeSkip: 1 },
  ])(
    "cancels a pending advance on a skip $phase",
    async ({ framesBeforeSkip, finishedBeforeSkip }) => {
      const renderer = new FakeRenderer();
      renderer.frames.manual = true;
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
      try {
        await runtime.start();
        renderer.frames.step(16);
        const clicked = runtime.advance();
        await renderer.frames.advance(...framesBeforeSkip);
        expect(renderer.finishDialogueCommandCalls).toBe(finishedBeforeSkip);

        const skipping = runtime.skipNode();
        await setImmediate();
        await renderer.frames.advance(16);
        await skipping;
        await clicked;
        renderer.frames.step(16);
        expect(renderer.finishDialogueCommandCalls).toBe(1);
        expect(runtime.getState()).toBe("waiting_input");
        expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });
      } finally {
        runtime.destroy();
      }
    },
  );

  it("keeps an open multiline run across a skip during typing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[multiline(name="A",delay=0.08)]ab',
        "[SkipToThis]",
        '[multiline(name="B",delay=0.04)]cd',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 20 },
    );

    await runtime.start();
    renderer.frames.step(10);
    expect(renderer.lastDialogue.text).toBe("");

    // ForceCommandEnd reveals "ab" and the new command appends to it.
    await runtime.skipNode();
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "ab" });

    // Only the landing command can update the view after the jump.
    renderer.frames.step(20);
    renderer.frames.step(20);
    expect(renderer.dialogueTexts).toEqual(["", "ab", "ab", "abc", "abcd"]);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "abcd" });
  });

  it("closes an end=true multiline run on the click that finishes its typing", async () => {
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
    renderer.frames.step(200);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "cd" });
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
    const runtime = new StoryRuntime(
      createContext(["[delay(time=30)]", '[name="A"]unreachable']),
      new FakeRenderer(),
      new FakeAudio(),
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(runtime.getState()).toBe("waiting_timer");
    runtime.destroy();
    await startPromise;
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

  it("resets the timer, stickers and subtitle when the skip ends the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]hello',
        '[sticker(id="left",text="still here",block=false)]',
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
    expect(renderer.stickerCalls).toHaveLength(1);
    expect(renderer.timerStickerCalls).toHaveLength(1);

    // mode="skip" makes get_isSkippable() true, so SkipStory takes
    // StopStory("Skipped") and returns before _ResetComponentsOnSkip.
    // The later OnStoryEnd reset reaches both StickerPanel and SubtitlePanel.
    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(renderer.timerClearCalls).toEqual([{ durationMs: 0 }]);
    expect(renderer.stickersClearCalls).toEqual([0]);
    expect(renderer.subtitleClearCalls).toEqual([0]);
    expect(renderer.spellStickerClearCount).toBe(0);
    expect(renderer.clearCharacterCutinCalls).toEqual([]);
  });

  it("cancels the natural end wait when skipping the story", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext(['[skipnode(mode="skip")]', "[timersticker(time=60)]"]),
      renderer,
      new FakeAudio(),
    );

    try {
      const started = runtime.start();
      await setImmediate();
      await renderer.frames.advance(16, 100);
      expect(runtime.getState()).toBe("waiting_timer");
      expect(renderer.timerClearCalls).toEqual([]);

      await runtime.skipNode();
      await started;
      expect(runtime.getState()).toBe("finished");
      expect(renderer.timerClearCalls).toEqual([{ durationMs: 0 }]);

      await renderer.frames.advance(200);
      expect(renderer.timerClearCalls).toHaveLength(1);
    } finally {
      runtime.destroy();
    }
  });

  it("settles a pending decision when skipping so the command loop resumes", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]', // line 1，挂起等点击
        '[skipnode(mode="nofirstskip")]', // line 2，首读保护锚点
        '[name="A"]after', // line 3
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();
    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_decision");
    expect(runtime.canSkipNode()).toBe(true);

    // 跳段关闭挂起的决策并放行命令循环。2791 SkipStory 清空
    // m_blockingExecutors，Web 同时关闭等待中的视图。
    await runtime.skipNode();
    await startPromise;

    // 未点击结算：value=0（闸门全开）、不记选择历史
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
    expect(runtime.getDecisionSelectValue()).toBe(0);
    expect(runtime.getLogPosition().selections).toEqual([]);
  });

  it("finishes the story when skipping past a pending decision to the end", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="skip")]',
        '[decision(options="A;B", values="1;2")]',
        '[name="A"]tail',
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();
    await Promise.resolve();

    expect(runtime.getState()).toBe("waiting_decision");

    await runtime.skipNode();
    await startPromise;

    expect(runtime.getState()).toBe("finished");
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("keeps the SkipToThis auto play reset when settling a pending decision", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]',
        "[SkipToThis]",
        '[name="B"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    runtime.setAutoPlayMode("button_auto");
    const startPromise = runtime.start();
    await Promise.resolve();
    expect(runtime.getState()).toBe("waiting_decision");
    expect(runtime.getAutoPlayState().mode).toBe("button_auto");

    await runtime.skipNode();
    await startPromise;

    // Native SkipStory resets to DEFAULT before resuming at the destination.
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getAutoPlayState().mode).toBe("default");
  });

  it("cancels a selected decision's pending frame-end completion on skip", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    let endFrame: (() => void) | undefined;
    const cancel = vi.fn();
    vi.spyOn(renderer, "onFrameEnd").mockImplementationOnce((callback) => {
      endFrame = callback;
      return cancel;
    });
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]',
        "[SkipToThis]",
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    renderer.pickDecision({ optionIndex: 1, value: 2 });
    await runtime.skipNode();
    await started;

    expect(cancel).toHaveBeenCalledExactlyOnceWith();
    endFrame?.();
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(3);
    expect(runtime.getDecisionSelectValue()).toBe(2);
    runtime.destroy();
  });

  it("cleans up before rendering the destination when a decision is picked mid-skip", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const clearStickers = vi.spyOn(renderer, "clearStickers");
    const showSticker = vi.spyOn(renderer, "setSticker");
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]',
        "[SkipToThis]",
        '[sticker(id="target", text="target", block=false)]',
        '[decision(options="C;D", values="3;4")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    void runtime.start();
    await Promise.resolve();
    expect(runtime.getState()).toBe("waiting_decision");

    // The old choice can settle while the skip is still resetting components.
    const skipPromise = runtime.skipNode();
    renderer.pickDecision({ optionIndex: 1, value: 2 });
    let skipSettled = false;
    void skipPromise.then(() => (skipSettled = true));
    await vi.waitFor(() => expect(renderer.decisionCalls).toHaveLength(2));

    expect(clearStickers).toHaveBeenCalledBefore(showSticker);
    expect(renderer.decisionCalls.map((call) => call.options)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
    expect(runtime.getState()).toBe("waiting_decision");
    expect(skipSettled).toBe(false);

    renderer.pickDecision({ optionIndex: 0, value: 3 });
    await skipPromise;
    expect(runtime.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 1, value: 2 },
      { decisionId: 4, optionIndex: 0, value: 3 },
    ]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("discards an input wait returned by the command that was skipped", async () => {
    let finishSticker!: () => void;
    const sticker = new Promise<void>((resolve) => {
      finishSticker = resolve;
    });
    const renderer = new FakeRenderer();
    vi.spyOn(renderer, "setSticker").mockReturnValueOnce(sticker);
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="old", text="old", block=true)]',
        "[SkipToThis]",
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    const skipped = runtime.skipNode();
    finishSticker();
    await Promise.all([started, skipped]);

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("lets the destination hideitem start before the old showitem fade finishes", async () => {
    const renderer = new FakeRenderer();
    const show = vi.fn<StoryShowItemSlot["show"]>(async () => {});
    const hide = vi.fn<StoryShowItemSlot["hide"]>();
    const destroy = vi.fn();
    vi.spyOn(renderer, "createShowItemSlot").mockReturnValue({
      show,
      hide,
      destroy,
    });
    const runtime = new StoryRuntime(
      createContext([
        '[showitem(image="item_a")]',
        '[name="A"]skipped',
        "[SkipToThis]",
        "[hideitem(fadetime=0.25)]",
        '[name="B"]after',
        "[hideitem]",
        '[name="B"]next',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    expect(show).toHaveBeenCalledTimes(1);
    const skipped = runtime.skipNode();
    await setImmediate();

    // SkipStory clears the blocker and leaves the slot for the destination.
    expect(hide).toHaveBeenCalledExactlyOnceWith(
      { fadetime: 0.25 },
      expect.any(Function),
    );
    expect(renderer.lastDialogue.speaker).toBe("");

    hide.mock.calls[0]![1]();
    await Promise.all([started, skipped]);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

    await runtime.advance();
    expect(hide).toHaveBeenCalledTimes(1);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "next" });
  });

  it.each(["showitem", "hideitem"])(
    "clears the item slot when a skip ends the story during %s",
    async (command) => {
      const renderer = new FakeRenderer();
      const isHide = command === "hideitem";
      const show: StoryShowItemSlot["show"] = async (_args, _key, finish) => {
        if (isHide) finish();
      };
      const hide = vi.fn<StoryShowItemSlot["hide"]>();
      const destroy = vi.fn();
      vi.spyOn(renderer, "createShowItemSlot").mockReturnValue({
        show,
        hide,
        destroy,
      });
      const runtime = new StoryRuntime(
        createContext([
          '[skipnode(mode="skip")]',
          '[showitem(image="item_a")]',
          ...(isHide ? ["[hideitem]"] : []),
          '[name="A"]skipped',
          '[skipnode(mode="skip")]',
          '[name="B"]unreachable',
        ]),
        renderer,
        new FakeAudio(),
      );

      const started = runtime.start();
      await setImmediate();
      expect(runtime.getState()).toBe("running");
      expect(hide).toHaveBeenCalledTimes(isHide ? 1 : 0);
      expect(destroy).not.toHaveBeenCalled();

      const skipped = runtime.skipNode();
      await setImmediate();
      expect(runtime.getState()).toBe("finished");
      expect(destroy).toHaveBeenCalledTimes(1);
      await Promise.all([started, skipped]);
      expect(hide).toHaveBeenCalledTimes(isHide ? 1 : 0);
    },
  );

  it("drops the click follow-up of a skipped blocking spellsticker", async () => {
    let finishSticker!: () => void;
    const sticker = new Promise<number>((resolve) => {
      finishSticker = () => resolve(1750);
    });
    const renderer = new FakeRenderer();
    vi.spyOn(renderer, "setSpellSticker").mockReturnValueOnce(sticker);
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="s",block=true)]<p=1>old</>',
        "[SkipToThis]",
        '[spellsticker(id="s",block=false)]<p=1>new</>',
        '[name="A"]after',
        '[name="A"]next',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    const skipped = runtime.skipNode();
    finishSticker();
    await Promise.all([started, skipped]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });

    await runtime.advance();
    const advancing = runtime.advance();
    await renderer.frames.advance(16, 16, 16, 200);
    await advancing;

    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "next" });
    // The destination sticker shares the id; the stale hide must not land.
    expect(renderer.spellStickerHideCalls).toEqual([]);
  });

  it("releases a pending decision if skip cleanup rejects", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    vi.spyOn(renderer, "clearInterludes").mockRejectedValueOnce(
      new Error("reset failed"),
    );
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]',
        "[SkipToThis]",
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    const started = runtime.start();
    await expect(runtime.skipNode()).rejects.toThrow("reset failed");
    await started;

    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
    expect(runtime.getLogPosition().selections).toEqual([]);
  });

  it("gates skipping on header is_skippable instead of is_tutorial (2.7.61 get_isSkippable)", async () => {
    // Forward-looking: a skipnode-only story whose HEADER carries
    // is_tutorial=true AND is_skippable=true. No current corpus file has this
    // shape -- the one tutorial story with skipnode anchors,
    // training_act50side_01_b, also carries [SkipToThis], so SkipStory takes
    // that branch instead (see the SkipToThis-shape test below). Native
    // AVGController.get_isSkippable only consults story.isSkippable, so the
    // skip must stop the whole story here; the old !isTutorial gate would
    // wrongly resume at the anchor. firstRead=false keeps the click
    // reachable: with a live first read the native button would already be
    // hidden inside the nofirstskip segment.
    const renderer = new FakeRenderer();
    const context = createContext([
      '[skipnode(mode="nofirstskip")]',
      '[name="A"]x',
      '[skipnode(mode="skip")]',
      '[name="B"]y',
    ]);
    context.storyMetadata = storyMetadata({
      isSkippable: true,
      isTutorial: true,
    });
    const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
      firstRead: false,
    });

    await runtime.start();
    await runtime.skipNode();

    expect(runtime.getState()).toBe("finished");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "x" });
  });

  it("guards a nofirstskip segment ahead of SkipToThis on first read (training_act50side_01_b shape)", async () => {
    // Corpus shape: [header(is_skippable=true, is_tutorial=true)], skipnode
    // nofirstskip L2 / skip L20 / nofirstskip L32, then [SkipToThis] L33.
    // SkipStory's SkipToThis branch never consults the skip mode, so the
    // only thing keeping a first read from jumping over the locked L2-L19
    // segment is the _UpdateSkipStatus button gate.
    const renderer = new FakeRenderer();
    const context = createContext([
      '[skipnode(mode="nofirstskip")]',
      '[name="A"]locked',
      '[skipnode(mode="skip")]',
      '[name="B"]open',
      '[skipnode(mode="nofirstskip")]',
      "[SkipToThis]",
      '[name="C"]after',
    ]);
    context.storyMetadata = storyMetadata({
      isSkippable: true,
      isTutorial: true,
    });
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());

    await runtime.start();

    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "locked" });
    expect(runtime.canSkipNode()).toBe(false);
    await runtime.skipNode();
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "locked" });

    // The L20-style skip anchor reopens the button; the click then takes the
    // SkipToThis branch past the trailing nofirstskip anchor.
    await runtime.advance();
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "open" });
    expect(runtime.canSkipNode()).toBe(true);

    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "C", text: "after" });
    expect(runtime.canSkipNode()).toBe(false);
  });

  it("keeps the skip affordance hidden when header marks the story unskippable", async () => {
    const renderer = new FakeRenderer();
    const context = createContext([
      '[skipnode(mode="skip")]',
      '[name="A"]x',
      '[skipnode(mode="skip")]',
      '[name="B"]y',
    ]);
    context.storyMetadata = storyMetadata({ isSkippable: false });
    const runtime = new StoryRuntime(context, renderer, new FakeAudio(), {
      firstRead: false,
    });

    await runtime.start();

    // Native hides the skip button for is_skippable=false stories outright
    // (get_isSkippable -> _UpdateSkipStatus), and OnSkipBtnClicked re-checks
    // story.isSkippable, so no skip path exists at all. The runtime keeps the
    // same re-check inside skipNode() as defense in depth, but the entry gate
    // must already report the button as absent.
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.canSkipNode()).toBe(false);

    await runtime.skipNode();

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "x" });
  });

  it("keeps the auto play mode on a skipnode label jump", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        "[delay(time=30)]",
        '[skipnode(mode="nofirstskip")]',
        '[name="A"]x',
        '[skipnode(mode="skip")]',
        '[name="B"]y',
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    runtime.setAutoPlayMode("button_auto");

    // First read hits the nofirstskip anchor: jump past it and resume. The
    // skipnode branch never touches the auto mode -- only the skiptothis
    // tail resets it -- so button_auto survives the jump.
    await runtime.skipNode();
    await startPromise;

    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue?.speaker).toBe("A");
    expect(runtime.getAutoPlayState().mode).toBe("button_auto");
  });

  it("keeps the auto play mode when the skipnode branch ends the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]x', '[skipnode(mode="skip")]', '[name="B"]y']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    runtime.setAutoPlayMode("button_auto");
    await runtime.skipNode();

    // Same branch, whole-story stop fork: native takes StopStory("Skipped")
    // and returns before any auto reset.
    expect(runtime.getAutoPlayState().mode).toBe("button_auto");
    expect(runtime.getState()).toBe("finished");
  });

  it("ignores skip clicks during quick play like native OnSkipBtnClicked", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[skipnode(mode="skip")]',
        '[video(res="video/02.mp4")]',
        '[name="A"]x',
      ]),
      renderer,
      new FakeAudio(),
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    expect(runtime.getState()).toBe("waiting_video");
    runtime.setAutoPlayMode("quick_play");
    expect(runtime.canSkipNode()).toBe(true);

    await runtime.skipNode();

    // Quick play swallows the skip request entirely: the video keeps waiting.
    expect(runtime.getState()).toBe("waiting_video");

    runtime.setAutoPlayMode("default");
    await runtime.skipNode();
    await startPromise;
    expect(runtime.getState()).toBe("finished");
  });

  it("reads the skipnode mode key case-sensitively like the native param dictionary", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]x',
        '[skipnode(Mode="nofirstskip")]',
        '[name="B"]y',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.skipNode();

    // Command.param is a Json.NET Dictionary<string, object> with the default
    // ordinal comparer, so AddSkipNode's GetOrDefault("mode", "skip") misses
    // `Mode` and the anchor is CAN_SKIP: even a first read ends the story.
    expect(runtime.getState()).toBe("finished");
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "x" });
  });
});
