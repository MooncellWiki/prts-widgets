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

  // 不再有 quick_play 变体：native 2.7.61 OnSkipBtnClicked（0x183e16ee0）在
  // QUICK_PLAY 下直接丢弃跳过点击，skipNode 对 quick_play 是无操作（见下方
  // 「ignores skip clicks during quick play」），skiptothis 尾部的模式重置只
  // 会经 button_auto 等非快速档路径触达。

  it("leaves theater mode on a SkipToThis jump but keeps its exit restore", async () => {
    vi.useFakeTimers();
    try {
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
      await vi.advanceTimersByTimeAsync(5000);
      expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "after" });

      await runtime.advance();
      expect(renderer.lastDialogue?.speaker).toBe("C");
      // The pre-theater auto state lives outside m_storyCache, so the later
      // [theater(mode=false)] still restores it.
      expect(runtime.getAutoPlayState().mode).toBe("button_auto");
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

    // 不结算挂起 decision 的话这一步永不返回：processLoop 吊在
    // showDecision 上，cursor 移动了也无人消费（native 由 SkipStory 清空
    // m_blockingExecutors 放行命令循环）
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

    await runtime.skipNode();
    await startPromise;

    // Native SkipStory 尾部 set_autoPlayMode(DEFAULT)：decision 结算后不能
    // 再把进面板前缓存的 button_auto 还回去，否则 auto 会越过锚点继续
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getAutoPlayState().mode).toBe("default");
  });

  it("does not settle a decision reached after the player picked the pending one mid-skip", async () => {
    const renderer = new FakeRenderer();
    renderer.holdDecisions = true;
    const runtime = new StoryRuntime(
      createContext([
        '[decision(options="A;B", values="1;2")]', // line 1
        "[SkipToThis]", // line 2
        '[decision(options="C;D", values="3;4")]', // line 3
        '[name="A"]after', // line 4
      ]),
      renderer,
      new FakeAudio(),
    );

    void runtime.start();
    await Promise.resolve();
    expect(runtime.getState()).toBe("waiting_decision");

    // skip 同步段已移动 cursor，随后在 renderer 的清理上 await；玩家趁这
    // 段空隙点掉了第一个 decision，循环从锚点后走到第二个 decision
    const skipPromise = runtime.skipNode();
    renderer.pickDecision({ optionIndex: 1, value: 2 });
    let skipSettled = false;
    void skipPromise.then(() => (skipSettled = true));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();

    // skip 只结算入口取样到的那个 decision：新面板仍在等点击
    expect(renderer.decisionCalls.map((call) => call.options)).toEqual([
      ["A", "B"],
      ["C", "D"],
    ]);
    expect(skipSettled).toBe(false);

    renderer.pickDecision({ optionIndex: 0, value: 3 });
    await skipPromise;
    expect(runtime.getLogPosition().selections).toEqual([
      { decisionId: 1, optionIndex: 1, value: 2 },
      { decisionId: 3, optionIndex: 0, value: 3 },
    ]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
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
    const sleep = vi.fn(() => new Promise<void>(() => {}));
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
      { sleep },
    );

    const startPromise = runtime.start();
    await Promise.resolve();
    runtime.setAutoPlayMode("button_auto");

    // First read hits the nofirstskip anchor: jump past it and resume. The
    // skipnode branch never touches the auto mode -- only the skiptothis
    // tail resets it -- so button_auto survives the jump (the armed auto
    // click uses the mocked never-resolving sleep and cannot fire here).
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
