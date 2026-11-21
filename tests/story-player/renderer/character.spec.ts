import { setImmediate } from "node:timers/promises";

import { Assets, Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { CharacterArtLoader } from "../../../src/widgets/StoryPlayer/engine/rendering/characters/CharacterArt";
import {
  createRenderedPlayback,
  createRenderer,
  focusAmount,
} from "../helpers/rendererFixtures";

import type { Context } from "../../../src/widgets/StoryPlayer/context";
import type { TweenStartOptions } from "../../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

function createCharacterRenderer(stubTween = true): any {
  const context: Context = {
    linkMap: {
      avg_test: {
        array: [
          { alias: "", group: -1, image: "body-1", name: "1$1" },
          { alias: "", group: -1, image: "body-2", name: "2$1" },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 100, y: 200 },
      },
    },
    script: [],
  };
  const renderer = createRenderer(context);
  renderer.characterView.loadArt = vi.fn(() => null);
  renderer.characterView.buildCharacterVisual = vi.fn(
    (input: { characterKey?: string }) =>
      input.characterKey
        ? {
            height: 200,
            pos: { x: 0, y: 0 },
            sourceHeight: 200,
            sourceWidth: 100,
            visual: new Container(),
            width: 100,
          }
        : null,
  );
  if (stubTween) renderer.characterView.tween = vi.fn();
  return renderer;
}

function createLiveCharacterRenderer(): any {
  const renderer = createCharacterRenderer();
  renderer.app = { stage: new Container() };
  renderer.characterView.tween = vi.fn(
    (
      _state: unknown,
      _durationMs: number,
      step: (progress: number) => void,
      done?: () => void,
      options?: TweenStartOptions,
    ) => {
      step(1);
      done?.();
      options?.onComplete?.();
    },
  );
  return renderer;
}

/** What runtime.ts builds for `[character(name=..., focus=...)]`. */
function characterCommand(name: string, expression: string): any {
  return {
    blackEnd: Number.NaN,
    blackStart: Number.NaN,
    block: false,
    characterKey: "avg_test",
    dimmed: false,
    durationMs: 0,
    enterFrom: undefined,
    enterPosition: undefined,
    expression,
    fadeIdentity: "avg_test",
    focus: 0,
    nativeKey: name,
    slot: "m",
    transType: 0,
  };
}

/** A `[characteraction(type="move", xpos=..., fadetime=...)]` on the m slot. */
function moveAction(xOffset: number): any {
  return {
    block: true,
    durationMs: 1000,
    power: 0,
    randomness: 90,
    rotationFromDeg: 0,
    rotationLeftDeg: -15,
    rotationRightDeg: 15,
    slot: "m",
    stop: false,
    times: 1,
    type: "move",
    xOffset,
    yOffset: 0,
  };
}

/** A `face_overlay` character: one body texture plus a face patch. */
function createFaceOverlayRenderer(baked: Texture): any {
  const context: Context = {
    linkMap: {
      avg_test: {
        array: [{ alias: "", face: "face-1", group: 0, name: "1$1" }],
        groups: [
          {
            base: "body-1",
            faceRect: { h: 40, w: 50, x: 10, y: 20 },
            mode: "face_overlay",
          },
        ],
        pos: { x: 0, y: 0 },
        size: { x: 100, y: 200 },
      },
    },
    script: [],
  } as unknown as Context;
  const renderer = createRenderer(context);
  const textures: Record<string, Texture> = {
    "body-1": new Texture({ source: { height: 200, width: 100 } as any }),
    "face-1": new Texture({ source: { height: 40, width: 50 } as any }),
  };
  renderer.textureForCharacterKey = vi.fn(async (key: string) => textures[key]);
  renderer.characterView.bakeDarkenedCharacterTexture = vi.fn(() => baked);
  return renderer;
}

describe("PixiStoryRenderer", () => {
  it("bakes the black gradient into the character texture, replacing the sprites", () => {
    const renderer = createRenderer();
    const baked = new Texture();
    const bakeSpy = vi
      .spyOn(renderer.characterView, "bakeDarkenedCharacterTexture")
      .mockReturnValue(baked);
    const content = new Container();
    const visual = new Container();
    visual.addChild(content);
    const texture = new Texture();
    const body = new Sprite(texture);
    body.width = 100;
    body.height = 200;
    content.addChild(body);

    try {
      renderer.characterView.applyCharacterBlackGradient(
        content,
        [body],
        100,
        200,
        0.2,
        0.7,
      );

      // Native darkens the texture inside the character shader
      // (`_BlackStart`/`_BlackEnd` material floats) BEFORE vertex color
      // (fade alpha / dim tint) multiplies it. The web port must therefore
      // bake the darkening into the texture: any overlay/mask sibling would
      // have its alpha scaled by the fade progress (dst * (1 - a * p)),
      // losing the shading at the start of the fade-in.
      expect(bakeSpy).toHaveBeenCalledWith([body], 100, 200, 40, 140);
      expect(content.children.length).toBe(1);
      const darkened = content.children[0] as Sprite;
      expect(darkened.texture).toBe(baked);
      expect(body.parent).toBeNull();
    } finally {
      bakeSpy.mockRestore();
    }
  });

  it("composites the face onto the body before the black gradient bake", async () => {
    const baked = new Texture();
    const renderer = createFaceOverlayRenderer(baked);
    const composited = new Texture();
    const compositeSpy = vi
      .spyOn(renderer.characterView.characterArt, "bakeOverlay")
      .mockReturnValue(composited);
    renderer.characterView.bakeDarkenedCharacterTexture.mockImplementation(
      (sprites: Sprite[]) => {
        expect(sprites.map((sprite) => sprite.texture)).toEqual([composited]);
        return baked;
      },
    );

    const art = await renderer.characterView.loadArt("avg_test", "1$1");
    const built = renderer.characterView.buildCharacterVisual(
      { blackStart: 0, blackEnd: 1 },
      art,
    );

    // Native composites the face into the same material as the body
    // (`AlphaSplitImageHolder.SetSprite` binds it as `_HGDynamicTex`) and only
    // then applies fade alpha and `_BlackStart`/`_BlackEnd`. The web port must
    // bake the same way: two stacked sprites would each carry a copy of the
    // fade alpha, making the face region's effective opacity 1-(1-p)^2 -- the
    // face would fade in ahead of the body.
    expect(compositeSpy).toHaveBeenCalledWith(
      await renderer.textureForCharacterKey("body-1"),
      await renderer.textureForCharacterKey("face-1"),
      { h: 40, w: 50, x: 10, y: 20 },
    );

    const content = built.visual.children[0] as Container;
    expect(content.children.length).toBe(1);

    // The black gradient then bakes over the single composited sprite, so the
    // darkening covers the whole character.
    expect(
      renderer.characterView.bakeDarkenedCharacterTexture.mock.calls,
    ).toHaveLength(1);
    expect((content.children[0] as Sprite).texture).toBe(baked);
  });

  it("keeps the composited sprite when the black bake fails", async () => {
    const renderer = createFaceOverlayRenderer(new Texture());
    const composited = new Texture();
    vi.spyOn(
      renderer.characterView.characterArt,
      "bakeOverlay",
    ).mockReturnValue(composited);
    renderer.characterView.bakeDarkenedCharacterTexture = vi.fn(() => null);

    const art = await renderer.characterView.loadArt("avg_test", "1$1");
    const built = renderer.characterView.buildCharacterVisual(
      { blackStart: 0, blackEnd: 1 },
      art,
    );

    // The originals are only dropped in favour of a baked texture; when the
    // bake fails the character must stay drawable, just undarkened.
    const content = built.visual.children[0] as Container;
    expect(content.children.length).toBe(1);
    expect((content.children[0] as Sprite).texture).toBe(composited);
  });

  it("dims unfocused characters with tint without making them transparent", () => {
    const renderer = createRenderer();
    const root = new Container();
    const visual = new Container();
    const state = {
      contentAlpha: 1,
      focusBrightness: 0.5,
      root,
      visual,
    };

    renderer.characterView.updateCharacterOpacity(state);

    expect(root.alpha).toBe(1);
    expect(visual.alpha).toBe(1);
    expect(visual.tint).toBe(0x80_80_80);
  });

  it("keeps a characteraction move across a same-key character re-show", () => {
    const renderer = createLiveCharacterRenderer();

    // act12side/level_act12side_01_beg.txt:210-217 -- the move runs, then a
    // bare `character(focus=-1)` re-shows the same name.
    renderer.setCharacter(characterCommand("char_chen", "1$1"));
    renderer.runCharacterAction(moveAction(200));
    expect(renderer.characterView.characterSlots.get("m").motion.actionX).toBe(
      200,
    );

    renderer.setCharacter(characterCommand("char_chen", "1$1"));

    // `Set` skips the `_offset` reset while `m_currentKey == key`, so the
    // character holds the +200 the move left it at instead of snapping back.
    const same = renderer.characterView.characterSlots.get("m");
    expect(same.motion.actionX).toBe(200);
    expect(same.motionLayer.x).toBe(200);
  });

  it("keeps a same-key re-show on its current PostDisplay holder", () => {
    const renderer = createLiveCharacterRenderer();
    renderer.setFocusParam({ blur: false, color: "Colorinverse" });
    renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "ck_char_middle_2",
      to: 0.5,
      type: "cgitem",
    });
    const command = characterCommand("char_chen", "1$1");
    const visual = () => renderer.characterView.characterSlots.get("m").visual;

    renderer.setCharacter(command);
    expect(focusAmount(renderer.sceneEffects, visual())).toBe(0.5);
    renderer.setCharacter(command);
    expect(focusAmount(renderer.sceneEffects, visual())).toBe(0.5);
    renderer.setCharacter(characterCommand("char_chen#2", "2$1"));
    expect(focusAmount(renderer.sceneEffects, visual())).toBe(0);
  });

  it("zeroes the offset when the character re-shows under a different key", () => {
    const renderer = createLiveCharacterRenderer();

    renderer.setCharacter(characterCommand("char_chen", "1$1"));
    renderer.runCharacterAction(moveAction(200));

    // The index is part of `m_currentKey`, so a new expression is a new key
    // and `Set` runs its reset.
    renderer.setCharacter(characterCommand("char_chen#2", "2$1"));
    expect(renderer.characterView.characterSlots.get("m").motion.actionX).toBe(
      0,
    );
  });

  it("compares the raw name ref, not the resolved character and expression", () => {
    const renderer = createLiveCharacterRenderer();

    renderer.setCharacter(characterCommand("char_chen", "1$1"));
    renderer.runCharacterAction(moveAction(200));

    // `char_chen` and `char_chen#1$1` land on the same base/expression pair,
    // but `m_currentKey` holds the ref verbatim and `Set` compares it with
    // `op_Equality` -- so native sees a key change here and resets.
    renderer.setCharacter(characterCommand("char_chen#1$1", "1$1"));
    expect(renderer.characterView.characterSlots.get("m").motion.actionX).toBe(
      0,
    );
  });

  it("lets an enter slide override an earlier characteraction move", () => {
    const renderer = createLiveCharacterRenderer();

    renderer.setCharacter(characterCommand("char_chen", "1$1"));
    renderer.runCharacterAction(moveAction(200));
    renderer.runCharacterAction(
      createActionInput({ scaleX: 1.5, scaleY: 1.5, type: "zoom" }),
    );
    const holder = renderer.characterView.characterSlots.get("m");

    // `_ProcessSlot`'s enter branch drives that same `_offset` through
    // SetCharPos and passes `resetOffsetPos = 0`; the closing
    // `SetCharPos(0, 0, duration)` still lands it back at the origin, so a
    // same-key re-show with an `enter` must not keep the move.
    renderer.setCharacter({
      ...characterCommand("char_chen", "1$1"),
      durationMs: 300,
      enterFrom: "left",
    });
    expect(renderer.characterView.characterSlots.get("m")).toBe(holder);
    expect(holder.motion.actionX).toBe(0);
    expect(holder.scaleX).toBe(1.5);
  });

  it("swaps expressions of the same native character without cross-fading", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");
    renderer.characterView.tween.mockClear();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      expression: "2$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });

    const current = renderer.characterView.characterSlots.get("m");
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([0, 0]);
    expect(previous.root.parent).toBe(renderer.characterView.charLayer);
    expect(current.expression).toBe("2$1");
    expect(current.visual.alpha).toBe(0);
  });

  it("cross-fades when the native fade identity changes", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");
    renderer.characterView.tween.mockClear();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      expression: "2$1",
      fadeIdentity: "avg_test$2",
      slot: "m",
    });

    // `_GetIdWithoutAliasOrIndex` keeps a standalone `$body`, so swapping the
    // body is a real character change: `dontFadeIfSameChar` must not suppress
    // the fade. The stubbed tween never completes, so the outgoing root is
    // still parented and the incoming one is still fully transparent.
    const current = renderer.characterView.characterSlots.get("m");
    // One tween fades the outgoing root out, the other fades the incoming in.
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([150, 150]);
    expect(previous.root.parent).toBe(renderer.characterView.charLayer);
    expect(current.visual.alpha).toBe(0);
  });

  it("keeps the slot transform across charslot commands without pos input", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionFrom: { x: -300, y: 0 },
      positionTo: { x: 0, y: 0 },
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");
    // The stubbed tween never advances, so the slot sits at `posfrom`.
    expect(state.motion.actionX).toBe(-300);

    // Native never resets `_offset.localPosition` between charslot commands
    // (SlotSetCharWithParam uses resetOffsetPos=false), so a bare command
    // must not snap the character back to the default transform.
    renderer.characterView.tween.mockClear();
    renderer.setCharacterSlot({
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });

    expect(state.motion.actionX).toBe(-300);
    // from == to: no transform tween is even started, which also keeps any
    // still-running tween from a previously deferred command alive.
    expect(renderer.characterView.tween).not.toHaveBeenCalled();
  });

  it("waits out the cached slot sequence for an isblock shake after an end=false enter", () => {
    const renderer = createCharacterRenderer(false);
    renderer.app = { stage: new Container() };
    renderer.frames.manual = true;

    // level_act23side_02_beg.txt:425 -- an `end=false` enter leaves a 3s
    // tween in the slot's cached Sequence (`_GetCachedSlotSeq` reuses it
    // until its OnComplete marks it played) without blocking the queue.
    renderer.setCharacterSlot({
      alphaFrom: 0,
      alphaTo: 1,
      block: false,
      characterKey: "avg_test",
      durationMs: 3000,
      expression: "1$1",
      fadeIdentity: "avg_test",
      positionFrom: { x: 0, y: -500 },
      positionTo: { x: 0, y: 0 },
      slot: "l",
    });

    // level_act23side_02_beg.txt:426 -- a 1s shake with isblock=true is
    // INSERTed into the same Sequence (parallel, never Append): it starts at
    // once, but the block waits for the whole sequence -- the 3s enter, not
    // the 1s shake (native text onset measured at +2.2s for 2s+2s).
    const wait = renderer.setCharacterSlot({
      action: "shake",
      block: true,
      durationMs: 1000,
      power: 50,
      randomness: 90,
      slot: "l",
      times: 100,
    });

    renderer.frames.elapse(2999);
    expect(wait?.endReason).toBeUndefined();
    renderer.frames.step(1);
    expect(wait?.endReason).toBe("complete");
  });

  it("ignores a bare posto without posfrom or action=jump", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");
    state.motion.actionX = 120;
    renderer.characterView.tween.mockClear();

    // level_main_14-02_end.txt:379 pattern (`posto=0`, no posfrom): the
    // native posFrom sentinel (1,1) never reaches SlotMoveChar, so this is a
    // no-op instead of a relative move.
    renderer.setCharacterSlot({
      durationMs: 1000,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: 400, y: 0 },
      slot: "m",
    });

    expect(state.motion.actionX).toBe(120);
    expect(renderer.characterView.tween).not.toHaveBeenCalled();
  });

  it("skips the whole zoom when poszoom is outside [0,1]", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      action: "zoom",
      characterKey: "avg_test",
      durationMs: 400,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 1.5, y: 0.5 },
      scaleX: 2,
      scaleY: 2,
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");

    // CharZoom validates the pivot first: out-of-range means return null --
    // the scale change is skipped too.
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
    expect(renderer.characterView.tween).not.toHaveBeenCalled();
  });

  it("dims every slot for unrecognized focus values and relights them for all", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      // level_main_12-05_end.txt:349 pattern: focus="none" is not a native
      // token, so _ProcessFocusArray clears every flag and lights nothing.
      focusSlots: [],
      slot: "l",
    });
    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: [],
      slot: "r",
    });

    expect(
      renderer.characterView.characterSlots.get("l")!.focusBrightness,
    ).toBe(0.5);
    expect(
      renderer.characterView.characterSlots.get("r")!.focusBrightness,
    ).toBe(0.5);

    // An omitted focus resolves to ["all"]: the next command relights
    // everything.
    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "r",
    });

    expect(
      renderer.characterView.characterSlots.get("l")!.focusBrightness,
    ).toBe(1);
    expect(
      renderer.characterView.characterSlots.get("r")!.focusBrightness,
    ).toBe(1);
  });

  it("cross-fades a swap over duration with the default (0,1) fade-in", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");

    // Story_bubble-style plain swap: no afrom/ato, duration>0. Native resets
    // the pair to (0,1) and the crossfade length equals `duration`.
    renderer.setCharacterSlot({
      alphaFrom: 0,
      alphaTo: 1,
      characterKey: "avg_test",
      durationMs: 400,
      expression: "2$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      replaceFadeMs: 400,
      slot: "m",
    });

    const current = renderer.characterView.characterSlots.get("m");
    // The incoming sprite sits at afrom until the (stubbed) tween advances,
    // and the outgoing sprite gets its own fade-out tween.
    expect(current.contentAlpha).toBe(0);
    expect(current.visual.alpha).toBe(0);
    expect(previous.root.parent).toBe(renderer.layers.characters);
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([400, 400]);
  });

  it("clamps a nameless fade toward ato=-1 at the write so it is transparent by half the duration", () => {
    const renderer = createCharacterRenderer();
    renderer.app = { stage: new Container() };

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    renderer.characterView.tween.mockClear();

    // story_whitw2_1_1.txt:475 pattern: `afrom=1` with no ato. Native
    // SlotChangeAlpha runs DOColor toward alpha -1 and the vertex colour
    // clamps, so the sprite is invisible from duration/2 on.
    renderer.setCharacterSlot({
      alphaFrom: 1,
      alphaTo: -1,
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });

    expect(renderer.characterView.tween).toHaveBeenCalledTimes(1);
    const [, durationMs, step, done] =
      renderer.characterView.tween.mock.calls.at(-1) as [
        unknown,
        number,
        (progress: number) => void,
        () => void,
      ];
    expect(durationMs).toBe(400);
    const state = renderer.characterView.characterSlots.get("m");

    step(0.25);
    expect(state.contentAlpha).toBeCloseTo(0.5);
    expect(state.visual.alpha).toBeCloseTo(0.5);

    step(0.5);
    expect(state.contentAlpha).toBeCloseTo(0);
    expect(state.visual.alpha).toBe(0);

    step(0.75);
    expect(state.contentAlpha).toBeCloseTo(-0.5);
    expect(state.visual.alpha).toBe(0);

    done();
    expect(state.contentAlpha).toBe(-1);
    expect(state.visual.alpha).toBe(0);
  });

  it("skips shake entirely when duration is zero", () => {
    const renderer = createCharacterRenderer();
    const shakeSpy = vi
      .spyOn(renderer.characterView, "startShakeAction")
      .mockImplementation(() => {});

    renderer.setCharacterSlot({
      action: "shake",
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      // act22side_02_end.txt:191 pattern: no duration at all.
      power: 8,
      randomness: 1,
      slot: "m",
      times: 100,
    });

    // NeedSkipAnimation(duration): the shake branch returns null.
    expect(renderer.characterView.characterSlots.get("m").expression).toBe(
      "1$1",
    );
    expect(shakeSpy).not.toHaveBeenCalled();
  });

  it("rotates from the standalone angle parameter but not from action=rotate", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      angle: 30,
      characterKey: "avg_test",
      durationMs: 400,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });

    // 2.7.61 drives rotation from the tail `angle` segment of
    // _UpdateSeqWithParam; `action="rotate"` itself is an unknown action.
    expect(renderer.characterView.tween).toHaveBeenCalledTimes(1);

    renderer.characterView.tween.mockClear();
    renderer.setCharacterSlot({
      action: "rotate",
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    expect(renderer.characterView.tween).not.toHaveBeenCalled();
  });

  it("plays an end=false entrance immediately instead of deferring it", () => {
    const renderer = createCharacterRenderer();

    // act23side_02_beg.txt:425 pattern. `end=false` only skips the
    // OnComplete(_SetSeqPlayed) + Play() pair; _GetCachedSlotSeq already
    // handed back an auto-playing DOTween.Sequence, so the entrance runs now.
    // The runtime therefore hands the renderer no defer flag at all.
    renderer.setCharacterSlot({
      alphaFrom: 0,
      alphaTo: 1,
      characterKey: "avg_test",
      durationMs: 2000,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionFrom: { x: 0, y: -500 },
      positionTo: { x: 0, y: 0 },
      replaceFadeMs: 2000,
      slot: "l",
    });

    const state = renderer.characterView.characterSlots.get("l");
    // The stubbed tween never advances, so the slot sits at posfrom/afrom
    // with the move and the fade-in both already started.
    expect(state.motion.actionY).toBe(-500);
    expect(state.contentAlpha).toBe(0);
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([2000, 2000]);
  });

  it("resets the zoom on a named swap, even one whose zoom carries no scale", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");
    // Stand in for a completed earlier zoom (scale + pivot) and a
    // completed move.
    previous.scaleX = 1.5;
    previous.scaleY = 1.5;
    previous.pivotX = 1 / 6;
    previous.pivotY = 0.7;
    previous.motion.actionX = -300;
    renderer.characterView.tween.mockClear();

    // act42side_08_end.txt:109 pattern: `name` + `action="zoom"` with a pivot
    // but no `scale`. `_SetImage` -> GUIUtils.AssignLocalSettings copies the
    // hub prefab's pivot/localScale onto the fore Image on every load, so the
    // swap itself resets the zoom; CharZoom then tweens 1 -> 1 (its default
    // scale), i.e. nothing. The `_offset` move is untouched.
    renderer.setCharacterSlot({
      action: "zoom",
      characterKey: "avg_test",
      durationMs: 400,
      expression: "2$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 0.5, y: 0.5 },
      replaceFadeMs: 400,
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
    expect(state.pivotX).toBe(0.5);
    expect(state.pivotY).toBe(0.5);
    expect(state.motion.actionX).toBe(-300);
    // The back fades while the new holder's zoom stays at unit scale.
    expect(renderer.characterView.tween).toHaveBeenCalledTimes(2);
    // The outgoing holder keeps its own zoom and shares the slot offset.
    expect(previous.scaleX).toBe(1.5);
    expect(previous.scaleY).toBe(1.5);
    expect(previous.pivotX).toBe(1 / 6);
    expect(previous.pivotY).toBe(0.7);
    expect(previous.motion).toBe(state.motion);

    // The zoom branch never reaches SlotMoveChar, so posfrom is inert: it must
    // not snap the slot to -300 the way the plain-move branch would.
    state.motion.actionX = 0;
    renderer.setCharacterSlot({
      action: "zoom",
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionFrom: { x: -300, y: 0 },
      positionTo: { x: 400, y: 0 },
      slot: "m",
    });
    expect(state.motion.actionX).toBe(0);
  });

  it("keeps a completed zoom across nameless commands and tweens it back to 1 without a scale", () => {
    const renderer = createCharacterRenderer();
    renderer.app = { stage: new Container() };

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");
    state.scaleX = 1.5;
    state.scaleY = 1.5;
    renderer.characterView.tween.mockClear();

    // No name, no load, no AssignLocalSettings: the fore Image still holds
    // the old zoom, and `CharZoom(..., options.scale = 1.0, duration)` has
    // to start a tween back down to 1 rather than treat 1.5 as the target.
    renderer.setCharacterSlot({
      action: "zoom",
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 0.5, y: 0.5 },
      slot: "m",
    });
    expect(renderer.characterView.tween).toHaveBeenCalledTimes(1);
    const [, durationMs, step] = renderer.characterView.tween.mock.calls[0];
    expect(durationMs).toBe(400);
    expect(state.scaleX).toBe(1.5);
    step(1);
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
  });

  it("applies the zoom pivot shift absolutely so repeated zooms do not drift", () => {
    const renderer = createLiveCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");

    // story_tanya_1_1.txt:344-355 pattern: the same zoom re-issued. CharZoom
    // lerps `rectTransform.pivot` to the given pivot, an absolute target, so
    // the shift settles at one value instead of stacking per command. The
    // stored (y-up) shift is the native centre move `scale * (0.5 - pivot) *
    // size` plus the `(scale - 1) * size / 2` term that cancels the motion
    // layer's corner-origin growth: (0.5-0.6)*1.8*200 + 0.8*200/2 = 44.
    const zoom = {
      action: "zoom" as const,
      durationMs: 0,
      focusMode: "subset" as const,
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 0.5, y: 0.6 },
      scaleX: 1.8,
      scaleY: 1.8,
      slot: "m",
    };
    renderer.setCharacterSlot(zoom);
    expect(state.motionLayer.y).toBeCloseTo(-44);
    renderer.setCharacterSlot(zoom);
    renderer.setCharacterSlot(zoom);
    expect(state.scaleX).toBe(1.8);
    // The shift rides the motion layer next to the `_offset` position.
    expect(state.motionLayer.y).toBeCloseTo(-44);
  });

  it("moves jump with duration 0 and shakemove to posto without a posfrom gate", () => {
    const renderer = createLiveCharacterRenderer();

    renderer.setCharacterSlot({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterView.characterSlots.get("m");

    // `_GenSlotActionTw`: jump with NeedSkipAnimation(duration) falls back to
    // `_GenCharslotMove` -> SlotMoveChar(posFrom, posTo, 0) -> localPosition
    // = posTo, with no (1,1) sentinel gate on this branch.
    renderer.setCharacterSlot({
      action: "jump",
      durationMs: 0,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: 120, y: 30 },
      slot: "m",
    });
    expect(state.motion.actionX).toBe(120);
    expect(state.motion.actionY).toBe(30);

    // shakemove: SlotMoveChar(posFrom, posTo, duration) verbatim. An absent
    // posfrom is the (1,1) default, written as-is.
    renderer.setCharacterSlot({
      action: "shakemove",
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: -40, y: 0 },
      slot: "m",
    });
    expect(state.motion.actionX).toBe(-40);
    expect(state.motion.actionY).toBe(0);

    // A bare jump with a duration lands at localPosition + posTo, and posTo
    // defaults to (1,1) too.
    renderer.setCharacterSlot({
      action: "jump",
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    expect(state.motion.actionX).toBe(-39);
    expect(state.motion.actionY).toBe(1);
  });

  it("evicts unreferenced face-overlay bakes beyond the cache limit only", () => {
    const loader = new CharacterArtLoader(() => Texture.WHITE);
    const baked = Array.from({ length: 11 }, () => {
      const texture = new Texture();
      vi.spyOn(texture, "destroy").mockImplementation(() => {});
      return texture;
    });
    const bake = vi.spyOn(loader as any, "bakeOverlay");
    for (const texture of baked) bake.mockReturnValueOnce(texture);
    const draw = (index: number) => {
      const art = loader.load({
        body: "body",
        face: {
          group: 0,
          image: `face-${index}`,
          rect: { h: 1, w: 1, x: 0, y: 0 },
        },
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      });
      if (!art || art instanceof Promise)
        throw new Error("Expected cached art");
      return art.acquire();
    };
    const pinnedA = draw(0);
    const pinnedB = draw(1);
    for (let index = 2; index < 10; index += 1) draw(index)?.release?.();

    expect(
      baked.filter((texture) => vi.mocked(texture.destroy).mock.calls.length),
    ).toEqual(baked.slice(2, 4));

    pinnedA?.release?.();
    draw(10)?.release?.();
    expect(baked[0].destroy).toHaveBeenCalledWith(true);
    expect(baked[1].destroy).not.toHaveBeenCalled();
    pinnedB?.release?.();
    loader.destroy();
  });

  it("uses a zero-duration image swap for an explicit enter without transtype", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");
    renderer.characterView.tween.mockClear();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      enterFrom: "left",
      expression: "2$1",
      fadeIdentity: "avg_test$2",
      slot: "m",
    });

    // Native `_ProcessSlot`'s enter branch feeds the fade duration through
    // `_ProcessDurationWithTransType`, and `transtype`'s default NONE returns
    // 0 there: the image swaps at once even for a different character -- the
    // outgoing root is disposed and the incoming one is opaque from frame 0 --
    // while the move tween still runs for the full duration.
    const current = renderer.characterView.characterSlots.get("m");
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([0, 0, 150]);
    expect(previous.root.parent).toBe(renderer.characterView.charLayer);
    expect(current.visual.alpha).toBe(0);
  });

  it("still fades an explicit enter when transtype is ALPHA_IN", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterView.characterSlots.get("m");
    renderer.characterView.tween.mockClear();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      enterFrom: "left",
      expression: "2$1",
      fadeIdentity: "avg_test$2",
      slot: "m",
      transType: 1,
    });

    // `_ProcessDurationWithTransType` only zeroes the duration for NONE, so an
    // explicit ALPHA_IN keeps fading while entering.
    const current = renderer.characterView.characterSlots.get("m");
    expect(
      renderer.characterView.tween.mock.calls.map((call: unknown[]) => call[1]),
    ).toEqual([150, 150, 150]);
    expect(previous.root.parent).toBe(renderer.characterView.charLayer);
    expect(current.visual.alpha).toBe(0);
  });

  it("offsets the horizontal enter start by each slot's own resting offset", () => {
    const renderer = createRenderer();

    // `_GenPosition` adds +200 for LEFT and -200 for RIGHT before the
    // 1152 horizontal delta, cancelling the slot's own offset from the panel
    // centre so all three start at the same absolute off-screen x. The
    // vertical delta has no such term, and Unity y-up flips to y-down.
    expect(renderer.characterView.enterOffset("l", "left")).toEqual({
      x: -952,
      y: 0,
    });
    expect(renderer.characterView.enterOffset("m", "left")).toEqual({
      x: -1152,
      y: 0,
    });
    expect(renderer.characterView.enterOffset("r", "left")).toEqual({
      x: -1352,
      y: 0,
    });
    expect(renderer.characterView.enterOffset("l", "right")).toEqual({
      x: 1352,
      y: 0,
    });
    expect(renderer.characterView.enterOffset("r", "right")).toEqual({
      x: 952,
      y: 0,
    });
    expect(renderer.characterView.enterOffset("l", "up")).toEqual({
      x: 0,
      y: -1072,
    });
    expect(renderer.characterView.enterOffset("r", "down")).toEqual({
      x: 0,
      y: 1072,
    });
    expect(renderer.characterView.enterOffset("l", undefined)).toEqual({
      x: 0,
      y: 0,
    });
    // Explicit xpos/ypos replace `_GenPosition` outright, slot term included.
    expect(
      renderer.characterView.enterOffset("l", "left", { x: 12, y: 34 }),
    ).toEqual({
      x: 12,
      y: 34,
    });
  });

  it("eases the enter slide with OutCubic and leaves the fade linear", () => {
    const renderer = createCharacterRenderer();

    renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      enterFrom: "left",
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
      transType: 1,
    });

    const { root, motionLayer, visual } =
      renderer.characterView.characterSlots.get("m");
    for (const [, , step] of renderer.characterView.tween.mock.calls) step(0.5);

    // Native `SetCharPos` slides with `Ease.OutCubic`; at the halfway point
    // that is 1 - 0.5^3 = 0.875 of the way home, not 0.5: the root starts at
    // 590 - 1152 = -562 and sits 144px short of x = 590 (linear would be 14).
    expect(root.x + motionLayer.x).toBeCloseTo(446, 5);
    expect(visual.alpha).toBe(0.5);
  });
});

