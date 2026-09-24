import { describe, expect, it } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { RuntimeWarning } from "../../src/widgets/StoryPlayer/engine/types";

describe("StoryRuntime", () => {
  it("maps avgdisplay lifecycle and strict feature parameters", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[avgdisplay(id="1",name="bg_black",style="bg",slot="bgover",layer=2,afrom=0,ato=0.6,duration=2,isblock=true)]',
        '[avgdisplay(id="2",name="act3mainss_01",style="animekv",slot="cgover",x=-200,y=80,scalex=1.2,scaley=1.2,entryfrom=0,entryto=0.2,duration=5,block=true)]',
        '[avgdisplay(id="1")]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.avgDisplayCalls).toEqual([
      expect.objectContaining({
        alphaFrom: 0,
        alphaTo: 0.6,
        block: false,
        durationMs: 2000,
        id: "1",
        layer: 2,
        name: "bg_black",
        slot: "bgover",
        style: "bg",
      }),
      expect.objectContaining({
        block: true,
        durationMs: 5000,
        entryFrom: 0,
        entryTo: 0.2,
        id: "2",
        name: "act3mainss_01",
        scaleX: 1.2,
        scaleY: 1.2,
        slot: "cgover",
        style: "animekv",
        x: -200,
        y: 80,
      }),
      expect.objectContaining({
        block: false,
        id: "1",
        name: "",
      }),
    ]);
  });

  it("rejects showitem styles the panel does not register", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext(['[ShowItem(image="item_a",style="cg")]', '[name="A"]ok']),
      renderer,
      new FakeAudio(),
      { onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    // _slotStyles has only photo and cutin, so `cg` misses _FindSlotStyle and
    // the command finishes without rendering anything.
    expect(renderer.showItemCalls).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        command: "showitem",
        detail: "showitem style is not registered: cg",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("shows and hides story items with legacy defaults", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[showitem(image="item_act12side_1")]',
        "[hideitem]",
        '[name="Tips"]ok',
      ]),
      renderer,
      new FakeAudio(),
      {
        onWarning: (warning) => warnings.push(warning),
      },
    );

    await runtime.start();

    // The photo slot's serialized defaults: _defaultFadeTime 0.5 and
    // _defaultBlackAlpha 0.4, with offsetx/offsety hardcoded to 0.
    expect(renderer.showItemCalls).toEqual([
      {
        blackAlpha: 0.4,
        block: true,
        fadeMs: 500,
        key: "item_act12side_1",
        offsetX: 0,
        offsetY: 0,
      },
    ]);
    // hideitem does not read `block` either: it blocks whenever a slot was in
    // use, which it is here because the preceding showitem filled it.
    expect(renderer.clearItemsCalls).toEqual([{ block: true, fadeMs: 500 }]);
    expect(warnings).toEqual([]);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("maps interlude parameters and preserves the native channel default mismatch", async () => {
    const renderer = new FakeRenderer();
    const warnings: RuntimeWarning[] = [];
    const runtime = new StoryRuntime(
      createContext([
        '[interlude(channel=3,type=2,slot="m",name="bg_test",maskid="square",size="290,320",offset="10,-20",pfrom="1,2",pto="3,4",duration=2,sfrom="1,1",sto="2,2",sduration=1,afrom=0.2,ato=0.8,aduration=0.5,switch=true,block=true)]',
        "[interlude(clear=true)]",
        "[interlude(channel=-1,clear=true)]",
        '[name="A"]ok',
      ]),
      renderer,
      new FakeAudio(),
      { animateRatio: 0.5, onWarning: (warning) => warnings.push(warning) },
    );

    await runtime.start();

    expect(renderer.interludeCalls).toHaveLength(2);
    expect(renderer.interludeCalls[0]).toMatchObject({
      alphaDurationMs: 250,
      alphaFrom: 0.2,
      alphaTo: 0.8,
      block: true,
      channel: 3,
      durationMs: 1000,
      maskId: "square",
      offset: { x: 10, y: -20 },
      positionFrom: { x: 1, y: 2 },
      positionTo: { x: 3, y: 4 },
      scaleDurationMs: 500,
      scaleFrom: { x: 1, y: 1 },
      scaleTo: { x: 2, y: 2 },
      size: { x: 290, y: 320 },
      slot: "m",
      switchOn: true,
      type: 2,
    });
    expect(renderer.interludeCalls[1]).toMatchObject({
      channel: -1,
      clear: true,
    });
    expect(warnings).toEqual([
      expect.objectContaining({
        detail: "interlude channel is invalid: -1",
        type: "invalid_parameter",
      }),
    ]);
  });

  it("maps cgitem tween parameters and hidecgitem keys with native defaults", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext([
        '[cgitem(image="cgitem_test",id="left",style="cg",pfrom="1,2",pto="3,4",pduration=2,pdelay=0.5,sfrom=0.8,sto=1.2,sduration=3,sdelay=0.25,afrom=0,ato=1,aduration=1,adelay=0.1,rfrom=-10,rto=20,rduration=4,width=640,height=360,ease="Linear",block=true,layer=9,fadetime=8)]',
        '[hidecgitem(image="cgitem_test",id="left",block=true)]',
      ]),
      renderer,
      new FakeAudio(),
    );

    await runtime.start();

    expect(renderer.cgItemCalls).toEqual([
      {
        alphaDelayMs: 100,
        alphaDurationMs: 1000,
        alphaFrom: 0,
        alphaTo: 1,
        assetKey: "cgitem_test",
        block: true,
        colorFrom: undefined,
        colorTo: undefined,
        ease: "Linear",
        height: 360,
        key: "cgitem_test_left",
        positionDelayMs: 500,
        positionDurationMs: 2000,
        positionFrom: { x: 1, y: 2 },
        positionTo: { x: 3, y: 4 },
        rotationDurationMs: 4000,
        rotationFrom: -10,
        rotationTo: 20,
        scaleDelayMs: 250,
        scaleDurationMs: 3000,
        scaleFrom: 0.8,
        scaleTo: 1.2,
        width: 640,
      },
    ]);
    expect(renderer.clearCgItemCalls).toEqual([
      {
        block: true,
        ease: "Linear",
        fadeMs: 130,
        key: "cgitem_test_left",
      },
    ]);
  });

  it("maps parameterless hidecgitem to clear-all", async () => {
    const renderer = new FakeRenderer();
    const runtime = new StoryRuntime(
      createContext(['[hidecgitem(fadetime=1,ease="Linear")]']),
      renderer,
      new FakeAudio(),
    );
    await runtime.start();
    expect(renderer.clearCgItemCalls).toEqual([
      { block: false, ease: "Linear", fadeMs: 1000, key: undefined },
    ]);
  });
});
