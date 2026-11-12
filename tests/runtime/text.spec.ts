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

  it("emits a click when quick play is selected again during a blocking spellsticker", async () => {
    vi.useFakeTimers();
    const renderer = new FakeRenderer();
    vi.spyOn(renderer, "setSpellSticker").mockResolvedValueOnce(1750);
    const runtime = new StoryRuntime(
      createContext([
        '[spellsticker(id="s",style="sami",block=true)]<p=1>A</>',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );
    try {
      runtime.setAutoPlayMode("quick_play");
      await runtime.start();
      expect(runtime.getState()).toBe("waiting_input");
      expect(renderer.spellStickerHideCalls).toEqual([]);

      runtime.setAutoPlayMode("quick_play");
      await vi.advanceTimersByTimeAsync(0);
      expect(renderer.spellStickerHideCalls).toEqual(["s"]);
      expect(runtime.getDisplayedLineIndex()).toBe(2);
    } finally {
      runtime.destroy();
      vi.useRealTimers();
    }
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

  it.each([
    '[spellsticker(id="s",action="hide",block=true)]',
    "[spellstickerclear(block=true)]",
  ])("captures the base auto wait for %s in manual mode", async (command) => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        `[name="A"]${"X".repeat(100)}`,
        command,
        '[name="B"]after',
      ]),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    await runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    runtime.setAutoPlaySpeedLevel(2);
    runtime.setAutoPlayMode("button_auto");

    await renderer.frames.advance(16, 16, 1499);
    expect(renderer.lastDialogue.speaker).toBe("A");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("B");
    runtime.destroy();
  });

  it.each([
    // ForceCommandEnd hides m_blockingStickerId before OnReset clears all.
    { action: "show", clicked: false, hidesBeforeSkip: 0 },
    // A blocking hide leaves no blocking id, so only the executor hides.
    { action: "hide", clicked: false, hidesBeforeSkip: 1 },
    // _OnClicked clears the blocking id even before frame-end completion.
    { action: "show", clicked: true, hidesBeforeSkip: 1 },
  ])(
    "hides a blocking spellsticker $action once before the skip reset (clicked=$clicked)",
    async ({ action, clicked, hidesBeforeSkip }) => {
      const renderer = new FakeRenderer();
      renderer.frames.manual = true;
      const clear = vi
        .spyOn(renderer, "clearSpellStickers")
        .mockImplementationOnce(() => {
          expect(renderer.spellStickerHideCalls).toEqual(["s"]);
        });
      // nofirstskip on a first read takes the protected skip branch and
      // reaches _ResetComponentsOnSkip.
      const runtime = new StoryRuntime(
        createContext([
          `[spellsticker(id="s",action="${action}",block=true)]<p=1>x</>`,
          '[skipnode(mode="nofirstskip")]',
        ]),
        renderer,
        new FakeAudio(),
      );
      try {
        await runtime.start();
        const advancing = clicked ? runtime.advance() : undefined;
        expect(renderer.spellStickerHideCalls).toHaveLength(hidesBeforeSkip);
        await runtime.skipNode();
        await advancing;
        expect(clear).toHaveBeenCalledExactlyOnceWith();
        expect(renderer.spellStickerHideCalls).toEqual(["s"]);
      } finally {
        runtime.destroy();
      }
    },
  );

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

  it("types dialogue <i> spans as zero-width and renders them as italic runs", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[name="A"]<i>ab</i>c']),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 20 },
    );

    await runtime.start();
    await renderer.frames.advance(21, 20, 20);
    // Native AVGTypeWriterText skips every tag without a typing step and
    // closes the open ones on each prefix.
    expect(renderer.dialogueTexts.filter(Boolean)).toEqual([
      "<_i>a</_i>",
      "<_i>ab</_i>",
      "<_i>ab</_i>c",
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
    renderer.frames.manual = true;
    const onFrameEnd = vi.spyOn(renderer, "onFrameEnd");
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
    expect(renderer.subtitleText).toBe("");

    await runtime.advance();
    expect(renderer.subtitleText).toBe("HELLO");
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });

    const advance = runtime.advance();
    expect(runtime.getState()).toBe("waiting_input");
    expect(renderer.lastDialogue.speaker).toBe("");
    await runtime.advance();
    expect(onFrameEnd).toHaveBeenCalledTimes(1);
    renderer.frames.step(16);
    expect(renderer.lastDialogue.speaker).toBe("");
    renderer.frames.step(16);
    await advance;
    expect(renderer.lastDialogue.speaker).toBe("A");
  });

  it("auto mode advances a subtitle once its typewriter ends naturally", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
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
    renderer.frames.step(200);
    expect(renderer.subtitleText).toBe("HELL");
    expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });

    renderer.frames.step(1);
    expect(renderer.subtitleText).toBe("HELLO");
    // Auto wait = 1.5s + messageLength(5) * 0.03s = 1.65s; the subtitle's
    // own length must drive the wait, not the previous message's.
    await renderer.frames.advance(16, 1649);
    expect(renderer.lastDialogue).toEqual({ speaker: "", text: "" });
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("A");
    runtime.destroy();
  });

  it("applies the new speed to the subtitle already on screen", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext(['[subtitle(text="HELLO")]', '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );
    await runtime.start();
    renderer.frames.step(45);
    expect(renderer.subtitleText).toBe("H");

    // Gear 1 changes the interval to 10ms and retains the 5ms accumulated
    // toward the next character. Update uses a strict interval comparison.
    runtime.setAutoPlayMode("button_auto");
    runtime.setAutoPlaySpeedLevel(1);
    renderer.frames.step(35);
    expect(renderer.subtitleText).toBe("HELL");
    renderer.frames.step(1);
    expect(renderer.subtitleText).toBe("HELLO");

    await renderer.frames.advance(16, 574);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("A");
    runtime.destroy();
  });

  it("keeps the subtitle's scheduled auto deadline when changing gears after typing", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext(['[subtitle(text="HELLO")]', '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );
    runtime.setAutoPlayMode("button_auto");
    await runtime.start();
    await renderer.frames.advance(201, 16, 300);
    expect(renderer.subtitleText).toBe("HELLO");

    runtime.setAutoPlaySpeedLevel(1);
    // Type-end captures 1650ms. The wait starts and releases
    // on frame updates. The new gear applies to later RaiseAutoClick calls.
    await renderer.frames.advance(1349);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("A");
    runtime.destroy();
  });

  it("holds a subtitle's auto click in manual mode before and after its captured wait", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext(['[subtitle(text="HELLO")]', '[name="A"]after']),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );
    runtime.setAutoPlaySpeedLevel(1);
    await runtime.start();
    await renderer.frames.advance(2500);
    expect(renderer.subtitleText).toBe("HELLO");
    expect(renderer.lastDialogue.speaker).toBe("");

    runtime.setAutoPlayMode("button_auto");
    await renderer.frames.advance(16, 16, 900);
    expect(renderer.lastDialogue.speaker).toBe("");
    runtime.setAutoPlayMode("default");
    await renderer.frames.advance(1000, 16);
    expect(renderer.lastDialogue.speaker).toBe("");

    runtime.setAutoPlayMode("button_auto");
    await renderer.frames.advance(16, 16);
    expect(renderer.lastDialogue.speaker).toBe("A");
    runtime.destroy();
  });

  it("hides a subtitle at story end without an explicit close command", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[subtitle(text="HELLO")]']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(renderer.subtitleText).toBe("HELLO");
    await runtime.advance();
    expect(runtime.getState()).toBe("finished");
    expect(renderer.subtitleText).toBe("");
    expect(renderer.subtitleClearCalls).toEqual([0]);
  });

  it("clears the subtitle immediately when skipping the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="HELLO",alignment="center")]',
        '[skipnode(mode="skip")]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    expect(runtime.getState()).toBe("waiting_input");

    await runtime.skipNode();
    expect(renderer.subtitleClearCalls).toEqual([0]);
    expect(runtime.getState()).toBe("finished");
  });

  it("drops the skipped subtitle's click wait before starting the next line", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="old")]',
        "[SkipToThis]",
        '[subtitle(text="new")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
      { sleep: () => new Promise(() => {}), typingIntervalMs: 40 },
    );

    await runtime.start();
    await runtime.skipNode();
    expect(renderer.subtitleClearCalls).toEqual([0]);
    expect(renderer.subtitleText).toBe("");
    expect(runtime.getDisplayedLineIndex()).toBe(3);

    await runtime.advance();
    expect(renderer.subtitleText).toBe("new");
    expect(runtime.getDisplayedLineIndex()).toBe(3);
    await runtime.advance();
    expect(runtime.getDisplayedLineIndex()).toBe(4);
    runtime.destroy();
  });

  it("cancels a subtitle's pending frame-end completion when skipping", async () => {
    const renderer = new FakeRenderer();
    let endFrame: (() => void) | undefined;
    const cancel = vi.fn();
    vi.spyOn(renderer, "onFrameEnd").mockImplementationOnce((callback) => {
      endFrame = callback;
      return cancel;
    });
    const runtime = new StoryRuntime(
      createContext([
        '[subtitle(text="old")]',
        "[SkipToThis]",
        '[subtitle(text="new")]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();
    const advance = runtime.advance();
    await runtime.skipNode();
    await advance;
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
    endFrame?.();
    expect(runtime.getDisplayedLineIndex()).toBe(3);
    expect(renderer.subtitleText).toBe("new");
    await runtime.advance();
    expect(runtime.getDisplayedLineIndex()).toBe(4);
  });

  it("updates only the current sticker and keeps its new delay when appending", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="old",delay=0.2,block=false)]',
        '[sticker(id="b",text="current",delay=0.2)]',
        '[sticker(id="b",multi=true,text="append",block=true)]',
      ]),
      renderer,
      new FakeAudio(),
    );
    runtime.setAutoPlayMode("button_auto");
    await runtime.start();
    expect(renderer.stickerCalls.map(({ delayMs }) => delayMs)).toEqual([
      200, 200,
    ]);

    runtime.setAutoPlaySpeedLevel(1);
    expect(renderer.stickerDelayChanges).toEqual([{ id: "b", delayMs: 10 }]);
    renderer.finishStickerTypingNaturally();
    await renderer.frames.advance(16, 16, 605, 16, 16);
    expect(renderer.stickerCalls.at(-1)).toMatchObject({
      append: true,
      delayMs: 10,
      id: "b",
    });
    runtime.destroy();
  });

  it("keeps the current sticker's script delay when the quick gear is reselected", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[sticker(id="a",text="hello",delay=1,block=true)]']),
      renderer,
      new FakeAudio(),
    );
    try {
      runtime.setAutoPlayMode("quick_play");
      await runtime.start();
      expect(renderer.stickerCalls[0]?.delayMs).toBe(250);
      runtime.setAutoPlaySpeedLevel(0);
      expect(renderer.stickerDelayChanges).toEqual([]);
      runtime.setAutoPlaySpeedLevel(1);
      expect(renderer.stickerDelayChanges).toEqual([{ id: "a", delayMs: 5 }]);
    } finally {
      runtime.destroy();
    }
  });

  it("refreshes the current sticker interval on a click in manual mode", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="first",delay=0.2)]',
        '[sticker(id="a",text="append",multi=true,block=true)]',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );

    await runtime.start();
    expect(renderer.stickerCalls[0]?.delayMs).toBe(200);
    await runtime.advance();
    expect(renderer.stickerDelayChanges).toEqual([{ id: "a", delayMs: 40 }]);
    await runtime.advance();
    expect(renderer.stickerCalls[1]?.delayMs).toBe(40);
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
        '[sticker(id="c",text="z",delay=-0.04,block=false)]',
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
      40, 1000, -40,
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
    await renderer.frames.advance(16, 16, 1649);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("B");
  });

  it("bills only the new multiline message when an existing sticker switches to multi", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="s",text="OLD",delay=0,block=false)]',
        '[sticker(id="s",text="NEW",multi=true,block=false)]',
        '[sticker(id="s",text="+",multi=true,block=true)]',
        '[name="B"]after',
      ]),
      renderer,
      new FakeAudio(),
    );
    runtime.setAutoPlayMode("button_auto");
    await runtime.start();
    expect(renderer.stickerCalls.slice(1)).toMatchObject([
      { append: true, resetText: true },
      { append: true, resetText: false },
    ]);

    // The final message is NEW+, which queues 1500 + 4 * 30 ms.
    await renderer.frames.advance(16, 16, 1619);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("B");
    runtime.destroy();
  });

  it("auto-advances a hidden sticker with the base wait only", async () => {
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
    await renderer.frames.advance(16, 16, 1499);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("B");
  });

  it("holds the sticker auto click until its typewriter ends", async () => {
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
    await renderer.frames.advance(16, 16, 4000, 16);
    expect(renderer.typingActive).toBe(true);
    expect(renderer.lastDialogue.speaker).toBe("");

    renderer.finishStickerTypingNaturally();
    await renderer.frames.advance(16, 16, 1649);
    expect(renderer.lastDialogue.speaker).toBe("");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("B");
  });

  it("lets dialogue completion replace the preceding non-blocking sticker's auto click", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="0123456789",block=false)]',
        '[name="B"]after',
        '[name="C"]next',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );
    runtime.setAutoPlayMode("button_auto");
    await runtime.start();
    expect(renderer.typingActive).toBe(false);
    // The sticker starts waiting while the dialogue is still typing.
    await renderer.frames.advance(16, 16);
    expect(renderer.lastDialogue.text).toBe("");
    // The last glyph replaces the sticker's 1.8s wait with 1.65s.
    await renderer.frames.advance(169, 16, 1649);
    expect(renderer.lastDialogue.speaker).toBe("B");
    await renderer.frames.advance(1, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("C");
    runtime.destroy();
  });

  it("ignores delayed callbacks from a completed non-blocking sticker show and append", async () => {
    const renderer = new FakeRenderer();
    renderer.frames.manual = true;
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="one",multi=true,block=false)]',
        '[sticker(id="a",text="two",multi=true,block=false)]',
        '[name="B"]after',
        '[name="C"]next',
      ]),
      renderer,
      new FakeAudio(),
    );
    runtime.setAutoPlayMode("button_auto");
    await runtime.start();

    await renderer.frames.advance(201, 16, 1000);
    renderer.stickerCalls[0]!.onTypingComplete?.();
    renderer.stickerCalls[1]!.onTypingComplete?.();
    await renderer.frames.advance(650, 16, 16);
    expect(renderer.lastDialogue.speaker).toBe("C");
    expect(renderer.typingActive).toBe(false);
    runtime.destroy();
  });

  it("advances a blocking stickertween in one click after a non-blocking sticker", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="a",text="hello",block=false)]',
        '[stickertween(id="a",pto="300,500",block=true,isend=true)]',
        '[name="B"]after',
      ]),
      renderer,
      new FakeAudio(),
      { typingIntervalMs: 40 },
    );
    await runtime.start();
    expect(runtime.getDisplayedLineIndex()).toBeNull();
    expect(renderer.typingActive).toBe(false);

    await runtime.advance();
    expect(runtime.getDisplayedLineIndex()).toBe(3);
    runtime.destroy();
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

  it("maps the 2791 stickertween scale group from sto/sfrom/sduration", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[sticker(id="st1",text="hi",block=false)]',
        // `sto` alone makes the group: ParseScaleParam leaves sfrom at 0.
        '[stickertween(id="st1",sto=1.5,sduration=2,isend=true)]',
        // A non-float `sto` leaves the group Empty, whatever sfrom says.
        '[stickertween(id="st1",sto="1,1",sfrom=1,isend=true)]',
        '[name="A"]after',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.stickerTweenCalls).toEqual([
      {
        id: "st1",
        isend: true,
        join: false,
        scale: { durationMs: 2000, from: 0, to: 1.5 },
      },
    ]);
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

  it.each(["middle", "CENTER", "RIGHT"])(
    "ignores subtitle ghost parameters and falls back from %s alignment to left",
    async (alignment) => {
      const renderer = new FakeRenderer();
      renderer.frames.manual = true;
      const runtime = new StoryRuntime(
        createContext([
          `[subtitle(text="x",alignment="${alignment}",delay=9,fadetime=9,multi=true)]`,
        ]),
        renderer,
        new FakeAudio(),
        { typingIntervalMs: 25 },
      );

      await runtime.start();

      expect(renderer.subtitleCalls).toEqual([
        {
          alignment: "left",
          sizePx: 24,
          text: "x",
          widthPx: 1280,
          x: 0,
          y: 0,
        },
      ]);
      renderer.frames.step(25);
      expect(renderer.subtitleText).toBe("");
      renderer.frames.step(1);
      expect(renderer.subtitleText).toBe("x");
      runtime.destroy();
    },
  );

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