/** A `[characteraction(...)]` dispatch as runtime.ts builds it. */
function createActionInput(overrides: Record<string, unknown>): any {
  return {
    block: false,
    durationMs: 100,
    power: 0,
    randomness: 10,
    rotationFromDeg: 0,
    rotationLeftDeg: -15,
    rotationRightDeg: 15,
    scaleX: 1,
    scaleY: 1,
    slot: "m",
    stop: false,
    times: 3,
    xOffset: 0,
    yOffset: 0,
    ...overrides,
  };
}

/** A slot stood up through the real `setCharacter`, with a live app. */
function createActionSlot(renderer: any, slot: string): any {
  const command = characterCommand("char_chen", "1$1");
  command.slot = slot;
  renderer.setCharacter(command);
  return renderer.characterView.characterSlots.get(slot);
}

describe("PixiStoryRenderer characteraction", () => {
  it("exits along the native direction table including up and down", () => {
    const renderer = createLiveCharacterRenderer();

    const middle = createActionSlot(renderer, "m");
    renderer.runCharacterAction(
      createActionInput({ direction: "left", type: "exit" }),
    );
    expect(middle.motion.actionX).toBe(-1152);
    expect(middle.motion.actionY).toBe(0);

    renderer.runCharacterAction(
      createActionInput({ direction: "right", type: "exit" }),
    );
    expect(middle.motion.actionX).toBe(1152);

    // Vertical exits apply +/-1072 on the (up-positive) action axis and also
    // snap the horizontal drift back to the rest anchor.
    renderer.runCharacterAction(
      createActionInput({ direction: "up", type: "exit" }),
    );
    expect(middle.motion.actionX).toBe(0);
    expect(middle.motion.actionY).toBe(1072);
    renderer.runCharacterAction(
      createActionInput({ direction: "down", type: "exit" }),
    );
    expect(middle.motion.actionY).toBe(-1072);

    // Unknown directions exit to the (0,0) rest anchor, like _GenExitPosition.
    renderer.runCharacterAction(
      createActionInput({ direction: undefined, type: "exit" }),
    );
    expect(middle.motion.actionX).toBe(0);
    expect(middle.motion.actionY).toBe(0);

    // Slot-specific table rows.
    const left = createActionSlot(renderer, "l");
    renderer.runCharacterAction(
      createActionInput({ direction: "left", slot: "l", type: "exit" }),
    );
    expect(left.motion.actionX).toBe(-952);
    const right = createActionSlot(renderer, "r");
    renderer.runCharacterAction(
      createActionInput({ direction: "left", slot: "r", type: "exit" }),
    );
    expect(right.motion.actionX).toBe(-1352);
  });

  it("uses exit xpos/ypos as the SetCharPos offset when both are present", () => {
    const renderer = createLiveCharacterRenderer();
    const state = createActionSlot(renderer, "m");

    // SetCharPos writes the pair straight into `_offset.localPosition`, the
    // same slot-anchor displacement space as the _GenExitPosition rows; it is
    // not converted from story coordinates.
    renderer.runCharacterAction(
      createActionInput({
        absolutePosition: { x: 300, y: 200 },
        direction: "left",
        type: "exit",
      }),
    );

    expect(state.motion.actionX).toBe(300);
    expect(state.motion.actionY).toBe(200);
  });

  it("treats zoom xpos/ypos as the image pivot and scales around it", () => {
    const renderer = createLiveCharacterRenderer();
    const state = createActionSlot(renderer, "m");

    // avg_test image is 100x200 px; Unity pivot y is measured from the
    // bottom. The pivot point stays where the resting rect was centred, so
    // the motion layer gets the same shift compensation the `charslot` zoom
    // applies (see characterSlotZoom): (0.5 - pivot) * scale * size with the
    // corner-growth cancellation, shiftY stored in Unity's y-up.
    renderer.runCharacterAction(
      createActionInput({
        pivot: { x: 0.8, y: 0.2 },
        scaleX: 2,
        scaleY: 2,
        type: "zoom",
      }),
    );

    expect(state.scaleX).toBe(2);
    expect(state.scaleY).toBe(2);
    // The image point (0.8w, 0.2-from-bottom) stays pinned at the rest
    // centre: the doubled image spans [-110, 90]x[-220, 180] around it.
    expect(state.motionLayer.x).toBeCloseTo(-110);
    expect(state.motionLayer.y).toBeCloseTo(-220);

    // A later zoom with the default 0.5/0.5 pivot (what the runtime always
    // sends when xpos/ypos are absent) un-shifts and re-centres.
    renderer.runCharacterAction(
      createActionInput({
        pivot: { x: 0.5, y: 0.5 },
        scaleX: 1,
        scaleY: 1,
        type: "zoom",
      }),
    );
    expect(state.motionLayer.x).toBe(0);
    expect(state.motionLayer.y).toBe(0);
  });

  it("awaits the full shake duration when blocking, even with zero power", () => {
    const renderer = createLiveCharacterRenderer();
    createActionSlot(renderer, "m");
    renderer.frames.manual = true;
    delete renderer.characterView.tween;
    // CharShake returns a tween of fadeTime even with zero shake power.
    const wait = renderer.runCharacterAction(
      createActionInput({ block: true, durationMs: 400, type: "shake" }),
    );
    renderer.frames.elapse(399);
    expect(wait?.endReason).toBeUndefined();
    renderer.frames.step(1);
    expect(wait?.endReason).toBe("complete");
  });

  it("runs jump as one tween of the fade duration with the jumps inside", () => {
    const renderer = createLiveCharacterRenderer();
    createActionSlot(renderer, "m");
    const tweens: Array<{
      durationMs: number;
      step: (progress: number) => void;
      done?: () => void;
      options?: TweenStartOptions;
    }> = [];
    renderer.characterView.tween = vi.fn(
      (
        _state: unknown,
        durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
        options?: TweenStartOptions,
      ) => {
        tweens.push({ durationMs, step, done, options });
      },
    );

    const wait = renderer.runCharacterAction(
      createActionInput({
        block: true,
        durationMs: 400,
        power: 20,
        times: 4,
        type: "jump",
        xOffset: 100,
      }),
    );

    expect(tweens.map((tween) => tween.durationMs)).toEqual([400]);
    expect(wait?.endReason).toBeUndefined();

    const state = renderer.characterView.characterSlots.get("m");
    const jumpTween = tweens[0]!;
    // The y arc is DOLocalJump's relative OutQuad yoyo (times=4 → 8 half
    // cycles of width 1/8 in sequence time): even half-cycles play
    // Ease.OutQuad forward, odd ones replay it backwards. CharJump's
    // SetEase(OutCubic) warps that sequence time, so raw progress p samples
    // the yoyo at OutCubic(p); `atSequenceTime` inverts the warp.
    const atSequenceTime = (time: number) => 1 - Math.cbrt(1 - time);
    jumpTween.step(atSequenceTime(0.125));
    expect(state.motion.actionY).toBeCloseTo(20, 9);
    jumpTween.step(atSequenceTime(0.25));
    expect(state.motion.actionY).toBeCloseTo(0, 9);
    jumpTween.step(atSequenceTime(0.375));
    expect(state.motion.actionY).toBeCloseTo(20, 9);
    // Mid-arc samples: OutQuad(0.5) = 0.75 on the way up and back down
    // (a linear ramp would read 10 here, a sine arc ~14.1).
    jumpTween.step(atSequenceTime(0.0625));
    expect(state.motion.actionY).toBeCloseTo(15, 9);
    jumpTween.step(atSequenceTime(0.1875));
    expect(state.motion.actionY).toBeCloseTo(15, 9);
    // The warp front-loads the bounces: at a quarter of the wall time the
    // sequence is already 1 - 0.75^3 = 57.8% through, inside the 5th half
    // cycle (rising again).
    jumpTween.step(0.25);
    expect(state.motion.actionY).toBeCloseTo(20 * (1 - (1 - 0.625) ** 2), 9);

    // Finalize the tweens the way the real TweenRunner does: step(1) + done.
    for (const tween of tweens) {
      tween.step(1);
      tween.done?.();
      tween.options?.onComplete?.();
    }
    expect(wait?.endReason).toBe("complete");
    expect(state.motion.actionY).toBe(0);
    expect(state.motion.actionX).toBe(100);
  });

  it("eases move and exit along DOTween Ease.OutCubic, jump through its sequence ease", () => {
    const renderer = createLiveCharacterRenderer();
    createActionSlot(renderer, "m");
    const steps: Array<(progress: number) => void> = [];
    renderer.characterView.tween = vi.fn(
      (
        _state: unknown,
        _durationMs: number,
        step: (progress: number) => void,
      ) => {
        steps.push(step);
      },
    );

    const state = renderer.characterView.characterSlots.get("m");
    // OutCubic(0.25) = 1 - 0.75^3 = 0.578125.
    renderer.runCharacterAction(
      createActionInput({ durationMs: 400, type: "move", xOffset: 200 }),
    );
    steps[0]!(0.25);
    expect(state.motion.actionX).toBe(200 * 0.578125);

    state.motion.actionX = 0;
    steps.length = 0;
    renderer.runCharacterAction(
      createActionInput({ direction: "left", durationMs: 400, type: "exit" }),
    );
    steps[0]!(0.25);
    expect(state.motion.actionX).toBe(-1152 * 0.578125);

    // DOLocalJump's x tween is Linear and its y displacement is
    // EasedValue(OutQuad) over the arc tween's elapsed percentage, but
    // CharJump's SetEase(OutCubic) on the Sequence warps the time both see
    // (Sequence.DoApplyTween evaluates the sequence ease first).
    state.motion.actionX = 0;
    state.motion.actionY = 0;
    steps.length = 0;
    renderer.runCharacterAction(
      createActionInput({
        durationMs: 400,
        power: 0,
        times: 2,
        type: "jump",
        xOffset: 200,
        yOffset: 100,
      }),
    );
    steps[0]!(0.25);
    expect(state.motion.actionX).toBe(200 * 0.578125);
    expect(state.motion.actionY).toBe(100 * (1 - (1 - 0.578125) ** 2));
  });

  it("shakes along DOTween's linear waypoint walk, not an OutCubic-warped one", () => {
    const renderer = createLiveCharacterRenderer();
    const state = createActionSlot(renderer, "m");
    const calls: Array<{
      options?: { ease?: unknown };
      step: (progress: number) => void;
    }> = [];
    renderer.characterView.tween = vi.fn(
      (
        _state: unknown,
        _durationMs: number,
        step: (progress: number) => void,
        _done?: () => void,
        options?: { ease?: unknown },
      ) => {
        calls.push({ options, step });
      },
    );
    // Random 0.5 → start angle 180° and zero Full-mode tilt, so the first
    // waypoint is exactly (-power, 0).
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    try {
      renderer.runCharacterAction(
        createActionInput({
          durationMs: 1000,
          power: 10,
          times: 10,
          type: "shake",
        }),
      );
    } finally {
      random.mockRestore();
    }

    // SetShake's startup forces Ease.Linear over CharShake's OutCubic.
    expect(calls).toHaveLength(1);
    expect(calls[0]!.options?.ease).toBeUndefined();
    // vibrato 10 × 1s = 10 segments weighted 1..10 (sum 55): the first one
    // ends at 1/55 and is sampled linearly halfway through.
    calls[0]!.step(1 / 110);
    expect(state.motion.shakeOffsetX).toBeCloseTo(-5, 9);
    expect(state.motion.shakeOffsetY).toBeCloseTo(0, 9);
    calls[0]!.step(1 / 55);
    expect(state.motion.shakeOffsetX).toBeCloseTo(-10, 9);
  });
});

