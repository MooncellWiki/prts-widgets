import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { createRenderer } from "../helpers/rendererFixtures";

import type { Context } from "../../src/widgets/StoryPlayer/context";

function createCharacterRenderer(): any {
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
  renderer.buildCharacterVisual = vi.fn(async () => ({
    sourceHeight: 200,
    sourceWidth: 100,
    visual: new Container(),
  }));
  renderer.tween = vi.fn(async () => {});
  return renderer;
}

/**
 * Same fixture, but with a settled tween and a truthy `app`. Character actions
 * bail out of `isActiveCharacterState` while `app` is null, so a test that
 * wants to drive a real `characteraction` has to stand one up.
 */
function createLiveCharacterRenderer(): any {
  const renderer = createCharacterRenderer();
  renderer.app = { stage: new Container() };
  renderer.tween = vi.fn(
    async (
      _durationMs: number,
      step?: (progress: number) => void,
      done?: () => void,
    ) => {
      step?.(1);
      done?.();
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

function labelled(label: string): Container {
  const container = new Container();
  (container as any).label = label;
  return container;
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
  renderer.bakeDarkenedCharacterTexture = vi.fn(() => baked);
  return renderer;
}

describe("PixiStoryRenderer", () => {
  it("bakes the black gradient into the character texture, replacing the sprites", () => {
    const renderer = createRenderer();
    const baked = new Texture();
    const bakeSpy = vi
      .spyOn(renderer, "bakeDarkenedCharacterTexture")
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
      renderer.applyCharacterBlackGradient(content, [body], 100, 200, 0.2, 0.7);

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
      .spyOn(renderer, "bakeFaceOverlayTexture")
      .mockReturnValue(composited);

    const built = await renderer.buildCharacterVisual("avg_test", "1$1", 0, 1);

    // Native composites the face into the same material as the body
    // (`AlphaSplitImageHolder.SetSprite` binds it as `_HGDynamicTex`) and only
    // then applies fade alpha and `_BlackStart`/`_BlackEnd`. The web port must
    // bake the same way: two stacked sprites would each carry a copy of the
    // fade alpha, making the face region's effective opacity 1-(1-p)^2 -- the
    // face would fade in ahead of the body.
    expect(compositeSpy).toHaveBeenCalledWith(
      "body-1",
      "face-1",
      await renderer.textureForCharacterKey("body-1"),
      await renderer.textureForCharacterKey("face-1"),
      { h: 40, w: 50, x: 10, y: 20 },
    );

    const content = built.visual.children[0] as Container;
    expect(content.children.length).toBe(1);

    // The black gradient then bakes over the single composited sprite, so the
    // darkening covers the whole character.
    const [sprites] = renderer.bakeDarkenedCharacterTexture.mock.calls[0];
    expect(sprites.length).toBe(1);
    expect((sprites[0] as Sprite).texture).toBe(composited);
    expect((content.children[0] as Sprite).texture).toBe(baked);
  });

  it("keeps the composited sprite when the black bake fails", async () => {
    const renderer = createFaceOverlayRenderer(new Texture());
    const composited = new Texture();
    renderer.bakeFaceOverlayTexture = vi.fn(() => composited);
    renderer.bakeDarkenedCharacterTexture = vi.fn(() => null);

    const built = await renderer.buildCharacterVisual("avg_test", "1$1", 0, 1);

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

    renderer.updateCharacterOpacity(state);

    expect(root.alpha).toBe(1);
    expect(visual.alpha).toBe(1);
    expect(visual.tint).toBe(0x80_80_80);
  });

  it("keeps a characteraction move across a same-key character re-show", async () => {
    const renderer = createLiveCharacterRenderer();

    // act12side/level_act12side_01_beg.txt:210-217 -- the move runs, then a
    // bare `character(focus=-1)` re-shows the same name.
    await renderer.setCharacter(characterCommand("char_chen", "1$1"));
    await renderer.runCharacterAction(moveAction(200));
    expect(renderer.characterSlots.get("m").actionX).toBe(200);

    await renderer.setCharacter(characterCommand("char_chen", "1$1"));

    // `Set` skips the `_offset` reset while `m_currentKey == key`, so the
    // character holds the +200 the move left it at instead of snapping back.
    const same = renderer.characterSlots.get("m");
    expect(same.actionX).toBe(200);
    expect(same.motionLayer.x).toBe(200);
  });

  it("zeroes the offset when the character re-shows under a different key", async () => {
    const renderer = createLiveCharacterRenderer();

    await renderer.setCharacter(characterCommand("char_chen", "1$1"));
    await renderer.runCharacterAction(moveAction(200));

    // The index is part of `m_currentKey`, so a new expression is a new key
    // and `Set` runs its reset.
    await renderer.setCharacter(characterCommand("char_chen#2", "2$1"));
    expect(renderer.characterSlots.get("m").actionX).toBe(0);
  });

  it("compares the raw name ref, not the resolved character and expression", async () => {
    const renderer = createLiveCharacterRenderer();

    await renderer.setCharacter(characterCommand("char_chen", "1$1"));
    await renderer.runCharacterAction(moveAction(200));

    // `char_chen` and `char_chen#1$1` land on the same base/expression pair,
    // but `m_currentKey` holds the ref verbatim and `Set` compares it with
    // `op_Equality` -- so native sees a key change here and resets.
    await renderer.setCharacter(characterCommand("char_chen#1$1", "1$1"));
    expect(renderer.characterSlots.get("m").actionX).toBe(0);
  });

  it("lets an enter slide override an earlier characteraction move", async () => {
    const renderer = createLiveCharacterRenderer();

    await renderer.setCharacter(characterCommand("char_chen", "1$1"));
    await renderer.runCharacterAction(moveAction(200));

    // `_ProcessSlot`'s enter branch drives that same `_offset` through
    // SetCharPos and passes `resetOffsetPos = 0`; the closing
    // `SetCharPos(0, 0, duration)` still lands it back at the origin, so a
    // same-key re-show with an `enter` must not keep the move.
    await renderer.setCharacter({
      ...characterCommand("char_chen", "1$1"),
      durationMs: 300,
      enterFrom: "left",
    });
    expect(renderer.characterSlots.get("m").actionX).toBe(0);
  });

  it("swaps expressions of the same native character without cross-fading", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      expression: "2$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });

    const current = renderer.characterSlots.get("m");
    expect(renderer.tween).not.toHaveBeenCalled();
    expect(previous.root.parent).toBeNull();
    expect(current.expression).toBe("2$1");
    expect(current.root.alpha).toBe(1);
  });

  it("cross-fades when the native fade identity changes", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
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
    const current = renderer.characterSlots.get("m");
    // One tween fades the outgoing root out, the other fades the incoming in.
    expect(renderer.tween.mock.calls.map((call: unknown[]) => call[0])).toEqual(
      [150, 150],
    );
    expect(previous.root.parent).toBe(renderer.charLayer);
    expect(current.root.alpha).toBe(0);
  });

  it("keeps the slot transform across charslot commands without pos input", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionFrom: { x: -300, y: 0 },
      positionTo: { x: 0, y: 0 },
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");
    // The stubbed tween never advances, so the slot sits at `posfrom`.
    expect(state.actionX).toBe(-300);

    // Native never resets `_offset.localPosition` between charslot commands
    // (SlotSetCharWithParam uses resetOffsetPos=false), so a bare command
    // must not snap the character back to the default transform.
    renderer.tween.mockClear();
    await renderer.setCharacter({
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });

    expect(state.actionX).toBe(-300);
    // from == to: no transform tween is even started, which also keeps any
    // still-running tween from a previously deferred command alive.
    expect(renderer.tween).not.toHaveBeenCalled();
  });

  it("waits out the cached slot sequence for an isblock shake after an end=false enter", async () => {
    const renderer = createLiveCharacterRenderer();

    // level_act23side_02_beg.txt:425 -- an `end=false` enter leaves a 3s
    // tween in the slot's cached Sequence (`_GetCachedSlotSeq` reuses it
    // until its OnComplete marks it played) without blocking the queue.
    await renderer.setCharacter({
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
      slotSequence: true,
    });

    // level_act23side_02_beg.txt:426 -- a 1s shake with isblock=true is
    // INSERTed into the same Sequence (parallel, never Append): it starts at
    // once, but the block waits for the whole sequence -- the 3s enter, not
    // the 1s shake (native text onset measured at +2.2s for 2s+2s).
    renderer.tween.mockClear();
    await renderer.setCharacter({
      action: "shake",
      block: true,
      durationMs: 1000,
      power: 50,
      randomness: 90,
      slot: "l",
      slotSequence: true,
      times: 100,
    });

    // Shake runs on a timeout, opacity/move/zoom contribute nothing here, so
    // the single tween call is the isblock wait itself.
    expect(renderer.tween).toHaveBeenCalledTimes(1);
    const waitMs = renderer.tween.mock.calls.at(-1)?.[0] as number;
    expect(waitMs).toBeGreaterThanOrEqual(2900);
    expect(waitMs).toBeLessThanOrEqual(3000);
  });

  it("ignores a bare posto without posfrom or action=jump", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");
    state.actionX = 120;
    renderer.tween.mockClear();

    // level_main_14-02_end.txt:379 pattern (`posto=0`, no posfrom): the
    // native posFrom sentinel (1,1) never reaches SlotMoveChar, so this is a
    // no-op instead of a relative move.
    await renderer.setCharacter({
      durationMs: 1000,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: 400, y: 0 },
      slot: "m",
    });

    expect(state.actionX).toBe(120);
    expect(renderer.tween).not.toHaveBeenCalled();
  });

  it("skips the whole zoom when poszoom is outside [0,1]", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
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
    const state = renderer.characterSlots.get("m");

    // CharZoom validates the pivot first: out-of-range means return null --
    // the scale change is skipped too.
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
    expect(renderer.tween).not.toHaveBeenCalled();
  });

  it("dims every slot for unrecognized focus values and relights them for all", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      // level_main_12-05_end.txt:349 pattern: focus="none" is not a native
      // token, so _ProcessFocusArray clears every flag and lights nothing.
      focusSlots: [],
      slot: "l",
    });
    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: [],
      slot: "r",
    });

    expect(renderer.characterSlots.get("l")!.focusBrightness).toBe(0.5);
    expect(renderer.characterSlots.get("r")!.focusBrightness).toBe(0.5);

    // An omitted focus resolves to ["all"]: the next command relights
    // everything.
    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "r",
    });

    expect(renderer.characterSlots.get("l")!.focusBrightness).toBe(1);
    expect(renderer.characterSlots.get("r")!.focusBrightness).toBe(1);
  });

  it("cross-fades a swap over duration with the default (0,1) fade-in", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    // The charslot path reuses the slot state, so hold on to the outgoing
    // visual itself rather than the state that will point at the new one.
    const previousVisual = renderer.characterSlots.get("m").visual;

    // Story_bubble-style plain swap: no afrom/ato, duration>0. Native resets
    // the pair to (0,1) and the crossfade length equals `duration`.
    await renderer.setCharacter({
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

    const current = renderer.characterSlots.get("m");
    // The incoming sprite sits at afrom until the (stubbed) tween advances,
    // and the outgoing sprite gets its own fade-out tween.
    expect(current.contentAlpha).toBe(0);
    expect(current.visual.alpha).toBe(0);
    expect(previousVisual.parent).toBe(current.rotationLayer);
    expect(renderer.tween.mock.calls.map((call: unknown[]) => call[0])).toEqual(
      [400, 400],
    );
  });

  it("clamps a nameless fade toward ato=-1 at the write so it is transparent by half the duration", async () => {
    const renderer = createCharacterRenderer();
    renderer.app = { stage: new Container() };

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    renderer.tween.mockClear();

    // story_whitw2_1_1.txt:475 pattern: `afrom=1` with no ato. Native
    // SlotChangeAlpha runs DOColor toward alpha -1 and the vertex colour
    // clamps, so the sprite is invisible from duration/2 on.
    await renderer.setCharacter({
      alphaFrom: 1,
      alphaTo: -1,
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });

    expect(renderer.tween).toHaveBeenCalledTimes(1);
    const [durationMs, step, done] = renderer.tween.mock.calls.at(-1) as [
      number,
      (progress: number) => void,
      () => void,
    ];
    expect(durationMs).toBe(400);
    const state = renderer.characterSlots.get("m");

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

  it("skips shake entirely when duration is zero", async () => {
    const renderer = createCharacterRenderer();
    const shakeSpy = vi
      .spyOn(renderer, "startShakeAction")
      .mockImplementation(() => {});

    await renderer.setCharacter({
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
    expect(renderer.characterSlots.get("m").expression).toBe("1$1");
    expect(shakeSpy).not.toHaveBeenCalled();
  });

  it("rotates from the standalone angle parameter but not from action=rotate", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
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
    expect(renderer.tween).toHaveBeenCalledTimes(1);

    renderer.tween.mockClear();
    await renderer.setCharacter({
      action: "rotate",
      characterKey: "avg_test",
      durationMs: 400,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    expect(renderer.tween).not.toHaveBeenCalled();
  });

  it("plays an end=false entrance immediately instead of deferring it", async () => {
    const renderer = createCharacterRenderer();

    // act23side_02_beg.txt:425 pattern. `end=false` only skips the
    // OnComplete(_SetSeqPlayed) + Play() pair; _GetCachedSlotSeq already
    // handed back an auto-playing DOTween.Sequence, so the entrance runs now.
    // The runtime therefore hands the renderer no defer flag at all.
    await renderer.setCharacter({
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

    const state = renderer.characterSlots.get("l");
    // The stubbed tween never advances, so the slot sits at posfrom/afrom
    // with the move and the fade-in both already started.
    expect(state.actionY).toBe(-500);
    expect(state.contentAlpha).toBe(0);
    expect(renderer.tween.mock.calls.map((call: unknown[]) => call[0])).toEqual(
      [2000, 2000],
    );
  });

  it("resets the zoom on a named swap, even one whose zoom carries no scale", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");
    // Stand in for a completed earlier zoom (scale + pivot shift) and a
    // completed move.
    state.scaleX = 1.5;
    state.scaleY = 1.5;
    state.zoomShiftX = 25;
    state.zoomShiftY = -10;
    state.actionX = -300;
    const previousVisual = state.visual;
    renderer.tween.mockClear();

    // act42side_08_end.txt:109 pattern: `name` + `action="zoom"` with a pivot
    // but no `scale`. `_SetImage` -> GUIUtils.AssignLocalSettings copies the
    // hub prefab's pivot/localScale onto the fore Image on every load, so the
    // swap itself resets the zoom; CharZoom then tweens 1 -> 1 (its default
    // scale), i.e. nothing. The `_offset` move is untouched.
    await renderer.setCharacter({
      action: "zoom",
      characterKey: "avg_test",
      durationMs: 400,
      expression: "2$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 0.5, y: 0.5 },
      slot: "m",
    });
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
    expect(state.zoomShiftX).toBe(0);
    expect(state.zoomShiftY).toBe(0);
    expect(state.actionX).toBe(-300);
    expect(renderer.tween).not.toHaveBeenCalled();
    // The outgoing Image keeps its own transform while it fades, so the
    // previous visual carries the old zoom on itself.
    expect(previousVisual.scale.x).toBeCloseTo(1.5);
    expect(previousVisual.scale.y).toBeCloseTo(1.5);
    expect(previousVisual.x).toBeCloseTo(25);
    expect(previousVisual.y).toBeCloseTo(10);

    // The zoom branch never reaches SlotMoveChar, so posfrom is inert: it must
    // not snap the slot to -300 the way the plain-move branch would.
    state.actionX = 0;
    await renderer.setCharacter({
      action: "zoom",
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionFrom: { x: -300, y: 0 },
      positionTo: { x: 400, y: 0 },
      slot: "m",
    });
    expect(state.actionX).toBe(0);
  });

  it("keeps a completed zoom across nameless commands and tweens it back to 1 without a scale", async () => {
    const renderer = createCharacterRenderer();
    renderer.app = { stage: new Container() };

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");
    state.scaleX = 1.5;
    state.scaleY = 1.5;
    renderer.tween.mockClear();

    // No name, no load, no AssignLocalSettings: the fore Image still holds
    // the old zoom, and `CharZoom(..., options.scale = 1.0, duration)` has
    // to start a tween back down to 1 rather than treat 1.5 as the target.
    await renderer.setCharacter({
      action: "zoom",
      durationMs: 400,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      posZoom: { x: 0.5, y: 0.5 },
      slot: "m",
    });
    expect(renderer.tween).toHaveBeenCalledTimes(1);
    const [durationMs, , done] = renderer.tween.mock.calls[0];
    expect(durationMs).toBe(400);
    expect(state.scaleX).toBe(1.5);
    done();
    expect(state.scaleX).toBe(1);
    expect(state.scaleY).toBe(1);
  });

  it("applies the zoom pivot shift absolutely so repeated zooms do not drift", async () => {
    const renderer = createLiveCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");

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
    await renderer.setCharacter(zoom);
    expect(state.zoomShiftY).toBeCloseTo(44);
    await renderer.setCharacter(zoom);
    await renderer.setCharacter(zoom);
    expect(state.zoomShiftY).toBeCloseTo(44);
    expect(state.scaleX).toBe(1.8);
    // The shift rides the motion layer next to the `_offset` position.
    expect(state.motionLayer.y).toBeCloseTo(-44);
  });

  it("moves jump with duration 0 and shakemove to posto without a posfrom gate", async () => {
    const renderer = createLiveCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");

    // `_GenSlotActionTw`: jump with NeedSkipAnimation(duration) falls back to
    // `_GenCharslotMove` -> SlotMoveChar(posFrom, posTo, 0) -> localPosition
    // = posTo, with no (1,1) sentinel gate on this branch.
    await renderer.setCharacter({
      action: "jump",
      durationMs: 0,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: 120, y: 30 },
      slot: "m",
    });
    expect(state.actionX).toBe(120);
    expect(state.actionY).toBe(30);

    // shakemove: SlotMoveChar(posFrom, posTo, duration) verbatim. An absent
    // posfrom is the (1,1) default, written as-is.
    await renderer.setCharacter({
      action: "shakemove",
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      positionTo: { x: -40, y: 0 },
      slot: "m",
    });
    expect(state.actionX).toBe(-40);
    expect(state.actionY).toBe(0);

    // A bare jump with a duration lands at localPosition + posTo, and posTo
    // defaults to (1,1) too.
    await renderer.setCharacter({
      action: "jump",
      durationMs: 300,
      focusMode: "subset",
      focusSlots: ["l", "m", "r"],
      slot: "m",
    });
    expect(state.actionX).toBe(-39);
    expect(state.actionY).toBe(1);
  });

  it("evicts unreferenced face-overlay bakes beyond the cache limit only", () => {
    const renderer = createRenderer();
    const entries: Array<{ key: string; texture: any }> = [];
    for (let index = 0; index < 10; index += 1) {
      const texture = { destroy: vi.fn() };
      const key = `base|face-${index}`;
      renderer.faceOverlayTextures.set(key, { refs: 0, texture });
      entries.push({ key, texture });
    }
    // The two oldest bakes are still drawn by visuals on stage.
    const pinnedA = new Container();
    const pinnedB = new Container();
    renderer.retainFaceOverlay(pinnedA, entries[0].key);
    renderer.retainFaceOverlay(pinnedB, entries[1].key);

    renderer.trimFaceOverlayCache();

    // 10 entries, limit 8: the oldest *unreferenced* two (indices 2 and 3)
    // go; the pinned ones stay even though they are older.
    expect(renderer.faceOverlayTextures.has(entries[0].key)).toBe(true);
    expect(renderer.faceOverlayTextures.has(entries[1].key)).toBe(true);
    expect(renderer.faceOverlayTextures.has(entries[2].key)).toBe(false);
    expect(renderer.faceOverlayTextures.has(entries[3].key)).toBe(false);
    expect(entries[2].texture.destroy).toHaveBeenCalledWith(true);
    expect(entries[4].texture.destroy).not.toHaveBeenCalled();
    expect(renderer.faceOverlayTextures.size).toBe(8);

    // Releasing a pinned visual makes its bake evictable again.
    renderer.faceOverlayTextures.set("base|face-x", {
      refs: 0,
      texture: { destroy: vi.fn() },
    });
    renderer.discardCharacterVisual(pinnedA);
    expect(renderer.faceOverlayTextures.has(entries[0].key)).toBe(false);
    expect(entries[0].texture.destroy).toHaveBeenCalledWith(true);
    expect(renderer.faceOverlayTextures.size).toBe(8);
  });

  it("swaps the image instantly for an explicit enter without transtype", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
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
    const current = renderer.characterSlots.get("m");
    expect(renderer.tween).toHaveBeenCalledTimes(1);
    expect(previous.root.parent).toBeNull();
    expect(current.root.alpha).toBe(1);
  });

  it("still fades an explicit enter when transtype is ALPHA_IN", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
    });
    const previous = renderer.characterSlots.get("m");

    await renderer.setCharacter({
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
    const current = renderer.characterSlots.get("m");
    expect(renderer.tween.mock.calls.map((call: unknown[]) => call[0])).toEqual(
      [150, 150],
    );
    expect(previous.root.parent).toBe(renderer.charLayer);
    expect(current.root.alpha).toBe(0);
  });

  it("offsets the horizontal enter start by each slot's own resting offset", () => {
    const renderer = createRenderer();

    // `_GenPosition` adds +200 for LEFT and -200 for RIGHT before the
    // 1152 horizontal delta, cancelling the slot's own offset from the panel
    // centre so all three start at the same absolute off-screen x. The
    // vertical delta has no such term, and Unity y-up flips to y-down.
    expect(renderer.enterOffset("l", "left")).toEqual({ x: -952, y: 0 });
    expect(renderer.enterOffset("m", "left")).toEqual({ x: -1152, y: 0 });
    expect(renderer.enterOffset("r", "left")).toEqual({ x: -1352, y: 0 });
    expect(renderer.enterOffset("l", "right")).toEqual({ x: 1352, y: 0 });
    expect(renderer.enterOffset("r", "right")).toEqual({ x: 952, y: 0 });
    expect(renderer.enterOffset("l", "up")).toEqual({ x: 0, y: -1072 });
    expect(renderer.enterOffset("r", "down")).toEqual({ x: 0, y: 1072 });
    expect(renderer.enterOffset("l", undefined)).toEqual({ x: 0, y: 0 });
    // Explicit xpos/ypos replace `_GenPosition` outright, slot term included.
    expect(renderer.enterOffset("l", "left", { x: 12, y: 34 })).toEqual({
      x: 12,
      y: 34,
    });
  });

  it("eases the enter slide with OutCubic and leaves the fade linear", async () => {
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 150,
      enterFrom: "left",
      expression: "1$1",
      fadeIdentity: "avg_test$1",
      slot: "m",
      transType: 1,
    });

    const root = renderer.characterSlots.get("m").root;
    const [, step] = renderer.tween.mock.calls[0];
    step(0.5);

    // Native `SetCharPos` slides with `Ease.OutCubic`; at the halfway point
    // that is 1 - 0.5^3 = 0.875 of the way home, not 0.5: the root starts at
    // 590 - 1152 = -562 and sits 144px short of x = 590 (linear would be 14).
    expect(root.x).toBeCloseTo(446, 5);
    expect(root.alpha).toBe(0.5);
  });

  it("keeps a cross-fading character root below the live slots", () => {
    const renderer = createRenderer();
    const l = labelled("l");
    const m = labelled("m");
    const r = labelled("r");
    const outgoing = labelled("outgoing");
    renderer.charLayer.addChild(l, m, outgoing, r);
    renderer.characterSlots.set("l", { root: l });
    renderer.characterSlots.set("m", { root: m });
    renderer.characterSlots.set("r", { root: r });

    const order = () =>
      renderer.charLayer.children.map((child: any) => child.label);

    // Bottom-to-top: middle always on top, then the focused side slot. The
    // root left behind by a cross-fade is not a tracked slot, so it must sink
    // below all three rather than get wedged between them.
    renderer.applyCharacterZOrder(0);
    expect(order()).toEqual(["outgoing", "l", "r", "m"]);
    renderer.applyCharacterZOrder(1);
    expect(order()).toEqual(["outgoing", "r", "m", "l"]);
    renderer.applyCharacterZOrder(2);
    expect(order()).toEqual(["outgoing", "l", "m", "r"]);
    // `focus` is compared unsigned, so a negative value focuses nothing.
    renderer.applyCharacterZOrder(-1);
    expect(order()).toEqual(["outgoing", "l", "r", "m"]);
  });
});
