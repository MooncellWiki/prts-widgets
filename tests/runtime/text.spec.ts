import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("maps spellsticker parameters and hides the blocking view before advancing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="spell1",style="SAMI",x=-130,y=0,xScale=1.3,yScale=1.2,angle=5,alpha=2,block=true)]<p=1>主</><p=2>副</>',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.spellStickerCalls).toEqual([
      {
        alpha: 1,
        angle: 5,
        content: "<p=1>主</><p=2>副</>",
        id: "spell1",
        style: "SAMI",
        x: -130,
        xScale: 1.3,
        y: 0,
        yScale: 1.2,
      },
    ]);

    await runtime.advance();
    expect(renderer.spellStickerHideCalls).toEqual(["spell1"]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("keeps spellsticker alpha unset when the param is missing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="s",style="sami",block=false)]<p=1>x</>',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // Native _ShowSticker writes CanvasGroup.alpha only via TryGetParam, so
    // the renderer must receive `undefined` (not a forced 1) and let the view
    // keep its previous alpha.
    expect(renderer.spellStickerCalls).toEqual([
      {
        alpha: undefined,
        angle: undefined,
        content: "<p=1>x</>",
        id: "s",
        style: "sami",
        x: undefined,
        xScale: undefined,
        y: undefined,
        yScale: undefined,
      },
    ]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("warns and continues on an empty spellsticker id", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(style="sami",block=true)]<p=1>x</>',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // Native logs "[AVG.SpellSticker] Empty sticker id." and returns false
    // before reading `block`, so the command neither renders nor blocks.
    expect(renderer.spellStickerCalls).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "spellsticker id is empty",
        type: "parse",
      }),
    ]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("keeps spellstickerclear independent and honors block", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(["[spellstickerclear(block=true)]", '[name="A"]after']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.spellStickerClearCount).toBe(1);
    expect(renderer.stickersClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("clears spellstickers when skipping the story", async () => {
    const renderer = new FakeRenderer();
    // nofirstskip on a first read makes get_isSkippable() false, which is the
    // only fork where SkipStory reaches _ResetComponentsOnSkip.
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="s",block=true)]<p=1>x</>',
        '[skipnode(mode="nofirstskip")]',
      ]),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    await runtime.skipNode();
    expect(renderer.spellStickerClearCount).toBe(1);
    expect(renderer.spellStickerHideCalls).toEqual([]);
  });

  it("maps animtext prefab parameters and content without honoring ghost parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[animtext(id="at1",name="group_location_stamp",style="avg_both",pos="-400,-200",block=false,duration=9,type="effect",clear=true)]<p=1>地点</><p=2>时间</>',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.animTextCalls).toEqual([
      {
        block: false,
        content: "<p=1>地点</><p=2>时间</>",
        id: "at1",
        name: "group_location_stamp",
        position: { x: -400, y: -200 },
        style: "avg_both",
      },
    ]);
  });

  it("maps subtitle show and clear commands", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center",size=24,width=400,x=100,y=200,delay=0.1,fadetime=0.2,multi=true)]',
        "[subtitle(fadetime=0.3)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.subtitleCalls).toEqual([
      {
        alignment: "center",
        delayMs: 0,
        onTypingComplete: expect.any(Function),
        sizePx: 24,
        text: "HELLO",
        widthPx: 400,
        x: 100,
        y: 200,
      },
    ]);
    expect(renderer.subtitleClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(1);

    await runtime.advance();
    expect(renderer.subtitleClearCalls).toEqual([150]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(runtime.getDisplayedLineIndex()).toBe(3);
  });

  it("maps sticker and timer sticker commands", async () => {
    const renderer = new FakeRenderer();
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="tip",text="LEFT",alignment="left",size=20,width=200,x=40,y=60,delay=0.05,multi=true,fadetime=0.1)]',
        '[sticker(id="tip",fadetime=0.2)]',
        "[timersticker(x=30,y=90,size=24,time=10)]",
        "[timerclear(afrom=0.8,ato=0.2,duration=0.5)]",
        "[stickerclear]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(renderer.stickerCalls).toEqual([
      {
        alignment: "left",
        // Fresh id takes the show branch even with multi=true; as a multiline
        // show with no duration it keeps a new view's constructor fade, 0.15s.
        append: false,
        // `delay` scales the global typewriter interval (0 here) rather than
        // setting an absolute per-character time.
        delayMs: 0,
        fadeMs: 150,
        id: "tip",
        onTypingComplete: expect.any(Function),
        sizePx: 20,
        text: "LEFT",
        widthPx: 200,
        x: 40,
        y: 60,
      },
    ]);

    // A sticker with a fresh id takes the show branch, whose `block` defaults to
    // true, so it waits for a click before the rest of the script runs.
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();

    expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 150, id: "tip" }]);
    expect(renderer.timerStickerCalls).toEqual([
      {
        durationMs: 1000,
        fromAlpha: 0,
        limitSeconds: 10,
        sizePx: 24,
        toAlpha: 1,
        widthPx: 1280,
        x: 30,
        y: 90,
      },
    ]);
    expect(renderer.timerClearCalls).toEqual([
      {
        durationMs: 500,
      },
      { durationMs: 0 },
    ]);
    expect(renderer.stickersClearCalls).toEqual([150]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("click finishes subtitle typing before advancing", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.typingActive).toBe(true);

    await runtime.advance();
    expect(renderer.typingActive).toBe(false);
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });

    await runtime.advance();
    expect(renderer.lastDialogue.speaker).toBe("A");
  });

  it("auto mode advances a subtitle once its typewriter ends naturally", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[subtitle(text="HELLO",alignment="center")]',
          '[name="A"]ok',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 40 },
      );

      await runtime.start();
      expect(runtime.getState()).toBe("waiting_input");

      runtime.setAutoPlayMode("button_auto");
      // Enabling auto mid-typing must not fire a click before the typewriter
      // has ended (native only raises the auto click from _OnTypeWriterEnd).
      await vi.advanceTimersByTimeAsync(1600);
      expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });

      renderer.finishSubtitleTypingNaturally();
      // Auto wait = 1.5s + messageLength(5) * 0.03s = 1.65s; the subtitle's
      // own length must drive the wait, not the previous message's.
      await vi.advanceTimersByTimeAsync(1649);
      expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.speaker).toBe("A");
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the subtitle immediately when skipping the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center")]',
        '[skipnode(mode="nofirstskip")]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");

    await runtime.skipNode();
    // Native OnReset on skip clears the panel immediately (alpha=0, no fade).
    expect(renderer.subtitleClearCalls).toEqual([0]);
    expect(runtime.getState()).toBe("finished");
  });

  it("uses native sticker id state for show, append, and hide", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="one",x=100,y=200,width=300,size=28,alignment="center",delay=0.08,block=false)]',
        '[sticker(id="a",text="two",multi=true,block=false)]',
        '[sticker(id="a",text="ignored",duration=2,block=false)]',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );

    await runtime.start();

    expect(
      renderer.stickerCalls.map((call) => ({
        alignment: call.alignment,
        append: call.append,
        delayMs: call.delayMs,
        sizePx: call.sizePx,
        text: call.text,
        widthPx: call.widthPx,
        x: call.x,
        y: call.y,
      })),
    ).toEqual([
      {
        alignment: "center",
        append: false,
        delayMs: 80,
        sizePx: 28,
        text: "one",
        widthPx: 300,
        x: 100,
        y: 200,
      },
      // Append reads no layout parameters natively: the stored show layout
      // and typewriter speed are replayed verbatim (no x=0/y=0 jump).
      {
        alignment: "center",
        append: true,
        delayMs: 80,
        sizePx: 28,
        text: "two",
        widthPx: 300,
        x: 100,
        y: 200,
      },
    ]);
    expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 2000, id: "a" }]);
  });

  it("drops an empty-text sticker show without registering the id", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="e",block=true)]',
        '[sticker(id="e",text="late",block=false)]',
        '[name="B"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // The first show dies in _GenParam (empty textContent): no view, no dict
    // entry, and no block — so the second command still takes the show branch.
    expect(renderer.stickerCalls).toEqual([
      expect.objectContaining({ append: false, id: "e", text: "late" }),
    ]);
    expect(renderer.stickerClearCalls).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "B", text: "ok" });
  });

  it("scales an omitted sticker delay by the native _GenParam default", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="x",delay=0.04,block=false)]',
        '[sticker(id="b",text="y",block=false)]',
        '[name="B"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );

    await runtime.start();

    // delay=0.04 is scale 1 against the 0.04s originDelay; an omitted delay
    // falls back to 1.0, i.e. 25x the global typewriter interval (40ms here).
    expect(renderer.stickerCalls.map((call) => call.delayMs)).toEqual([
      40, 1000,
    ]);
  });

  it("keeps a multiline show's previous fade when duration is omitted", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="m",text="first",multi=true,block=false)]',
        '[sticker(id="m",duration=0.5,block=false)]',
        '[sticker(id="m",text="again",multi=true,block=false)]',
        '[name="B"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // A new view starts at the constructor's m_duration 0.15; the reused view
    // keeps the 0.5 its HideSticker wrote.
    expect(renderer.stickerCalls.map((call) => call.fadeMs)).toEqual([
      150, 500,
    ]);
    expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 500, id: "m" }]);
  });

  it("inherits the fade from the shared FIFO recycle pool, not the id", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="st1",text="one",block=false)]',
        '[sticker(id="st2",text="two",block=false)]',
        '[sticker(id="st1",duration=0.5,block=false)]',
        '[sticker(id="st2",duration=1,block=false)]',
        // Pool is [st1's view (0.5), st2's view (1)]: each show takes the head.
        '[sticker(id="st3",text="three",multi=true,block=false)]',
        '[sticker(id="st1",text="four",multi=true,block=false)]',
        // Pool is empty again, so this one instantiates a new view (0.15).
        '[sticker(id="st2",text="five",multi=true,block=false)]',
        "[stickerclear]",
        // stickerclear recycles all three views with HideSticker(0) -> 0.15.
        '[sticker(id="st4",text="six",multi=true,block=false)]',
        '[name="B"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.stickerCalls.map((call) => call.fadeMs)).toEqual([
      150, 150, 500, 1000, 150, 150,
    ]);
  });

  it("auto-advances a blocking sticker by its message length", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[sticker(id="a",text="hello",delay=0)]',
          '[name="B"]after',
        ]),
        renderer,
        new FakeAudio(),
      );
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      expect(runtime.getState()).toBe("waiting_input");

      // RaiseAutoClick(msgLength): button-auto level 1 waits 1.5s + 5 chars *
      // 0.03s before clicking past the sticker (delay=0 prints at once).
      await vi.advanceTimersByTimeAsync(1649);
      expect(renderer.lastDialogue.speaker).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.speaker).toBe("B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("auto-advances a hidden sticker with the base wait only", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[sticker(id="a",text="xy",delay=0,block=false)]',
          '[sticker(id="a",block=true)]',
          '[name="B"]after',
        ]),
        renderer,
        new FakeAudio(),
      );
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      expect(runtime.getState()).toBe("waiting_input");
      expect(renderer.stickerClearCalls).toEqual([{ fadeMs: 150, id: "a" }]);

      // The hide branch raises RaiseAutoClick(0): the base 1.5s only, with no
      // per-character extension.
      await vi.advanceTimersByTimeAsync(1499);
      expect(renderer.lastDialogue.speaker).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.speaker).toBe("B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds the sticker auto click until its typewriter ends", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          // Omitted delay: 25x the 40ms interval, so typing takes 5s natively.
          '[sticker(id="a",text="hello")]',
          '[name="B"]after',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 40 },
      );
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();
      expect(renderer.stickerCalls[0]?.delayMs).toBe(1000);

      // _OnStickerTypeEnd fires only when typing ends, so auto-play must not
      // click through (and cut) the slow typewriter in the meantime.
      await vi.advanceTimersByTimeAsync(4000);
      expect(renderer.typingActive).toBe(true);
      expect(renderer.lastDialogue.speaker).toBe("");

      renderer.finishStickerTypingNaturally();
      await vi.advanceTimersByTimeAsync(1649);
      expect(renderer.lastDialogue.speaker).toBe("");
      await vi.advanceTimersByTimeAsync(1);
      expect(renderer.lastDialogue.speaker).toBe("B");
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a sticker typing end once a later message owns the wait", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new FakeRenderer();
      const runtime = new StoryRuntime(
        createContext([
          '[sticker(id="a",text="hello",block=false)]',
          '[name="B"]after',
          '[name="C"]next',
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 40 },
      );
      runtime.setAutoPlayMode("button_auto");
      await runtime.start();

      // The dialogue finishes typing at 240ms and arms its own 1.65s click.
      await vi.advanceTimersByTimeAsync(1000);
      expect(renderer.lastDialogue.speaker).toBe("B");
      // A stale sticker callback must not re-arm (and so delay) that click.
      renderer.finishStickerTypingNaturally();
      await vi.advanceTimersByTimeAsync(900);
      expect(renderer.lastDialogue.speaker).toBe("C");
    } finally {
      vi.useRealTimers();
    }
  });

  it("maps stickertween parameters and blocks only when block and isend both hold", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="st1",text="hi",block=false)]',
        '[stickertween(id="st1",pto="300,500",pduration=2,ato=0,aduration=1,join=true,isend=true,block=true)]',
        '[stickertween(id="st1",rto=90,rduration=1,isend=true,block=true)]',
        // ParseRotateParam reads `rto` as a bare float, so a Vector3-looking
        // value leaves the group Empty: no tween is pushed at all, yet the
        // block && isend check still fires.
        '[stickertween(id="st1",rto="0,0,45",rduration=1,isend=true,block=true)]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // An omitted `*from` is 0, not the sticker's current value.
    const moveAndFade = {
      alpha: { durationMs: 1000, from: 0, to: 0 },
      id: "st1",
      isend: true,
      join: true,
      position: {
        durationMs: 2000,
        from: { x: 0, y: 0 },
        to: { x: 300, y: 500 },
      },
    };
    expect(renderer.stickerTweenCalls).toEqual([moveAndFade]);

    // Every command holds block && isend, so each waits for a click.
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();

    expect(renderer.stickerTweenCalls).toEqual([
      moveAndFade,
      {
        id: "st1",
        isend: true,
        join: false,
        rotation: { durationMs: 1000, from: 0, to: 90 },
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();

    // The Vector3-shaped rto pushed nothing but still blocked.
    expect(renderer.stickerTweenCalls).toHaveLength(2);
    expect(runtime.getState()).toBe("waiting_input");
    await runtime.advance();
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "after" });
  });

  it("silently skips missing stickertween ids and never blocks without isend", async () => {
    const warnings: RuntimeWarning[] = [];
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        // Empty id and unknown id are native silent no-ops even with block.
        '[stickertween(pto="1,2",isend=true,block=true)]',
        '[stickertween(id="ghost",pto="1,2",isend=true,block=true)]',
        '[sticker(id="a",text="one",block=false)]',
        '[sticker(id="a",block=false)]',
        // After the hide the id left the slot dictionary, so this misses too.
        // It also has block=true without isend, which native never blocks on.
        '[stickertween(id="a",ato=1,aduration=1,block=true)]',
        '[name="A"]done',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.stickerTweenCalls).toEqual([]);
    expect(warnings).toEqual([]);
    expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "done" });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("scales stickertween durations by the animate ratio", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="s",text="x",block=false)]',
        '[stickertween(id="s",pto="10,20",pduration=2,ato=1,aduration=1,isend=true)]',
        '[name="A"]end',
      ]),
      renderer,
      new FakeAudio(),
      // Native keeps durations literal and scales playback via
      // Sequence.timeScale = animateRatio; duration * ratio is equivalent.
      { animateRatio: 0.5 },
    );

    await runtime.start();

    expect(renderer.stickerTweenCalls).toEqual([
      {
        alpha: { durationMs: 500, from: 0, to: 1 },
        id: "s",
        isend: true,
        join: false,
        position: {
          durationMs: 1000,
          from: { x: 0, y: 0 },
          to: { x: 10, y: 20 },
        },
      },
    ]);
  });

  it("ignores subtitle ghost parameters and falls back invalid alignment to left", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="x",alignment="middle",delay=9,fadetime=9,multi=true)]',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 25 },
    );

    await runtime.start();

    expect(renderer.subtitleCalls).toEqual([
      {
        alignment: "left",
        delayMs: 25,
        onTypingComplete: expect.any(Function),
        sizePx: 24,
        text: "x",
        widthPx: 1280,
        x: 0,
        y: 0,
      },
    ]);
  });

  it("stops the timer sticker when skipping a node", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[name="A"]hello',
        "[timersticker(x=30,y=90,size=24,time=10)]",
        '[name="B"]next',
        '[skipnode(mode="nofirstskip")]',
        '[name="C"]later',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    await runtime.advance();

    expect(renderer.timerStickerCalls).toHaveLength(1);
    expect(renderer.timerClearCalls).toEqual([]);

    // `StickerPanel.ShouldResetOnSkip` defaults to true: skipping to the next
    // node fires `OnReset -> _RecycleStickers`, whose first step is
    // `StopTimer(0)`.
    await runtime.skipNode();

    expect(renderer.timerClearCalls).toEqual([{ durationMs: 0 }]);
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "C", text: "later" });
  });

  it("recycles sticker slots when skipping to the next node", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[Sticker(id="st1",text="up",x=300,y=270,block=true)]',
        '[skipnode(mode="nofirstskip")]',
        '[Sticker(id="st1",text="after",x=300,y=270)]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.stickerCalls).toHaveLength(1);

    await runtime.skipNode();

    // `_RecycleStickers` hides every entry of `m_stickerDict` with
    // `HideSticker(0)` -- 0.15s after the substitution -- then empties the
    // dictionary.
    expect(renderer.stickersClearCalls).toEqual([150]);
    // With the ids dropped, the reused "st1" is the show half of the toggle
    // again rather than a hide.
    expect(renderer.stickerCalls).toHaveLength(2);
    expect(renderer.stickerCalls[1]?.text).toBe("after");
  });
});