describe("character commands during playback", () => {
  const coldCharacterLinks: Context["linkMap"] = {
    avg_cold: {
      array: [{ alias: "", group: -1, image: "cold-body", name: "1$1" }],
      groups: [],
      pos: { x: 0, y: 0 },
      size: { x: 100, y: 200 },
    },
  };

  // The widget preloads both body and face before starting. Override the
  // texture lookup after preloading to exercise the renderer's fallback.
  function deferColdCharacter(renderer: ReturnType<typeof createRenderer>) {
    const load = Promise.withResolvers<Texture | null>();
    const loadTexture = renderer.textureForCharacterKey.bind(renderer);
    renderer.textureForCharacterKey = vi.fn((key: string) =>
      key === "cold-body" ? load.promise : loadTexture(key),
    );
    return load;
  }

  it.each([
    { reference: "avg_alias@smile", portrait: "smile" },
    { reference: "avg_alias@smile ", portrait: "default" },
  ])(
    "mounts the preloaded charslot portrait for '$reference'",
    async ({ reference, portrait }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          `[charslot(slot="m",name="${reference}",duration=0,isblock=true)]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        {
          avg_alias: {
            array: [
              { alias: "", group: -1, image: "avg_alias/default", name: "1$1" },
              {
                alias: "smile",
                group: -1,
                image: "avg_alias/smile",
                name: "2$1",
              },
            ],
            groups: [],
            pos: { x: 0, y: 0 },
            size: { x: 100, y: 200 },
          },
        },
      );
      const load = vi
        .spyOn(Assets, "load")
        .mockRejectedValue(
          new Error("unexpected texture load during playback"),
        );
      const started = runtime.start();
      try {
        const { characters, cgItems } = renderer.layers;
        expect(load).not.toHaveBeenCalled();
        const visual =
          characters.children[0].children[0].children[0].children[0];
        const sprite = visual.children[0].children[0] as Sprite;
        expect(sprite.texture.label).toBe(portrait);
        expect(cgItems.children).toHaveLength(0);
        app.ticker.update(16);
        expect(cgItems.children).toHaveLength(1);
      } finally {
        load.mockRestore();
        destroy();
        await started;
      }
    },
  );

  it.each([
    '[character(name="avg_cold",fadetime=0)]',
    '[charslot(slot="m",name="avg_cold",duration=0)]',
  ])("swaps zero-duration portraits in Update with %s", async (swap) => {
    const draws: number[][][] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[delay(time=0.016)]",
        swap,
        '[name="A"]ok',
      ],
      ({ characters }) => {
        draws.push(
          characters.children.map((root) => [
            root.x,
            root.alpha * root.children[0].children[0].children[0].alpha,
          ]),
        );
      },
      {
        avg_cold: { ...coldCharacterLinks.avg_cold, pos: { x: 100, y: 0 } },
      },
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      app.ticker.update(48);
      expect(draws).toEqual([
        [[590, 1]],
        [
          [590, 1],
          [690, 0],
        ],
        [[690, 1]],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("fades out a zero-duration character clear in Update", async () => {
    const draws: number[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[delay(time=0.016)]",
        "[character(fadetime=0)]",
        '[name="A"]ok',
      ],
      ({ characters }) => draws.push(characters.children.length),
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      app.ticker.update(48);
      expect(draws).toEqual([1, 1, 0]);
    } finally {
      destroy();
      await started;
    }
  });

  it("releases the old back holder when a character interrupts a charslot swap", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",name="avg_cold",duration=0.128)]',
        '[character(name="avg_npc_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      app.ticker.update(16);
      const oldest = characters.children[0];
      app.ticker.update(32);
      expect(oldest.destroyed).toBe(true);
      expect(characters.children).toHaveLength(2);
      app.ticker.update(48);
      expect(characters.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("raises both holders of the focused slot during an overlapping swap", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",name2="avg_1012_skadisp_1",focus=1,fadetime=0)]',
        "[delay(time=0.016)]",
        '[charslot(slot="l",name="avg_cold",duration=0.128)]',
        '[character(name="avg_cold",name2="avg_1012_skadisp_1",focus=1,fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      app.ticker.update(16);
      const [right, leftBack] = characters.children;
      app.ticker.update(32);
      const leftFront = renderer.characterView.characterSlots.get("l").root;
      expect(characters.children).toEqual([right, leftBack, leftFront]);
      app.ticker.update(48);
      expect(characters.children).toEqual([right, leftBack, leftFront]);
    } finally {
      destroy();
      await started;
    }
  });

  it("raises the slot selected by charslot focus while both holders fade", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",name2="avg_1012_skadisp_1",focus=1,fadetime=0)]',
        "[delay(time=0.016)]",
        '[charslot(slot="l",name="avg_cold",focus="right",duration=0.128)]',
        "[delay(time=0)]",
        '[charslot(slot="m",focus="left")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      app.ticker.update(16);
      const [right, leftBack] = characters.children;
      app.ticker.update(32);
      const leftFront = renderer.characterView.characterSlots.get("l").root;
      expect([...characters.children]).toEqual([leftBack, leftFront, right]);
      expect(leftFront.children[0].children[0].children[0].tint).toBe(0x808080);
      app.ticker.update(48);
      expect([...characters.children]).toEqual([right, leftBack, leftFront]);
      expect(leftBack.alpha).toBe(0.875);
      expect(leftFront.children[0].children[0].children[0].tint).toBe(0xffffff);
      expect(right.children[0].children[0].children[0].tint).toBe(0x808080);
      app.ticker.update(64);
      // The swap's original DOColor still writes its target tint while fading.
      expect(leftFront.children[0].children[0].children[0].tint).toBe(0x808080);
      expect(leftFront.children[0].children[0].children[0].alpha).toBe(0.25);
      expect(leftBack.alpha).toBe(0.75);
      expect([...characters.children]).toEqual([right, leftBack, leftFront]);
      app.ticker.update(160);
      expect(leftBack.destroyed).toBe(true);
      expect(characters.children).toEqual([right, leftFront]);
    } finally {
      destroy();
      await started;
    }
  });

  it("fades the replacement character's focus color from white while recycling the back image", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",name2="avg_1012_skadisp_1",focus=1,fadetime=0,blackstart2=0.25,blackend2=0.75)]',
        "[delay(time=0.016)]",
        '[character(name="avg_npc_1",name2="avg_cold",focus=1,fadetime=0.064)]',
        '[characteraction(name="right",type="move",xpos=64,fadetime=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const oldBake = new Texture();
    vi.spyOn(
      renderer.characterView,
      "bakeDarkenedCharacterTexture",
    ).mockReturnValueOnce(oldBake);
    const started = runtime.start();
    try {
      const { characterSlots, backHolders } = renderer.characterView;
      app.ticker.update(16);
      const oldRoot = characterSlots.get("r").root;
      const samples = [32, 48, 64, 80, 96].map((tick) => {
        app.ticker.update(tick);
        const { motionLayer, visual } = characterSlots.get("r");
        return [
          motionLayer.x,
          visual.alpha,
          visual.tint,
          backHolders.get("r")?.root.alpha ?? 0,
          oldBake.destroyed,
          renderer.layers.cgItems.children.length,
        ];
      });
      expect(samples).toEqual([
        [0, 0, 0xffffff, 1, false, 0],
        [37, 0.25, 0xdfdfdf, 0.75, false, 0],
        [56, 0.5, 0xbfbfbf, 0.5, false, 0],
        [63, 0.75, 0x9f9f9f, 0.25, false, 0],
        [64, 1, 0x808080, 0, true, 1],
      ]);
      expect(oldRoot.destroyed).toBe(true);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps the focused slot order when character re-shows both side slots", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",name2="avg_1012_skadisp_1",fadetime=0)]',
        '[charslot(slot="l",focus="left")]',
        "[delay(time=0.016)]",
        '[character(name="avg_npc_1",name2="avg_1012_skadisp_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      const left = renderer.characterView.characterSlots.get("l").root;
      const right = renderer.characterView.characterSlots.get("r").root;
      for (const tick of [16, 32, 48]) {
        app.ticker.update(tick);
        expect(characters.children).toEqual([right, left]);
      }
    } finally {
      destroy();
      await started;
    }
  });

  it("mounts art into the existing layer of an unfocused empty slot", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="l",name="avg_cold",focus="none",duration=0.032)]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      const left = renderer.characterView.characterSlots.get("l").root;
      const middle = renderer.characterView.characterSlots.get("m").root;
      for (const tick of [16, 32, 48]) {
        app.ticker.update(tick);
        expect(characters.children).toEqual([left, middle]);
      }
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    { enter: "", startX: 0, updateX: 0 },
    { enter: ',enter="left",transtype=1', startX: -1152, updateX: -144 },
  ])(
    "writes the slot position when portrait loading fails with enter=$enter",
    async ({ enter, startX, updateX }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
          `[character(name="avg_cold",fadetime=0.032${enter})]`,
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = deferColdCharacter(renderer);
      const started = runtime.start();
      try {
        const { characters } = renderer.layers;
        const [root] = characters.children;
        app.ticker.update(16);
        expect(root.children[0].x).toBe(120);
        load.resolve(null);
        await setImmediate();
        expect(root.children[0].x).toBe(startX);
        app.ticker.update(32);
        expect(root.children[0].x).toBe(updateX);
        expect(root.alpha).toBe(0.5);
        app.ticker.update(48);
        expect(characters.children).toHaveLength(0);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("continues an in-flight fixed-slot move after a different-key character swap", async () => {
    const draws: number[][] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.064)]',
        "[delay(time=0.016)]",
        '[character(name="avg_cold",fadetime=0.032)]',
        '[name="A"]ok',
      ],
      ({ characters }) =>
        draws.push(characters.children.map((root) => root.children[0].x)),
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      for (const time of [16, 32, 48, 64]) app.ticker.update(time);
      expect(draws).toEqual([[69.375], [0, 0], [118.125, 118.125], [120]]);
    } finally {
      destroy();
      await started;
    }
  });

  it("resumes an older move after a shorter overlapping move ends", async () => {
    const draws: number[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.064)]',
        '[characteraction(name="middle",type="move",xpos=-20,fadetime=0.032,isblock=true)]',
        '[name="A"]ok',
      ],
      ({ characters }) => draws.push(characters.children[0].children[0].x),
    );
    const started = runtime.start();
    try {
      for (const time of [16, 32, 48, 64]) app.ticker.update(time);
      expect(draws).toEqual([-8.828125, -20, 118.125, 120]);
    } finally {
      destroy();
      await started;
    }
  });

  it("lets a later move write over an older jump on the fixed offset", async () => {
    const draws: number[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="jump",power=20,times=1,fadetime=0.064)]',
        '[characteraction(name="middle",type="move",fadetime=0.032,isblock=true)]',
        '[name="A"]ok',
      ],
      ({ characters }) => draws.push(characters.children[0].children[0].y),
    );
    const started = runtime.start();
    try {
      for (const time of [16, 32, 48, 64]) app.ticker.update(time);
      expect(draws).toEqual([-2.43896484375, 0, -1.23046875, 0]);
    } finally {
      destroy();
      await started;
    }
  });

  it("resumes the older shake after a shorter shake on the same slot", async () => {
    const positions: number[] = [];
    const counts: number[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",action="shake",power=10,times=1,duration=0.064,end=false)]',
        '[charslot(slot="m",action="shake",power=0,times=1,duration=0.032,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        positions.push(characters.children[0].children[0].x);
        counts.push(cgItems.children.length);
      },
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const started = runtime.start();
    random.mockRestore();
    try {
      for (const time of [16, 32, 48, 64]) app.ticker.update(time);
      // ApplyInternalCycle (2791 @ 0x18442B5B0) still samples a child
      // inserted at zero when the previous position equals its end.
      expect(positions[0]).toBeCloseTo(-7.5);
      expect(positions[1]).toBeCloseTo(-7.5);
      expect(positions[2]).toBeCloseTo(-7.5);
      expect(positions[3]).toBeCloseTo(0);
      expect(counts).toEqual([0, 0, 0, 1]);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    { move: "", positions: [74, 74, 74, 74] },
    { move: ',posfrom="40,0",posto="104,0"', positions: [40, 96, 104, 104] },
  ])(
    "kills the standalone move while keeping any nested rotation-frame move: $move",
    async ({ move, positions }) => {
      const draws: number[][] = [];
      const { app, destroy, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          '[characteraction(name="middle",type="move",xpos=128,fadetime=0.128)]',
          "[delay(time=0.016)]",
          `[charslot(slot="m",angle=90,duration=0.032,isblock=true${move})]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        ({ characters, cgItems }) => {
          const root = characters.children[0];
          draws.push([root.children[0].x, root.angle, cgItems.children.length]);
        },
      );
      const started = runtime.start();
      try {
        for (const time of [16, 32, 48, 64, 80]) app.ticker.update(time);
        expect(draws).toEqual([
          [42.25, 0, 0],
          [positions[0], 0, 0],
          [positions[1], 135, 0],
          [positions[2], 270, 1],
          [positions[3], 270, 1],
        ]);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("snaps a zero-duration angle without killing the standalone move", async () => {
    const draws: number[][] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=128,fadetime=0.064)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",angle=90,circles=2,duration=0,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const root = characters.children[0];
        draws.push([root.children[0].x, root.angle, cgItems.children.length]);
      },
    );
    const started = runtime.start();
    try {
      for (const time of [16, 32, 48, 64]) app.ticker.update(time);
      expect(draws).toEqual([
        [74, 0, 0],
        [112, -90, 0],
        [126, -90, 1],
        [128, -90, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("rotates the drawn portrait around the translated slot's bottom pivot", async () => {
    const draws: Array<{ count: number; x: number; y: number }> = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        '[charslot(slot="m",angle=90,inverse=true,duration=0.032,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const image =
          characters.children[0].children[0].children[0].children[0];
        const { x, y } = image.toGlobal({ x: 0, y: 0 });
        draws.push({ count: cgItems.children.length, x, y });
      },
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      // The test portrait's top-left starts at (-50, -150) in slot space.
      expect(draws[0]?.x).toBeCloseTo(760 - 200 * Math.SQRT1_2);
      expect(draws[0]?.y).toBeCloseTo(720 - 100 * Math.SQRT1_2);
      expect(draws[0]?.count).toBe(0);
      expect(draws[1]?.x).toBeCloseTo(610);
      expect(draws[1]?.y).toBeCloseTo(770);
      expect(draws[1]?.count).toBe(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("uses the immediate absolute position for a near-zero charslot jump", async () => {
    const { destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        '[charslot(slot="m",action="jump",posto="0,0",power=10,duration=0.000005)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      expect(renderer.layers.characters.children[0].children[0].x).toBe(0);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    '[character(name="avg_cold",fadetime=0.064)]',
    '[charslot(slot="m",name="avg_cold",duration=0.064)]',
  ])("keeps zooming the outgoing holder after %s", async (swap) => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="zoom",scale=2,fadetime=0.064)]',
        "[delay(time=0.016)]",
        swap,
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      const [old] = characters.children;
      const baseScale = old.children[0].scale.x;
      app.ticker.update(16);
      app.ticker.update(32);
      expect(old.children[0].scale.x).toBe(baseScale * 1.5);
      app.ticker.update(48);
      expect(old.children[0].scale.x).toBe(baseScale * 1.75);
      expect(characters.children[1].children[0].scale.x).toBe(baseScale);
    } finally {
      destroy();
      await started;
    }
  });

  it("continues zooming a physical holder when the third portrait reuses it", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="zoom",xpos=0.75,ypos=0.25,scale=2,fadetime=0.128)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",name="avg_cold",duration=0.064)]',
        '[character(name="avg_npc_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      const [first] = characters.children;
      const baseScale = first.children[0].scale.x;
      app.ticker.update(16);
      app.ticker.update(32);
      expect(first.destroyed).toBe(true);
      app.ticker.update(48);
      const [third] = characters.children;
      expect(third.children[0].scale.x).toBe(baseScale * 1.375);
      expect(third.children[0].x).toBe(-31.640625);
      expect(third.children[0].y).toBe(-31.640625);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps the fixed offset when a character replaces char_empty", async () => {
    const show = '[character(name="avg_npc_1",fadetime=0)]';
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        show,
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        '[charslot(slot="m",name="char_empty")]',
        show,
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      const [root] = renderer.layers.characters.children;
      expect(root.children[0].x).toBe(120);
    } finally {
      destroy();
      await started;
    }
  });

  it("swaps out the blank holder as blocking animated clear-all ends", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[characteraction(name="middle",type="zoom",scale=2,fadetime=0.128)]',
        "[charslot(duration=0.032,isblock=true)]",
        '[character(name="avg_npc_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      app.ticker.update(16);
      expect(characters.children).toHaveLength(0);
      app.ticker.update(32);
      app.ticker.update(48);
      const [root] = characters.children;
      expect(root.children[0].scale.x).toBe(100 / 32);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps the fixed offset when a negative-duration clear skips the child cleanup", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        "[delay(time=0.016)]",
        "[charslot(duration=-0.032,isblock=true)]",
        '[character(name="avg_cold",fadetime=0)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      app.ticker.update(16);
      const [old] = characters.children;
      app.ticker.update(32);
      expect(characters.children).toEqual([old]);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(48);
      expect(old.destroyed).toBe(true);
      expect(characters.children).toHaveLength(1);
      expect(characters.children[0].children[0].x).toBe(120);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    {
      command: '[charslot(slot="m",name="char_empty",duration=0)]',
      frame: 48,
      scale: 1,
      withPortrait: true,
    },
    {
      command: '[charslot(slot="m",name="missing_char",duration=0)]',
      frame: 16,
      scale: 1.125,
      withPortrait: false,
    },
    {
      command: '[character(name="missing_char",fadetime=0)]',
      frame: 16,
      scale: 1.125,
      withPortrait: false,
    },
    {
      command: "[charslot(duration=0.128)]",
      frame: 16,
      scale: 1.125,
      withPortrait: false,
    },
  ])(
    "uses the correct physical holder after $command clears the slot",
    async ({ command, frame, scale, withPortrait }) => {
      const show = '[character(name="avg_npc_1",fadetime=0)]';
      const zoom =
        '[characteraction(name="middle",type="zoom",scale=2,fadetime=0.128)]';
      const prefix = withPortrait
        ? [show, zoom, "[delay(time=0.016)]"]
        : [zoom];
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [...prefix, command, show, '[name="A"]ok'],
        () => {},
      );
      const started = runtime.start();
      try {
        for (let tick = 16; tick <= frame; tick += 16) app.ticker.update(tick);
        const [root] = renderer.layers.characters.children;
        expect(root.children[0].scale.x).toBe((100 / 32) * scale);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it.each([
    {
      afterClear: 1.25,
      zoom: '[charslot(slot="m",action="zoom",poszoom="0.5,0.5",scale=2,duration=0.128)]',
    },
    {
      afterClear: 1.375,
      zoom: '[characteraction(name="middle",type="zoom",scale=2,fadetime=0.128)]',
    },
  ])(
    "clears the sequence and fades the holder after $zoom",
    async ({ zoom, afterClear }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          zoom,
          "[delay(time=0.016)]",
          "[charslot(duration=0.128)]",
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        const { characters } = renderer.layers;
        const [back] = characters.children;
        const baseScale = back.children[0].scale.x;
        app.ticker.update(16);
        app.ticker.update(32);
        expect(back.children[0].scale.x).toBe(baseScale * 1.25);
        app.ticker.update(48);
        expect(back.children[0].scale.x).toBe(baseScale * afterClear);
        expect(back.alpha).toBe(0.875);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("uses the new holder's alpha when a zero-duration charslot replaces a fading character", async () => {
    const draws: number[][] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0.128)]',
        "[delay(time=0)]",
        '[charslot(slot="m",name="avg_cold",duration=0,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const root = characters.children.at(-1)!;
        const holder = root.children[0].children[0].children[0];
        draws.push([root.alpha * holder.alpha, cgItems.children.length]);
      },
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      expect(draws).toEqual([
        [0, 0],
        [1, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("applies the next slot update in the draw that completes a blocking move", async () => {
    const draws: unknown[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.032,isblock=true)]',
        '[charslot(slot="m",focus="r",afrom=0.5,ato=0.5)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const motion = characters.children[0]?.children[0];
        const visual = motion?.children[0]?.children[0];
        draws.push([
          motion?.x,
          visual?.alpha,
          visual?.tint,
          cgItems.children.length,
        ]);
      },
    );
    const started = runtime.start();
    try {
      await setImmediate();
      app.ticker.update(16);
      app.ticker.update(32);
      expect(draws).toEqual([
        [105, 1, 0xffffff, 0],
        [120, 0.5, 0x808080, 1],
      ]);
      await started;
    } finally {
      destroy();
      await started;
    }
  });

  it("writes the OutCubic slot position before resuming a blocking charslot move", async () => {
    const draws: number[][] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",posfrom="0,0",posto="128,64",duration=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const motion = characters.children[0].children[0];
        draws.push([motion.x, motion.y, cgItems.children.length]);
      },
    );
    const started = runtime.start();
    try {
      for (let tick = 16; tick <= 64; tick += 16) app.ticker.update(tick);
      expect(draws).toEqual([
        [74, -37, 0],
        [112, -56, 0],
        [126, -63, 0],
        [128, -64, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("delays the new slot tracks while the previous portrait fades out", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",name="avg_cold",posfrom="80,0",posto="144,0",delay=0.048,duration=0.032,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      app.ticker.update(16);
      const [old] = characters.children;
      app.ticker.update(32);
      const front = characters.children[1];
      const motion = front.children[0];
      const visual = motion.children[0].children[0];
      const samples = [48, 64, 80, 96, 112].map((tick) => {
        app.ticker.update(tick);
        return [motion.x, visual.alpha, old.destroyed, cgItems.children.length];
      });
      expect(samples).toEqual([
        [80, 0, false, 0],
        [80, 0, true, 0],
        [80, 0, true, 0],
        [136, 0.5, true, 0],
        [144, 1, true, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("plays a cross-frame fade independently of the locked slot sequence", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="m",name="avg_npc_1",duration=0.064,end=false)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",afrom=0.625,ato=0,delay=0.048,duration=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const visual = characters.children[0].children[0].children[0].children[0];
      app.ticker.update(16);
      expect(visual.alpha).toBe(0.25);
      app.ticker.update(32);
      expect(visual.alpha).toBe(0.625);

      const samples = [48, 64, 80, 96].map((tick) => {
        app.ticker.update(tick);
        return [visual.alpha, cgItems.children.length];
      });
      expect(samples).toEqual([
        [0.5625, 0],
        [0.375, 1],
        [0.1875, 1],
        [0, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("stops an independent shake when animated clear-all starts", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",afrom=1,ato=1,duration=0.128)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",action="shake",power=10,times=1,delay=0.128,duration=0.128)]',
        "[delay(time=0.016)]",
        "[charslot(duration=0.064,isblock=true)]",
        '[character(name="avg_npc_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const started = runtime.start();
    try {
      const { characters } = renderer.layers;
      const [old] = characters.children;
      for (const tick of [16, 32, 48]) app.ticker.update(tick);
      expect(old.children[0].x).not.toBe(0);
      app.ticker.update(64);
      expect(old.children[0].x).toBe(0);
      app.ticker.update(80);
      expect(old.children[0].x).toBe(0);
      expect(old.alpha).toBe(0.75);

      for (const tick of [96, 112, 128]) app.ticker.update(tick);
      expect(old.destroyed).toBe(true);
      expect(characters.children).toHaveLength(1);
      expect(characters.children[0].children[0].x).toBe(0);
      app.ticker.update(144);
      expect(characters.children[0].children[0].x).toBe(0);
    } finally {
      random.mockRestore();
      destroy();
      await started;
    }
  });

  it.each([
    { end: "false", isblock: "true" },
    { end: "0", isblock: "true" },
    { end: "false", isblock: "1" },
  ])(
    "rejects inserts into the inactive cached sequence left by end=$end with isblock=$isblock",
    async ({ end, isblock }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          `[charslot(slot="m",name="avg_npc_1",duration=0.032,end=${end})]`,
          "[delay(time=0.048)]",
          `[charslot(slot="m",afrom=1,ato=0,delay=0.064,duration=0.032,isblock=${isblock})]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        const { characters, cgItems } = renderer.layers;
        const visual =
          characters.children[0].children[0].children[0].children[0];
        for (const tick of [16, 32, 48, 64]) app.ticker.update(tick);
        expect(visual.alpha).toBe(1);
        app.ticker.update(80);
        expect(visual.alpha).toBe(0.5);
        app.ticker.update(96);
        expect(visual.alpha).toBe(0);
        app.ticker.update(176);
        expect(cgItems.children).toHaveLength(0);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("samples a cross-frame zero-duration replacement on the next Update", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",posfrom="0,0",posto="64,0",duration=0.064,end=false)]',
        "[delay(time=0.016)]",
        '[charslot(slot="m",name="avg_cold",delay=0.048,duration=0,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      app.ticker.update(16);
      const [old] = characters.children;
      app.ticker.update(32);
      const motion = characters.children[1].children[0];
      const visual = motion.children[0].children[0];
      expect(visual.alpha).toBe(0);
      app.ticker.update(48);
      expect(visual.alpha).toBe(1);
      expect(motion.x).toBe(63);
      expect(old.destroyed).toBe(true);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(64);
      expect(motion.x).toBe(64);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps posfrom when a negative-duration slot move ends before the Sequence starts", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        '[charslot(slot="m",posfrom="0,0",posto="-50,0",duration=-0.5,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const motion = characters.children[0].children[0];
      expect(motion.x).toBe(0);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(16);
      expect(motion.x).toBe(0);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    { blockUntilUpdate: true, finalX: 120, type: "move" },
    { blockUntilUpdate: true, finalX: 0, type: "jump" },
    { blockUntilUpdate: false, finalX: 0, type: "shake" },
  ])(
    "dispatches a negative-duration characteraction $type through its native branch",
    async ({ blockUntilUpdate, finalX, type }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          `[characteraction(name="middle",type="${type}",xpos=120,fadetime=-0.5,isblock=true)]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        const { characters, cgItems } = renderer.layers;
        const motion = characters.children[0].children[0];
        expect(motion.x).toBe(0);
        expect(cgItems.children).toHaveLength(blockUntilUpdate ? 0 : 1);
        app.ticker.update(16);
        expect(motion.x).toBe(finalX);
        expect(cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("waits for the delayed focus tween on a different fixed slot", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[delay(time=0.016)]",
        '[charslot(slot="r",focus="none",focusduration=0.032,delay=0.032,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      app.ticker.update(16);
      const visual = characters.children[0].children[0].children[0].children[0];
      app.ticker.update(32);
      const samples = [48, 64, 80, 96].map((tick) => {
        app.ticker.update(tick);
        return [visual.tint, visual.alpha, cgItems.children.length];
      });
      expect(samples).toEqual([
        [0xffffff, 1, 0],
        [0xffffff, 1, 0],
        [0x9f9f9f, 1, 0],
        [0x808080, 1, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("applies children of the same slot sequence in insertion-time order", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",posfrom="10,0",posto="74,0",delay=0.032,duration=0.032,end=false)]',
        '[charslot(slot="m",posfrom="10,0",posto="138,0",duration=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const motion = characters.children[0].children[0];
      const samples = [16, 32, 48, 64].map((tick) => {
        app.ticker.update(tick);
        return [motion.x, cgItems.children.length];
      });
      expect(samples).toEqual([
        [84, 0],
        [122, 0],
        [80, 0],
        [74, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("lets a standalone action update after an already-created slot sequence", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",posfrom="0,0",posto="64,0",duration=0.064,end=false)]',
        '[characteraction(name="middle",type="move",xpos=128,fadetime=0.064)]',
        '[charslot(slot="m",posfrom="0,0",posto="-128,0",duration=0.032,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const motion = characters.children[0].children[0];
      const samples = [16, 32, 64].map((tick) => {
        app.ticker.update(tick);
        return [motion.x, cgItems.children.length];
      });
      expect(samples).toEqual([
        [28.701171875, 0],
        [98.578125, 0],
        [128, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it("plays a shakemove's shake outside the Sequence that owns its move", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[charslot(slot="m",action="shakemove",power=10,times=32,random=0,posfrom="0,0",posto="64,0",duration=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const { shake } = renderer.characterView.slotActionTargets.m;
    const startTween = vi.spyOn(renderer.updatePhaseTweenRunner, "start");
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const started = runtime.start();
    try {
      const targets = startTween.mock.calls
        .filter(([duration]) => duration === 64)
        .map(([, , options]) => (options as TweenStartOptions).target);
      expect(targets).toEqual([shake]);
      expect(renderer.characterView.slotSequences.get("m").tracks).toHaveLength(
        1,
      );
      const { motion, motionLayer } =
        renderer.characterView.characterSlots.get("m");
      app.ticker.update(16);
      expect(motion.actionX).toBe(37);
      expect(motionLayer.x).toBe(29.5);
      expect(renderer.layers.cgItems.children).toHaveLength(0);
      for (const tick of [32, 48, 64]) app.ticker.update(tick);
      expect(motionLayer.x).toBe(64);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
    } finally {
      random.mockRestore();
      destroy();
      await started;
    }
  });

  it.each([
    {
      show: '[charslot(slot="m",name="avg_npc_1",duration=0.064)]',
      alphas: [0.5, 0, 0, 1],
      cgCounts: [0, 0, 0, 1],
    },
    {
      show: '[character(name="avg_npc_1",fadetime=0.064)]',
      alphas: [0.5, 0, 1, 1],
      cgCounts: [0, 1, 1, 1],
    },
  ])(
    "resumes an older fade on the same Image after $show",
    async ({ show, alphas, cgCounts }) => {
      const draws: number[][] = [];
      const { app, destroy, runtime } = await createRenderedPlayback(
        [
          show,
          '[charslot(slot="m",afrom=1,ato=0,duration=0.032,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        ({ characters, cgItems }) => {
          const root = characters.children[0];
          draws.push([
            root.children[0].children[0].children[0].alpha,
            cgItems.children.length,
          ]);
        },
      );
      const started = runtime.start();
      try {
        for (const tick of [16, 32, 48, 64]) app.ticker.update(tick);
        // Only a child on a longer Sequence writes on the Update after
        // its ending sample at 32 ms (ApplyInternalCycle @ 0x18442B5B0).
        expect(draws).toEqual(
          alphas.map((alpha, index) => [alpha, cgCounts[index]]),
        );
      } finally {
        destroy();
        await started;
      }
    },
  );

  it.each([
    '[characteraction(name="middle",type="zoom",xpos=0.75,ypos=0.25,scale=2,fadetime=0.064,isblock=true)]',
    '[charslot(slot="m",action="zoom",poszoom="0.75,0.25",scale=2,duration=0.064,isblock=true)]',
  ])("draws the interpolated pivot and scale for %s", async (command) => {
    const draws: number[][] = [];
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        command,
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ characters, cgItems }) => {
        const motion = characters.children[0].children[0];
        draws.push([
          motion.x,
          motion.y,
          motion.scale.x,
          cgItems.children.length,
        ]);
      },
    );
    const started = runtime.start();
    try {
      const baseScale =
        renderer.layers.characters.children[0].children[0].scale.x;
      for (let tick = 16; tick <= 64; tick += 16) app.ticker.update(tick);
      expect(draws).toEqual([
        [-20.3125, -20.3125, baseScale * 1.25, 0],
        [-43.75, -43.75, baseScale * 1.5, 0],
        [-70.3125, -70.3125, baseScale * 1.75, 0],
        [-100, -100, baseScale * 2, 1],
      ]);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    ['[character(name="avg_cold",fadetime=0)]'],
    ['[charslot(slot="m",name="avg_cold",duration=1,isblock=true)]'],
  ])("cancels cold preparation on a segment skip for %s", async (command) => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        command,
        '[name="A"]skip me',
        "[SkipToThis]",
        '[characteraction(name="middle",type="move",xpos=100,fadetime=0)]',
        '[name="A"]keep the mounted character',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);

    const started = runtime.start();
    const [mounted] = renderer.layers.characters.children;
    const skipped = runtime.skipNode();
    try {
      await setImmediate();
      app.ticker.update(16);
      expect(mounted.children[0].x).toBe(100);
      expect(runtime.getState()).toBe("waiting_input");
      await skipped;

      load.resolve(Texture.EMPTY);
      await setImmediate();
      expect(renderer.layers.characters.children).toEqual([mounted]);
    } finally {
      destroy();
      await Promise.all([started, skipped]);
    }
  });

  it("keeps an already-mounted blocking action running across a segment skip", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.048,isblock=true)]',
        "[SkipToThis]",
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    app.ticker.update(16);
    const [root] = renderer.layers.characters.children;
    const skipped = runtime.skipNode();
    try {
      await setImmediate();
      app.ticker.update(32);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
      expect(renderer.layers.characters.children).toEqual([root]);
      expect(root.children[0].x).toBeLessThan(120);
      app.ticker.update(48);
      expect(root.children[0].x).toBe(120);
    } finally {
      destroy();
      await Promise.all([started, skipped]);
    }
  });

  it("applies an elapsed clear to a partially loaded pair before resuming a skip", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        "[charslot(duration=0.032)]",
        '[character(name="avg_npc_1",name2="avg_cold",fadetime=0)]',
        '[name="A"]skip me',
        "[SkipToThis]",
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);
    const started = runtime.start();
    app.ticker.update(16);
    app.ticker.update(32);
    const beforeSkip = renderer.layers.characters.children.length;
    const skipped = runtime.skipNode();
    try {
      expect(beforeSkip).toBe(1);
      await setImmediate();
      app.ticker.update(48);
      expect(renderer.layers.characters.children).toHaveLength(0);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
      load.resolve(Texture.EMPTY);
      await setImmediate();
      expect(renderer.layers.characters.children).toHaveLength(0);
    } finally {
      destroy();
      await Promise.all([started, skipped]);
    }
  });

  it.each([
    { next: "avg_npc_1", cold: false },
    { next: "avg_cold", cold: false },
    { next: "avg_cold", cold: true },
  ])(
    "keeps an older move's shared completion after a skip and a show of $next (cold: $cold)",
    async ({ next, cold }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          '[characteraction(name="middle",type="move",xpos=120,fadetime=0.064,isblock=true)]',
          "[SkipToThis]",
          `[character(name="${next}",fadetime=0)]`,
          '[characteraction(name="middle",type="move",xpos=100,fadetime=0.128,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = cold ? deferColdCharacter(renderer) : undefined;
      const started = runtime.start();
      app.ticker.update(16);
      const skipped = runtime.skipNode();
      try {
        await setImmediate();
        app.ticker.update(32);
        app.ticker.update(48);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        app.ticker.update(64);
        expect(renderer.layers.cgItems.children).toHaveLength(cold ? 0 : 1);
        load?.resolve(Texture.EMPTY);
        await setImmediate();
        app.ticker.update(80);
        expect(renderer.layers.cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it.each([
    { type: "move", duration: 0.032, released: 1 },
    { type: "move", duration: 0, released: 0 },
    { type: "zoom", duration: 0, released: 1 },
    { type: "shake", duration: 0.032, released: 0 },
  ])(
    "applies a clear of $duration seconds to a deferred $type completion",
    async ({ type, duration, released }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          `[characteraction(name="middle",type="${type}",scale=2,power=10,fadetime=0.064,isblock=true)]`,
          "[SkipToThis]",
          '[character(name="avg_cold",fadetime=0)]',
          `[charslot(duration=${duration})]`,
          '[characteraction(name="middle",type="move",xpos=120,fadetime=0.128,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = deferColdCharacter(renderer);
      const started = runtime.start();
      app.ticker.update(16);
      const skipped = runtime.skipNode();
      try {
        await setImmediate();
        app.ticker.update(32);
        app.ticker.update(64);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        load.resolve(Texture.EMPTY);
        await setImmediate();
        app.ticker.update(96);
        expect(renderer.layers.cgItems.children).toHaveLength(released);
      } finally {
        destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it.each([
    { duration: 0.032, move: 0.064, readyAt: 80, released: 1 },
    { duration: 0.016, move: 0.064, readyAt: 80, released: 0 },
    { duration: 0.064, move: 0.064, readyAt: 96, released: 1 },
    { duration: 0.016, move: 0.096, readyAt: 96, released: 0 },
  ])(
    "replays a clear of $duration seconds and an older $move-second move in Update order",
    async ({ duration, move, readyAt, released }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          `[characteraction(name="middle",type="move",xpos=120,fadetime=${move},isblock=true)]`,
          "[SkipToThis]",
          `[charslot(duration=${duration})]`,
          '[character(name="avg_cold",fadetime=0)]',
          '[characteraction(name="middle",type="move",xpos=120,fadetime=0.128,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = deferColdCharacter(renderer);
      const started = runtime.start();
      app.ticker.update(16);
      const skipped = runtime.skipNode();
      try {
        await setImmediate();
        app.ticker.update(32);
        app.ticker.update(48);
        app.ticker.update(64);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        load.resolve(Texture.EMPTY);
        await setImmediate();
        app.ticker.update(readyAt);
        expect(renderer.layers.characters.children).toHaveLength(0);
        expect(renderer.layers.cgItems.children).toHaveLength(released);
      } finally {
        destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it.each([false, true])(
    "waits for both portraits before replaying a timed clear and an old move (second load cold: %s)",
    async (secondCold) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",name2="avg_npc_1",fadetime=0)]',
          '[characteraction(name="left",type="move",xpos=120,fadetime=0.064,isblock=true)]',
          "[SkipToThis]",
          "[charslot(duration=0.032)]",
          '[character(name="avg_cold",name2="avg_second",fadetime=0)]',
          '[characteraction(name="left",type="move",xpos=120,fadetime=0.128,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        {
          ...coldCharacterLinks,
          avg_second: {
            array: [{ alias: "", group: -1, image: "cold-right", name: "1$1" }],
            groups: [],
            pos: { x: 0, y: 0 },
            size: { x: 100, y: 200 },
          },
        },
      );
      const first = deferColdCharacter(renderer);
      const second = Promise.withResolvers<Texture>();
      const loadTexture = renderer.textureForCharacterKey.bind(renderer);
      renderer.textureForCharacterKey = vi.fn((key: string) =>
        secondCold && key === "cold-right" ? second.promise : loadTexture(key),
      );
      const started = runtime.start();
      app.ticker.update(16);
      const skipped = runtime.skipNode();
      try {
        await setImmediate();
        app.ticker.update(32);
        app.ticker.update(48);
        app.ticker.update(64);
        first.resolve(Texture.EMPTY);
        await setImmediate();
        app.ticker.update(80);
        expect(renderer.layers.cgItems.children).toHaveLength(
          secondCold ? 0 : 1,
        );
        second.resolve(Texture.EMPTY);
        await setImmediate();
        app.ticker.update(96);
        expect(renderer.layers.characters.children).toHaveLength(0);
        expect(renderer.layers.cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await Promise.all([started, skipped]);
      }
    },
  );

  it.each([
    '[characteraction(name="middle",type="zoom",scale=2,fadetime=0,isblock=true)]',
    '[charslot(slot="m",action="zoom",scale=2,duration=0,isblock=true)]',
  ])(
    "settles a blocking zero-duration zoom on the first Update for %s",
    async (command) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          command,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        const [root] = renderer.layers.characters.children;
        const motion = root.children[0];
        const originalScale = motion.scale.x;
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        app.ticker.update(16);
        expect(motion.scale.x).toBe(originalScale * 2);
        expect(renderer.layers.cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it.each([
    {
      first: '[charslot(slot="l",name="avg_npc_1",duration=0.032)]',
      after32: 1,
    },
    {
      first: '[charslot(slot="l",name="avg_npc_1",duration=0.032,end=false)]',
      after32: 0,
    },
    { first: "[charslot(duration=0.032)]", after32: 1 },
  ])("shares the completion slot after $first", async ({ first, after32 }) => {
    const draws: number[] = [];
    const { app, destroy, runtime } = await createRenderedPlayback(
      [
        first,
        '[charslot(slot="r",name="avg_npc_1",duration=0.096,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      ({ cgItems }) => draws.push(cgItems.children.length),
    );
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      app.ticker.update(96);
      expect(draws).toEqual([0, after32, 1]);
    } finally {
      destroy();
      await started;
    }
  });

  it("waits for the new slot's art before replaying an older slot completion", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="l",name="avg_npc_1",duration=0.032)]',
        '[charslot(slot="r",name="avg_cold",duration=0.096,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      const { characters, cgItems } = renderer.layers;
      expect(characters.children).toHaveLength(1);
      expect(cgItems.children).toHaveLength(0);

      load.resolve(Texture.EMPTY);
      await setImmediate();
      expect(characters.children).toHaveLength(2);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(48);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps a charslot finish while the script waits for a character portrait", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="l",name="avg_npc_1",duration=0.032)]',
        '[character(name="avg_cold",fadetime=0)]',
        '[charslot(slot="r",name="avg_npc_1",duration=0.096,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);
    const started = runtime.start();
    try {
      app.ticker.update(16);
      app.ticker.update(32);
      expect(renderer.layers.cgItems.children).toHaveLength(0);
      load.resolve(Texture.EMPTY);
      await setImmediate();
      app.ticker.update(48);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("drops a deferred slot completion when skipping past the cold load", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="l",name="avg_npc_1",duration=0.032)]',
        '[charslot(slot="r",name="avg_cold",duration=0.096,isblock=true)]',
        "[SkipToThis]",
        '[charslot(slot="m",name="avg_npc_1",duration=0.096,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);
    const started = runtime.start();
    app.ticker.update(16);
    app.ticker.update(32);
    const skipped = runtime.skipNode();
    try {
      await setImmediate();
      load.resolve(Texture.EMPTY);
      await setImmediate();
      app.ticker.update(48);
      expect(renderer.layers.characters.children).toHaveLength(2);
      app.ticker.update(64);
      expect(renderer.layers.cgItems.children).toHaveLength(0);
      app.ticker.update(144);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await Promise.all([started, skipped]);
    }
  });

  it("finishes a zero-duration named slot on the first Update", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="m",name="avg_npc_1",duration=0,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const visual = characters.children[0].children[0].children[0].children[0];
      expect(visual.alpha).toBe(0);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(16);
      expect(visual.alpha).toBe(1);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    "",
    ',action="zoom",poszoom="2,0.5"',
    ',action="unknown",posfrom="0,0",posto="40,0"',
    ',posfrom="1,1",posto="0,0"',
  ])("finishes an empty slot sequence on the first Update%s", async (args) => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0)]',
        `[charslot(slot="m",duration=1,isblock=true${args})]`,
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(16);
      expect(characters.children[0].children[0].x).toBe(120);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it("waits for earlier tracks when an empty charslot ends the same sequence", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="m",name="avg_npc_1",duration=0.064,end=false)]',
        '[charslot(slot="m",duration=1,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const { characters, cgItems } = renderer.layers;
      const visual = characters.children[0].children[0].children[0].children[0];
      app.ticker.update(32);
      expect(visual.alpha).toBe(0.5);
      expect(cgItems.children).toHaveLength(0);
      app.ticker.update(64);
      expect(visual.alpha).toBe(1);
      expect(cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    "[character(fadetime=0)]",
    '[charslot(slot="m",name="char_empty",duration=0)]',
    "[charslot(duration=0,isblock=true)]",
  ])("clears a fading character root immediately with %s", async (clear) => {
    const { destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[character(fadetime=1)]",
        clear,
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      expect(renderer.layers.characters.children).toHaveLength(0);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([false, true])(
    "clears the live replacement before its move can complete (cold: %s)",
    async (cold) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          "[charslot(duration=0.032)]",
          '[character(name="avg_cold",fadetime=0)]',
          '[characteraction(name="middle",type="move",xpos=120,fadetime=0.032,isblock=true)]',
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = cold ? deferColdCharacter(renderer) : undefined;
      const started = runtime.start();
      try {
        app.ticker.update(16);
        expect(renderer.layers.characters.children).toHaveLength(1);
        app.ticker.update(32);
        expect(renderer.layers.characters.children).toHaveLength(0);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
        load?.resolve(Texture.EMPTY);
        await setImmediate();
        expect(renderer.layers.characters.children).toHaveLength(cold ? 1 : 0);
        app.ticker.update(64);
        expect(renderer.layers.characters.children).toHaveLength(0);
        expect(renderer.layers.cgItems.children).toHaveLength(0);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it.each([
    { type: "move", after32: 0, after96: 0 },
    { type: "jump", after32: 0, after96: 0 },
    { type: "zoom", after32: 0, after96: 1 },
    { type: "shake", after32: 1, after96: 1 },
  ])(
    "uses the $type tween's completion semantics when a clear resets its slot",
    async ({ type, after32, after96 }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          "[charslot(duration=0.032)]",
          '[character(name="avg_npc_1",fadetime=0)]',
          `[characteraction(name="middle",type="${type}",power=10,scale=2,fadetime=0.096,isblock=true)]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        const { characters, cgItems } = renderer.layers;
        app.ticker.update(16);
        expect(characters.children).toHaveLength(1);
        expect(cgItems.children).toHaveLength(0);
        app.ticker.update(32);
        expect(characters.children).toHaveLength(0);
        expect(cgItems.children).toHaveLength(after32);
        app.ticker.update(96);
        expect(cgItems.children).toHaveLength(after96);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("keeps a zoom on its original holder when mounting art into an empty slot", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[characteraction(name="middle",type="zoom",scale=2,fadetime=0.032)]',
        '[character(name="avg_npc_1",fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const [root] = renderer.layers.characters.children;
      const motion = root.children[0];
      const baseScale = motion.scale.x;
      app.ticker.update(16);
      expect(motion.scale.x).toBe(baseScale);
      app.ticker.update(32);
      expect(motion.scale.x).toBe(baseScale);
    } finally {
      destroy();
      await started;
    }
  });

  it("keeps a replacement's alpha when an older zero-time fade reaches Update", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[charslot(slot="m",name="avg_npc_1",duration=0)]',
        '[charslot(slot="m",name="avg_npc_1",duration=0,afrom=0.25,ato=0.25)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const [outgoing, root] = renderer.layers.characters.children;
      const [visual] = root.children[0].children[0].children;
      expect(visual.alpha).toBe(0.25);
      app.ticker.update(16);
      expect(visual.alpha).toBe(0.25);
      expect(outgoing.destroyed).toBe(true);
    } finally {
      destroy();
      await started;
    }
  });

  it.each([
    { command: '[character(name="avg_cold",fadetime=0.032)]', block: false },
    {
      command:
        '[charslot(slot="m",name="avg_cold",duration=0.032,isblock=true)]',
      block: true,
    },
  ])(
    "fades the old art after a cold texture miss for $command",
    async ({ command, block }) => {
      const { app, destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          "[delay(time=0.016)]",
          command,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
        coldCharacterLinks,
      );
      const load = deferColdCharacter(renderer);
      const started = runtime.start();
      try {
        const { characters, cgItems } = renderer.layers;
        app.ticker.update(16);
        const [mounted] = characters.children;
        app.ticker.update(32);
        expect(cgItems.children).toHaveLength(0);
        load.resolve(null);
        await setImmediate();
        expect(cgItems.children).toHaveLength(block ? 0 : 1);
        app.ticker.update(48);
        expect(mounted.alpha).toBe(0.5);
        // _SlotSetCharInternal returns no foreground tween on a load failure.
        // The empty Sequence releases the blocking command here while its
        // separately played back fade still has another frame to run.
        expect(cgItems.children).toHaveLength(1);
        app.ticker.update(64);
        expect(characters.children).toHaveLength(0);
        expect(mounted.destroyed).toBe(true);
        expect(cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("keeps the same holder moving when a character command changes its focus", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.032)]',
        '[character(name="avg_npc_1",focus=-1,fadetime=0)]',
        '[name="A"]ok',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const [root] = renderer.layers.characters.children;
      const motion = root.children[0];
      expect(motion.children[0].children[0].tint).toBe(0x808080);
      app.ticker.update(16);
      expect(motion.x).toBe(105);
      app.ticker.update(32);
      expect(motion.x).toBe(120);
      expect(renderer.layers.characters.children).toEqual([root]);
    } finally {
      destroy();
      await started;
    }
  });

  it("runs a blocking action on the fixed slot after replacement art fails", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        '[character(name="avg_cold",fadetime=0.032)]',
        '[characteraction(name="middle",type="move",xpos=120,fadetime=0.064,isblock=true)]',
        '[cgitem(image="after")]',
        '[name="A"]ok',
      ],
      () => {},
      coldCharacterLinks,
    );
    const load = deferColdCharacter(renderer);
    const started = runtime.start();
    try {
      load.resolve(null);
      await setImmediate();
      app.ticker.update(32);
      expect(renderer.layers.characters.children).toHaveLength(0);
      expect(renderer.layers.cgItems.children).toHaveLength(0);
      app.ticker.update(64);
      expect(renderer.layers.cgItems.children).toHaveLength(1);
    } finally {
      destroy();
      await started;
    }
  });

  it.each(["move", "exit", "jump", "shake"])(
    "snaps a near-zero blocking %s in dispatch",
    async (type) => {
      const { destroy, renderer, runtime } = await createRenderedPlayback(
        [
          '[character(name="avg_npc_1",fadetime=0)]',
          `[characteraction(name="middle",type="${type}",xpos=120,ypos=0,fadetime=0.000005,isblock=true)]`,
          '[cgitem(image="after")]',
          '[name="A"]ok',
        ],
        () => {},
      );
      const started = runtime.start();
      try {
        expect(renderer.layers.characters.children[0].children[0].x).toBe(120);
        expect(renderer.layers.cgItems.children).toHaveLength(1);
      } finally {
        destroy();
        await started;
      }
    },
  );

  it("recycles both mounted and fading character roots when playback ends", async () => {
    const { app, destroy, renderer, runtime } = await createRenderedPlayback(
      [
        '[character(name="avg_npc_1",fadetime=0)]',
        "[character(fadetime=2)]",
        '[charslot(slot="l",name="avg_npc_1",duration=2)]',
      ],
      () => {},
    );
    const started = runtime.start();
    try {
      const layer = renderer.layers.characters;
      const roots = [...layer.children];
      expect(roots).toHaveLength(2);
      app.ticker.update(16);
      app.ticker.update(216);
      await started;
      expect(runtime.getState()).toBe("finished");
      expect(layer.children).toHaveLength(0);
      expect(roots.every((root) => root.destroyed)).toBe(true);
    } finally {
      destroy();
      await started;
    }
  });
});
