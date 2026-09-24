import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("places a single character in the middle slot without ever blocking", async () => {
    const renderer = new FakeRenderer();
    const sleep = vi.fn(async () => {});
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",block=true,fadetime=0.2,enter="left",blackstart=0.2,blackend=0.8)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { sleep },
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 200, slot: "l" },
      { fadeMs: 200, slot: "r" },
    ]);
    // `block` is not a key _ExecuteCharacter reads (it reads `isblock`), and the
    // executor never registers a completion callback, so the command never waits.
    expect(renderer.characterCalls).toEqual([
      {
        blackEnd: 0.8,
        blackStart: 0.2,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: false,
        durationMs: 200,
        enterFrom: "left",
        enterPosition: undefined,
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        focus: 0,
        nativeKey: "avg_npc_1",
        slot: "m",
        transType: 0,
      },
    ]);
    expect(sleep).not.toHaveBeenCalled();
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps dual character layout and focus", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",name2="avg_npc_1#1",focus=1)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([{ fadeMs: 150, slot: "m" }]);
    expect(renderer.characterCalls).toEqual([
      {
        blackEnd: Number.NaN,
        blackStart: Number.NaN,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: false,
        durationMs: 150,
        enterFrom: undefined,
        enterPosition: undefined,
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        focus: 1,
        nativeKey: "avg_npc_1",
        slot: "l",
        transType: 0,
      },
      {
        blackEnd: Number.NaN,
        blackStart: Number.NaN,
        block: false,
        characterKey: "avg_npc_1",
        dimmed: true,
        durationMs: 150,
        enterFrom: undefined,
        enterPosition: undefined,
        expression: "1$1",
        fadeIdentity: "avg_npc_1",
        focus: 1,
        nativeKey: "avg_npc_1#1",
        slot: "r",
        transType: 0,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("passes the native transtype through to the renderer", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",enter="left",transtype=1,fadetime=0.5)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // Native reads `transtype` once per command via GetOrDefault<int> and
    // shares it across all three slots; the default is 0 (ECharTransType.NONE).
    expect(renderer.characterCalls).toEqual([
      expect.objectContaining({ enterFrom: "left", transType: 1 }),
    ]);
  });

  it("keeps name2 in the right slot when the primary name is empty", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[character(name2="avg_npc_1#1")]', '[name="A"]ok']),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 150, slot: "m" },
      { fadeMs: 150, slot: "l" },
    ]);
    expect(renderer.characterCalls).toEqual([
      expect.objectContaining({
        characterKey: "avg_npc_1",
        expression: "1$1",
        slot: "r",
      }),
    ]);
  });

  it("ignores xpos/ypos without a legal enter and applies them as slide-in offsets with one", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[character(name="avg_npc_1",Name2="avg_npc_1",xpos1=123,ypos1=456)]',
        '[character(name="avg_npc_1",enter="left",xpos1=123,ypos1=456)]',
        '[character(name="avg_npc_1",enter="left",xpos1=123)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls).toHaveLength(3);
    // Native `_GenPosition` never applies xpos/ypos unless `enter` is one of
    // left/right/up/down, so the first command places normally.
    expect(renderer.characterCalls[0]).toMatchObject({
      enterFrom: undefined,
      enterPosition: undefined,
      slot: "m",
    });
    // With a legal enter and both coordinates, they act as the slot-local
    // slide-in start (Unity y up -> renderer y down flip).
    expect(renderer.characterCalls[1]).toMatchObject({
      enterFrom: "left",
      enterPosition: { x: 123, y: -456 },
      slot: "m",
    });
    // Both coordinates must exist; a lone xpos1 falls back to the direction
    // default.
    expect(renderer.characterCalls[2]).toMatchObject({
      enterFrom: "left",
      enterPosition: undefined,
      slot: "m",
    });
    expect(renderer.clearedSlots).toEqual([
      { fadeMs: 150, slot: "l" },
      { fadeMs: 150, slot: "r" },
      { fadeMs: 150, slot: "l" },
      { fadeMs: 150, slot: "r" },
      { fadeMs: 150, slot: "l" },
      { fadeMs: 150, slot: "r" },
    ]);
  });

  it("requires the case-sensitive charactercutin widgetID key", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetid="wrong",name="avg_npc_1")]',
        '[charactercutin(widgetID="right",name="avg_npc_1",fadestyle="fade")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.characterCutinCalls).toHaveLength(1);
    expect(renderer.characterCutinCalls[0]).toMatchObject({
      fadeStyle: "fade",
      widgetId: "right",
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "charactercutin widgetID is empty",
        type: "parse",
      }),
    ]);
  });

  it("maps charactercutin slot layout keys and scales fadetime by animateRatio", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetID="1",name="avg_npc_1#1",fadetime=0.4,offsetx=-300,offsety=25,width=220,zoom=1.5,povX=-50,povY=30,charOffsetX=5,charOffsetY=-10,fadestyle="horiz_expand_left2right",block=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { animateRatio: 0.5 },
    );

    await runtime.start();

    expect(renderer.characterCutinCalls).toEqual([
      {
        block: true,
        characterKey: "avg_npc_1",
        characterMissing: false,
        charOffsetX: 5,
        charOffsetY: -10,
        expression: "1$1",
        fadeMs: 200,
        fadeStyle: "horiz_expand_left2right",
        offsetX: -300,
        offsetY: 25,
        povX: -50,
        povY: 30,
        widgetId: "1",
        width: 220,
        zoom: 1.5,
      },
    ]);
  });

  it("leaves omitted charactercutin layout keys undefined for the panel to resolve", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetID="1",name="avg_npc_1#1",width=400)]',
        '[charactercutin(widgetID="1",name="avg_npc_1#2")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    // Show and SlotUpdate disagree about what an omitted key means (prefab
    // default vs. hold the live value), so the runtime must not collapse the
    // distinction by substituting 200 / 0 / 1 here.
    expect(renderer.characterCutinCalls[0]).toMatchObject({ width: 400 });
    expect(renderer.characterCutinCalls[1]).toMatchObject({
      charOffsetX: undefined,
      offsetX: undefined,
      povX: undefined,
      width: undefined,
      zoom: undefined,
    });
  });

  it("keeps charactercutin block timing when the name cannot be resolved", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetID="1",name="avg_ghost#1",fadetime=0.5,block=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // Native still allocates the slot and runs its tween for an unresolvable
    // name; only the character art is absent.
    expect(renderer.characterCutinCalls).toHaveLength(1);
    expect(renderer.characterCutinCalls[0]).toMatchObject({
      block: true,
      characterMissing: true,
      fadeMs: 500,
      widgetId: "1",
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "charactercutin: avg_ghost#1",
        type: "missing_asset",
      }),
    ]);
  });

  it("clears charactercutin slots when skipping the story", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charactercutin(widgetID="1",name="avg_npc_1",block=true)]',
        '[name="A"]ok',
        '[skipnode(mode="nofirstskip")]',
        '[name="B"]later',
      ]),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    await runtime.skipNode();
    expect(renderer.clearCharacterCutinCalls).toEqual([""]);
  });

  it("resolves uppercase character keys like legacy runtime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_1012_skadiSP_1#2")]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls).toEqual([
      {
        action: undefined,
        alphaFrom: 0,
        alphaTo: 1,
        blackEnd: undefined,
        blackStart: undefined,
        block: false,
        characterKey: "avg_1012_skadisp_1",
        // charslot's `duration` defaults to 0.0, not to DEFAULT_FADE_TIME.
        durationMs: 0,
        expression: "avg_1012_skadisp_2",
        fadeIdentity: "avg_1012_skadiSP_1",
        // Omitted focus => ["all"] natively: every built-in slot is lit.
        focusMode: "subset",
        focusSlots: ["l", "m", "r"],
        nativeKey: "avg_1012_skadiSP_1#2",
        positionFrom: undefined,
        positionTo: undefined,
        posZoom: undefined,
        power: 0,
        // GetOrDefault<int>("random", 10) -- DOTween randomness degrees.
        randomness: 10,
        // The crossfade length is `duration` itself (here 0), never
        // `fadetime`, which native charslot never reads.
        replaceFadeMs: 0,
        scaleX: undefined,
        scaleY: undefined,
        slot: "m",
        // charslot tweens join the per-slot cached Sequence; `character`
        // commands (CharacterPanel) leave this unset.
        slotSequence: true,
        stop: false,
        times: 1,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("resolves character refs with whitespace inside the suffix like native", async () => {
    const renderer = new FakeRenderer();
    const context = createContext([
      // One case per whitespace position the native Int32.TryParse tolerates:
      // between the index digits and `$`, after `#`, and after `$`.
      '[charslot(slot="m",name="avg_4236_tmslot_1#3 $1")]',
      '[charslot(slot="l",name="avg_npc_1# 1")]',
      '[charslot(slot="r",name="avg_4236_tmslot_1$ 1")]',
      '[name="A"]ok',
    ]);
    context.linkMap.avg_4236_tmslot_1 = {
      array: [
        { alias: "", group: 0, name: "1$1" },
        { alias: "", group: 0, name: "2$1" },
        { alias: "", group: 0, name: "3$1" },
      ],
      groups: [],
      pos: { x: 0, y: 0 },
      size: { x: 0, y: 0 },
    };
    const runtime = new StoryRuntime(context, renderer, new FakeAudio());

    await runtime.start();

    expect(renderer.characterCalls[0]).toMatchObject({
      characterKey: "avg_4236_tmslot_1",
      expression: "3$1",
      slot: "m",
    });
    expect(renderer.characterCalls[1]).toMatchObject({
      characterKey: "avg_npc_1",
      expression: "1$1",
      slot: "l",
    });
    expect(renderer.characterCalls[2]).toMatchObject({
      characterKey: "avg_4236_tmslot_1",
      expression: "1$1",
      slot: "r",
    });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps charslot slot aliases and duration blocking like legacy runtime", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="left",name="avg_npc_1",duration=0.4,isblock=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls[0]).toMatchObject({
      block: true,
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "l",
    });
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("keeps charslot updates without name on the existing slot", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_npc_1")]',
        '[charslot(slot="middle",focus="none",posto="10,20",duration=0.2)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.clearedSlots).toEqual([]);
    expect(renderer.characterCalls).toHaveLength(2);
    expect(renderer.characterCalls[1]).toMatchObject({
      characterKey: undefined,
      // focus="none" is not a native token (`_ProcessFocusArray` only knows
      // all/left/l/middle/m/right/r/custom/c): it clears every focus flag,
      // leaving all slots unfocused.
      focusMode: "subset",
      focusSlots: [],
      positionTo: { x: 10, y: 20 },
      slot: "m",
    });
  });

  it("clears the slot for name=char_empty and keeps the rest of the command", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        // level_main_12-12_end.txt:373 / story_bubble_1_1.txt:502 pattern:
        // char_empty is SlotCleanChar, not a missing asset.
        '[charslot(slot="m",name="avg_npc_1")]',
        '[charslot(slot="l",name="char_empty",focus="all",duration=0.5)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(warnings).toEqual([]);
    // SlotCleanChar starts a `duration` fade, but _UpdateSeqWithParam then
    // falls through to SlotSetCharWithParam with the same name: the second
    // _LoadImage DOKill()s that fade and disables the Image, so the slot is
    // emptied instantly whatever `duration` says.
    expect(renderer.clearedSlots).toEqual([{ fadeMs: 0, slot: "l" }]);
    // The command keeps executing after the clean: focus=all is still applied.
    expect(renderer.characterCalls[1]).toMatchObject({
      characterKey: undefined,
      focusSlots: ["l", "m", "r"],
      slot: "l",
    });
  });

  it("keeps running charslot actions when the character asset is missing", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_npc_1",duration=0.4)]',
        '[charslot(slot="m",name="avg_missing_1",action="shake",power=5,duration=0.3)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // `_SlotSetCharInternal` swaps before `_LoadImage`: on failure the old
    // art is already the back Image and fades out over `duration` while the
    // new fore Image is disabled, so the slot empties -- but the action/focus
    // sections still run and the command is not dropped.
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "character: avg_missing_1",
        type: "missing_asset",
      }),
    ]);
    expect(renderer.clearedSlots).toEqual([{ fadeMs: 300, slot: "m" }]);
    expect(renderer.characterCalls[1]).toMatchObject({
      action: "shake",
      characterKey: undefined,
      power: 5,
      slot: "m",
    });
  });

  it("fades out a nameless charslot that sets afrom without ato", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[charslot(slot="m",name="avg_npc_1")]',
        // story_whitw2_1_1.txt:475 pattern (`afrom=1, posto=0`, no ato): the
        // nameless branch only gates on afrom >= 0 and passes ato through, so
        // SlotChangeAlpha tweens toward alpha -1 (clamped at the vertex-colour
        // write, fully transparent by duration/2). The -1 target is handed to
        // the renderer as-is, and the scalar posto is (0,0) like native's
        // Vector2.zero fallback.
        '[charslot(slot="m",afrom=1,posto=0,duration=0.3)]',
        // afrom omitted: `GE(alphaFrom, 0)` fails and nothing touches the
        // alpha, even with an ato.
        '[charslot(slot="m",ato=0.5,duration=0.3)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls[1]).toMatchObject({
      alphaFrom: 1,
      alphaTo: -1,
      positionTo: { x: 0, y: 0 },
      slot: "m",
    });
    expect(renderer.characterCalls[2].alphaFrom).toBeUndefined();
    expect(renderer.characterCalls[2].alphaTo).toBeUndefined();
  });

  it("maps charslot random like native GetOrDefault<int> and end=false only to blocking", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        // level_main_12-05_end.txt:576 pattern: random=true is
        // Convert.ToInt32(true) = 1, not "enable randomness".
        '[charslot(slot="m",action="shake",random=true,power=5,times=60,duration=0.3)]',
        // act23side_02_beg.txt:552 pattern: `end=false` still animates -- the
        // sequence auto-plays -- but the isblock check at 0x183e4e56f sits
        // inside the `end` branch, so it does not block.
        '[charslot(slot="l",name="avg_npc_1",posfrom="0,-500",posto="0,0",duration=2,isblock=true,end=false)]',
        // The very same command with end omitted does block.
        '[charslot(slot="l",name="avg_npc_1",posfrom="0,-500",posto="0,0",duration=2,isblock=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.characterCalls[0]).toMatchObject({
      randomness: 1,
      slot: "m",
    });
    expect(renderer.characterCalls[1]).toMatchObject({
      // afrom/ato omitted with a name resets to (0, 1): always fade in.
      alphaFrom: 0,
      alphaTo: 1,
      block: false,
      positionFrom: { x: 0, y: -500 },
      positionTo: { x: 0, y: 0 },
      replaceFadeMs: 2000,
      slot: "l",
    });
    expect(renderer.characterCalls[2]).toMatchObject({
      block: true,
      slot: "l",
    });
  });

  it.each([
    {
      name: "does not block without isblock",
      command: "[charslot(duration=0.5)]",
      stateWhileClearing: "waiting_input",
    },
    {
      name: "blocks with isblock",
      command: "[charslot(duration=0.5,isblock=true)]",
      stateWhileClearing: "running",
    },
    {
      // The clear branch returns before the sequence is built and hands
      // isBlock straight to _CleanSlotsWithTween (0x183e4e5c3), so it is
      // not gated on `end` the way the slot path is.
      name: "keeps isblock even with end=false",
      command: "[charslot(duration=0.5,isblock=true,end=false)]",
      stateWhileClearing: "running",
    },
  ])(
    "clears all characters over the charslot duration when slot is omitted and $name",
    async ({ command, stateWhileClearing }) => {
      let resolveClear: (() => void) | undefined;
      const renderer = new FakeRenderer();
      renderer.clearCharactersHandler = () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        });
      const runtime = new StoryRuntime(
        createContext([command, '[name="A"]ok']),
        renderer,
        new FakeAudio(),
      );

      const startPromise = runtime.start();

      await Promise.resolve();

      expect(renderer.clearedSlots).toEqual([{ fadeMs: 500, slot: undefined }]);
      expect(runtime.getState()).toBe(stateWhileClearing);

      resolveClear?.();
      await startPromise;
      expect(renderer.lastDialogue).toEqual({ speaker: "A", text: "ok" });
    },
  );

  it("maps characteraction move with legacy slot aliases and block args", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[characteraction(name="left",type="move",xpos=-200,ypos=60,fadetime=0.1,isblock=true)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.actionCalls).toEqual([
      {
        block: true,
        direction: undefined,
        durationMs: 100,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: undefined,
        scaleY: undefined,
        slot: "l",
        stop: false,
        times: 1,
        type: "move",
        xOffset: -200,
        yOffset: 60,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("uses the five strict characteraction branches and native slot fallbacks", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[characteraction(name="middle",type="rotate",duration=0.5,start=3,leftend=20,rightend=10,times=-1,stop=false)]',
        '[characteraction(name="char_right",type="zoom",scale=1.2,yscale=0.8,block=true)]',
        '[characteraction(name="r",type="exit",direction="left",block=false)]',
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.actionCalls).toEqual([
      {
        block: true,
        direction: undefined,
        durationMs: 500,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: 1.2,
        scaleY: 0.8,
        slot: "l",
        stop: false,
        times: 1,
        type: "zoom",
        xOffset: 0,
        yOffset: 0,
      },
      {
        block: false,
        direction: "left",
        durationMs: 500,
        power: 0,
        randomness: 90,
        rotationFromDeg: 0,
        rotationLeftDeg: -15,
        rotationRightDeg: 15,
        scaleX: undefined,
        scaleY: undefined,
        slot: "m",
        stop: false,
        times: 1,
        type: "exit",
        xOffset: 0,
        yOffset: 0,
      },
    ]);
    expect(runtime.getState()).toBe("waiting_input");
  });
});
