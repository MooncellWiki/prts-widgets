import {
  Container,
  Sprite,
  Text,
  Texture,
  TextureSource,
  TilingSprite,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { PixiStoryRenderer } from "../src/widgets/StoryPlayer/engine/renderer";
import { TweenRunner } from "../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";

import type { Context } from "../src/widgets/StoryPlayer/context";
import type { AnimationClock } from "../src/widgets/StoryPlayer/engine/execution";
import type { GridBackgroundInput } from "../src/widgets/StoryPlayer/engine/types";

function createContext(): Context {
  return {
    linkMap: {},
    script: [],
  };
}

// Turns the -0 that `0 * -1` produces into +0 so `toEqual` stops
// distinguishing them. Deliberately narrow: `v || 0` would also swallow NaN
// and let a broken matrix pass.
function normalizeZero(values: number[]): number[] {
  return values.map((v) => (v === 0 ? 0 : v));
}

function createManualClock(): {
  advance: (ms: number) => void;
  clock: AnimationClock;
  drainFrame: () => void;
} {
  const frames: Array<() => void> = [];
  let now = 0;
  const clock: AnimationClock = {
    cancelFrame: () => {},
    now: () => now,
    requestFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
  };
  return {
    advance: (ms) => {
      now += ms;
    },
    clock,
    drainFrame: () => {
      const frame = frames.shift();
      if (frame) frame();
    },
  };
}

function createGridBackgroundInput(): GridBackgroundInput {
  return {
    block: false,
    fadeMs: 0,
    imageKeys: ["l1", "r1", "l2", "r2"],
    scaleX: 0.5,
    scaleY: 0.75,
    solidHeights: [720, 720, 720, 720],
    solidWidths: [1280, 1280, 1280, 1280],
    x: -640,
    y: 320,
  };
}

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
  const renderer = new PixiStoryRenderer(context) as any;
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
  const renderer = new PixiStoryRenderer(context) as any;
  const textures: Record<string, Texture> = {
    "body-1": new Texture({ source: { height: 200, width: 100 } as any }),
    "face-1": new Texture({ source: { height: 40, width: 50 } as any }),
  };
  renderer.textureForCharacterKey = vi.fn(async (key: string) => textures[key]);
  renderer.bakeDarkenedCharacterTexture = vi.fn(() => baked);
  return renderer;
}

function createBlockerRenderer(): any {
  const renderer = new PixiStoryRenderer(createContext()) as any;
  renderer.layers.attach(new Container());
  return renderer;
}

describe("PixiStoryRenderer", () => {
  it("bakes the black gradient into the character texture, replacing the sprites", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
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
      expect(bakeSpy).toHaveBeenCalledWith(
        [body],
        100,
        200,
        200 * 0.2,
        200 * 0.7,
      );
      expect(content.children.length).toBe(1);
      const darkened = content.children[0] as Sprite;
      expect(darkened).toBeInstanceOf(Sprite);
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
    const renderer = new PixiStoryRenderer(createContext()) as any;
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

  it("eases the cameraeffect grayscale tween with DOTween's default OutQuad", () => {
    const manual = createManualClock();
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0);

    expect(renderer.grayscaleAmount).toBe(0);
    manual.advance(500);
    manual.drainFrame();
    // Native AVGCameraEffect never calls SetEase, so DOTween.To runs with
    // DOTween 1.2.760's defaultEaseType=6 (OutQuad): halfway = 0.75, not the
    // linear 0.5.
    expect(renderer.grayscaleAmount).toBeCloseTo(0.75);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBe(1);
  });

  it("starts the grayscale tween from the current amount for any negative initamount", async () => {
    const manual = createManualClock();
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    await renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    expect(renderer.grayscaleAmount).toBe(0.6);

    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, -1);

    // Native _TweenGrayscaleAmount checks MathUtil.LT(initAmount, 0): any
    // negative initamount means "start from the current grayscale amount",
    // not an explicit negative start.
    expect(renderer.grayscaleAmount).toBe(0.6);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBeCloseTo(0.9);
  });

  it("starts the grayscale tween from an explicit non-negative initamount", async () => {
    const manual = createManualClock();
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.tweenRunner = new TweenRunner(() => true, manual.clock);

    await renderer.setCameraEffect("Grayscale", 0.6, 0, false, true);
    expect(renderer.grayscaleAmount).toBe(0.6);

    // MathUtil.LT(0.2, 0) is false, so native takes the argument as the tween
    // start and discards the 0.6 the effect manager currently holds.
    void renderer.setCameraEffect("Grayscale", 1, 1000, false, true, 0.2);

    expect(renderer.grayscaleAmount).toBe(0.2);
    manual.advance(500);
    manual.drainFrame();
    expect(renderer.grayscaleAmount).toBeCloseTo(0.8);
  });

  it("applies grayscale as Rec.601 luma desaturation, not an additive tint", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;

    await renderer.setCameraEffect("Grayscale", 1, 0, false, true);

    // Native AVGSceneGrayScale blits with mat_grayscale and writes
    // _Params = (0.299, 0.587, 0.114, amount): Rec.601 luma desaturation
    // where a mid-gray pixel stays mid-gray. pixi's
    // ColorMatrixFilter.grayscale() builds an additive [s,s,s] matrix that
    // clips mid-grays to white around amount 1, so the matrix is composed
    // manually.
    const matrix = renderer.sceneLayer.filters[0].matrix as number[];
    expect(matrix.slice(0, 5)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(5, 10)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(10, 15)).toEqual([0.299, 0.587, 0.114, 0, 0]);
    expect(matrix.slice(15, 20)).toEqual([0, 0, 0, 1, 0]);
  });

  it("composes Colorinverse over grayscale like the native _Inverse lerp", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;

    await renderer.setCameraEffect("Colorinverse", 1, 0, false, true);

    // Native _Inverse lerps each channel toward 1-color in the same blit:
    // rows scale by -1 with offset 1. (normalizeZero turns the -0 produced
    // by 0 * -1 into +0, which toEqual distinguishes.)
    const inverseMatrix = renderer.sceneLayer.filters[0].matrix as number[];
    expect(normalizeZero(inverseMatrix.slice(0, 5))).toEqual([-1, 0, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(5, 10))).toEqual([0, -1, 0, 0, 1]);
    expect(normalizeZero(inverseMatrix.slice(10, 15))).toEqual([
      0, 0, -1, 0, 1,
    ]);

    // With grayscale=1 kept from a previous command, desaturation and
    // inversion compose into one matrix.
    await renderer.setCameraEffect("Grayscale", 1, 0, false, true);
    const bothMatrix = renderer.sceneLayer.filters[0].matrix as number[];
    expect(normalizeZero(bothMatrix.slice(0, 5))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
    expect(normalizeZero(bothMatrix.slice(5, 10))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
    expect(normalizeZero(bothMatrix.slice(10, 15))).toEqual([
      -0.299, -0.587, -0.114, 0, 1,
    ]);
  });

  it("desaturates focusout targets with the same Rec.601 matrix as cameraeffect", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;

    renderer.setFocusParam({ blur: false, color: "Grayscale" });
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to: 1,
      type: "bg",
    });

    // Native AVGSceneFocusOut.Render blits with the same mat_grayscale
    // material as AVGSceneGrayScale, so focusout must not fall back to pixi's
    // additive grayscale() tint either.
    const filters = renderer.backgroundLayer.filters as { matrix: number[] }[];
    expect(filters).toHaveLength(1);
    expect(filters[0]!.matrix.slice(0, 5)).toEqual([0.299, 0.587, 0.114, 0, 0]);
  });

  it("scales the focusout inverse channel by the focus amount", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;

    renderer.setFocusParam({ blur: false, color: "Colorinverse" });
    await renderer.setFocusOut({
      block: false,
      durationMs: 0,
      id: "",
      to: 0.5,
      type: "bg",
    });

    // Native keeps `_Inverse` binary and blends the processed target back in
    // by the per-item amount through mat_blit_ghost; folding the amount into
    // `_Inverse` models that same lerp, so a half-focused target collapses to
    // flat mid-grey instead of fully inverting.
    const filters = renderer.backgroundLayer.filters as { matrix: number[] }[];
    expect(normalizeZero(filters[0]!.matrix.slice(0, 5))).toEqual([
      0, 0, 0, 0, 0.5,
    ]);
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
    expect(renderer.tween).toHaveBeenCalled();
    expect(previous.root.parent).not.toBeNull();
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
    const previous = renderer.characterSlots.get("m");

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
    expect(previous.visual.parent).not.toBeNull();
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
    expect(shakeSpy).not.toHaveBeenCalled();
  });

  it("rotates from the standalone angle parameter regardless of action", async () => {
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
    expect(state).toBeTruthy();
    // The stubbed tween never advances, so the slot sits at posfrom/afrom
    // with the move and the fade-in both already started.
    expect(state.actionY).toBe(-500);
    expect(state.contentAlpha).toBe(0);
    expect(renderer.tween).toHaveBeenCalled();
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
    const shiftY = state.zoomShiftY;
    expect(shiftY).toBeCloseTo((0.5 - 0.6) * 1.8 * 200 + ((1.8 - 1) * 200) / 2);
    await renderer.setCharacter(zoom);
    await renderer.setCharacter(zoom);
    expect(state.zoomShiftY).toBeCloseTo(shiftY);
    expect(state.scaleX).toBe(1.8);
    // The shift rides the motion layer next to the `_offset` position.
    expect(state.motionLayer.y).toBeCloseTo(-shiftY);
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
    const renderer = new PixiStoryRenderer(createContext()) as any;
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
    expect(renderer.tween).toHaveBeenCalled();
    expect(previous.root.parent).not.toBeNull();
    expect(current.root.alpha).toBe(0);
  });

  it("offsets the horizontal enter start by each slot's own resting offset", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;

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
    const baseX = root.x + 1152;
    const [, step] = renderer.tween.mock.calls[0];
    step(0.5);

    // Native `SetCharPos` slides with `Ease.OutCubic`; at the halfway point
    // that is 1 - 0.5^3 = 0.875 of the way home, not 0.5.
    expect(root.x).toBeCloseTo(baseX - 1152 * (1 - 0.875), 5);
    expect(root.alpha).toBe(0.5);
  });

  it("keeps a cross-fading character root below the live slots", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
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

  it("keeps the large background behind the background regardless of update order", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const input = createGridBackgroundInput();

    renderer.app = {};
    renderer.backgroundLayer.addChild(renderer.gridBackgroundLayer);
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // panel_large_background is a permanent sibling in front of panel_background
    // in SceneCanvas, so it always renders underneath -- executing gridbg after
    // background must not lift the puzzle above it.
    await renderer.setGridBackground(input);
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );

    await renderer.setBackground("bg_test");
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );

    await renderer.setGridBackground(input);
    expect(renderer.backgroundLayer.children.at(0)).toBe(
      renderer.gridBackgroundLayer,
    );
    expect(renderer.backgroundLayer.children.at(-1)).toBe(
      renderer.backgroundRoot,
    );
  });

  it("draws a curtain as a solid body plus a fixed-width feather strip", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};

    const fills: unknown[] = [];
    const state = {
      alpha: 1,
      fill: 0.5,
      grad: true,
      graphic: {
        alpha: 1,
        clear: () => {},
        poly() {
          return this;
        },
        fill(style: unknown) {
          fills.push(style);
          return this;
        },
        visible: false,
      },
    };

    // direction 6 maps to a rightward sweep, so the inner edge is a vertical
    // line at x = 640 and the feather occupies x = 620..640.
    renderer.updateCurtainState(state, { x: 1, y: 0 });

    expect(state.graphic.visible).toBe(true);
    // Body is opaque black; only the strip carries the gradient.
    expect(fills[0]).toBe(0x00_00_00);
    expect(fills).toHaveLength(2);
    const gradient = fills[1] as any;
    expect(gradient.start).toEqual({ x: 620, y: 0 });
    expect(gradient.end).toEqual({ x: 640, y: 0 });
  });

  it("applies background transforms in a dedicated transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test", {
      scaleX: 2.04,
      scaleY: 1.68,
      x: 24,
      y: -36,
    });

    expect(renderer.backgroundRoot.scale.x).toBe(2.04);
    expect(renderer.backgroundRoot.scale.y).toBe(1.68);
    expect(renderer.backgroundRoot.position.x).toBe(664);
    expect(renderer.backgroundRoot.position.y).toBe(396);
    expect(renderer.backgroundSprite.position.x).toBe(0);
    expect(renderer.backgroundSprite.position.y).toBe(0);
  });

  it("keeps the background at its native sprite size when screenadapt is omitted", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A key absent from the ppu sidecar with a non-16:9 texture falls back
    // to the texture size: SetNativeSize semantics with no sidecar entry and
    // no ppu heuristic to apply.
    await renderer.setBackground("bg_festival_9x");
    expect(renderer.backgroundSprite.width).toBe(Texture.EMPTY.width);
    expect(renderer.backgroundSprite.height).toBe(Texture.EMPTY.height);
  });

  it("renders a ppu-tuned background at its sidecar-derived native rect", async () => {
    const renderer = new PixiStoryRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_cher_1: 68.24644470214844 },
    }) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // Native SetNativeSize writes sprite.rect / ppu * 100, and AVG
    // background art ships a tuned per-asset ppu: bg_cher_1 is a 1024x576
    // texture with ppu 68.2464 that natively renders 1500.44x844 -- the 17%
    // centered overscan the game shows for
    // [Background(image="bg_cher_1", width=1, height=1, fadetime=0)] in
    // obt/main/level_main_01-03_end. Web PNGs carry no ppu metadata, so the
    // avg/background.json sidecar supplies it.
    await renderer.setBackground("bg_cher_1");

    expect(renderer.backgroundSprite.width).toBeCloseTo(
      (1024 / 68.24644470214844) * 100,
      3,
    );
    expect(renderer.backgroundSprite.height).toBeCloseTo(
      (576 / 68.24644470214844) * 100,
      3,
    );
  });

  it("renders a native-1024x576 background with borders like the game", async () => {
    const renderer = new PixiStoryRenderer({
      ...createContext(),
      backgroundPpuMap: { "33_g4_srctheater": 100 },
    }) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // 33_g4_srctheater ships ppu 100, so the game really shows it at
    // 1024x576 centered with the backing color around it (used without
    // screenadapt in activities/act21side); filling the canvas here would
    // diverge from native.
    await renderer.setBackground("33_g4_srctheater");

    expect(renderer.backgroundSprite.width).toBe(1024);
    expect(renderer.backgroundSprite.height).toBe(576);
  });

  it("matches sidecar keys case-insensitively", async () => {
    const renderer = new PixiStoryRenderer({
      ...createContext(),
      backgroundPpuMap: { "21_g9_rhodes_xqoffice": 100 },
    }) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // Sidecar keys are the lowercase bundle container names (= web asset
    // URLs); 99 sprites carry a mixed-case m_Name (21_G9_rhodes_xqoffice,
    // also ppu 100 -> 1024x576 borders), so a differently-cased story key
    // must still hit the sidecar rather than the 16:9 fill fallback.
    await renderer.setBackground("21_G9_rhodes_xqoffice");

    expect(renderer.backgroundSprite.width).toBe(1024);
    expect(renderer.backgroundSprite.height).toBe(576);
  });

  it("falls back to the 1280x720 canvas for unknown 16:9 backgrounds", async () => {
    const renderer = new PixiStoryRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_cher_1: 68.24644470214844 },
    }) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(
      new Texture({
        source: new TextureSource({ height: 576, width: 1024 }),
      }),
    );

    // A 16:9 key missing from the sidecar (post-sidecar art: every 16:9
    // background added since 2023 ships a ppu tuned so the native rect is
    // exactly the reference canvas).
    await renderer.setBackground("bg_brand_new");

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(720);
  });

  it("multiplies the native rect by the width and height params", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test", { height: 0.5, width: 2.5 });

    // `_LoadImage`: sizeDelta = (native.x * width, native.y * height), both
    // defaulting to 1.0 (mulss at 0x183e587b0/0x183e587b4 in build 2761).
    expect(renderer.backgroundSprite.width).toBe(Texture.EMPTY.width * 2.5);
    expect(renderer.backgroundSprite.height).toBe(Texture.EMPTY.height * 0.5);
  });

  it("feeds the width/height-multiplied rect into the screenadapt ratio check", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    // A square texture scaled 4x taller is narrower than 16:9, so `coverall`
    // takes the width-fit branch on the *multiplied* ratio and produces
    // (1280, 4 * 1280).
    await renderer.setBackground("bg_test", {
      height: 4,
      screenAdapt: "coverall",
    });

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(
      (Texture.EMPTY.height * 4 * 1280) / Texture.EMPTY.width,
    );
  });

  it("clears the previous background when the texture fails to load", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_test");
    const previous = renderer.backgroundRoot;
    expect(previous.parent).not.toBeNull();

    renderer.textureForImageKey = vi.fn().mockResolvedValue(null);
    renderer.tween = vi.fn(async () => {});

    await renderer.setBackground("bg_missing", { block: true, fadeMs: 500 });

    // Native `_LoadImage` maps a failed sprite load onto the clear branch:
    // DOFade(_backImage -> 0) with the command's scaled duration and block
    // gate, so the old background fades out instead of staying visible.
    expect(renderer.backgroundRoot).toBeNull();
    expect(renderer.backgroundSprite).toBeNull();
    expect(renderer.tween).toHaveBeenCalledTimes(1);
    expect(renderer.tween).toHaveBeenCalledWith(
      500,
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("tiles the background texture when tiled is true", async () => {
    const renderer = new PixiStoryRenderer({
      ...createContext(),
      backgroundPpuMap: { bg_ri_1: 68.24644470214844 },
    }) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_ri_1", { tiled: true });

    // `_LoadImage`: tiled=true sets Image.type = Tiled, repeating the sprite
    // inside the final sizeDelta rect; TilingSprite + repeat wrap mode is
    // the PIXI equivalent. bg_ri_1 is ppu-tuned (native rect = texture
    // 16x16 / ppu 68.2464 * 100), and each tile spans that native rect
    // rather than the 16x16 texture pixels (tileScale = 100 / ppu).
    expect(renderer.backgroundSprite).toBeInstanceOf(TilingSprite);
    expect(renderer.backgroundSprite.width).toBeCloseTo(
      (Texture.EMPTY.width / 68.24644470214844) * 100,
      3,
    );
    expect(renderer.backgroundSprite.height).toBeCloseTo(
      (Texture.EMPTY.height / 68.24644470214844) * 100,
      3,
    );
    expect(renderer.backgroundSprite.tileScale.x).toBeCloseTo(
      100 / 68.24644470214844,
      6,
    );
    expect(Texture.EMPTY.source.style.addressMode).toBe("repeat");
    // Restore the shared EMPTY texture so the address mode does not leak into
    // the other specs.
    Texture.EMPTY.source.style.addressMode = "clamp-to-edge";
  });

  it("keeps an image at its asset size when screenadapt is omitted", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setImage("ac3_title1");

    expect(renderer.imageSprite.width).toBe(Texture.EMPTY.width);
    expect(renderer.imageSprite.height).toBe(Texture.EMPTY.height);
  });

  it("applies the strict gridbg xScale and yScale transform", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(createGridBackgroundInput(), [
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
      Texture.EMPTY,
    ]);

    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("builds verticalbg as a single-column stacked background", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["v1", "v2", "v3"],
        layout: "vertical",
        solidHeights: [720, 720, 625],
        solidWidths: [1280],
        y: 540,
      },
      [Texture.EMPTY, Texture.EMPTY, Texture.EMPTY],
    );

    expect(root.children).toHaveLength(3);
    expect(root.position.x).toBe(0);
    expect(root.position.y).toBe(-180);
    expect(root.pivot.x).toBe(640);
    expect(root.pivot.y).toBe(720);
    expect(root.scale.x).toBe(0.5);
    expect(root.scale.y).toBe(0.75);
  });

  it("stacks verticalbg tiles from top to bottom", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
      new Texture({ label: "tile-2" }),
      new Texture({ label: "tile-3" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1", "tile-2", "tile-3"],
        layout: "vertical",
        solidHeights: [360, 360, 360, 360],
        solidWidths: [640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(root.children).toHaveLength(4);
    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 0, y: 360 },
      { label: "tile-2", x: 0, y: 720 },
      { label: "tile-3", x: 0, y: 1080 },
    ]);
  });

  it("lays out largebg as exactly two horizontal tiles", () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const textures = [
      new Texture({ label: "tile-0" }),
      new Texture({ label: "tile-1" }),
    ];
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [360],
        solidWidths: [640, 640],
        x: 0,
        y: 0,
      },
      textures,
    );

    expect(root.children).toHaveLength(2);
    expect(
      root.children.map((child: any) => ({
        label: child.texture.label,
        x: child.position.x,
        y: child.position.y,
      })),
    ).toEqual([
      { label: "tile-0", x: 0, y: 0 },
      { label: "tile-1", x: 640, y: 0 },
    ]);
  });

  it("applies largebgtween in largebg transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        initPositionMode: "default",
        layout: "large",
        solidHeights: [720],
        solidWidths: [920, 920],
        x: -180,
        y: 0,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    expect(root.position.y).toBe(360);
    renderer.app = {};
    renderer.gridBackgroundLayer.addChild(root);
    renderer.largeBackgroundRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push(renderer.readCenteredTransform(root));
        step(0.5);
        snapshots.push(renderer.readCenteredTransform(root));
        done?.();
        snapshots.push(renderer.readCenteredTransform(root));
      },
    );

    await renderer.setLargeBackgroundTween({
      block: true,
      durationMs: 1000,
      xFrom: -180,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -180, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -450, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
    // Native default initposmode keeps its +width[1]/2 parent offset while
    // largebgtween moves only the child offset transform.
    expect(root.position.x).toBe(380);
  });

  it("applies backgroundtween in background transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = new Texture({ label: "bg-test" });
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(root);
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
        step(0.5);
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
        done?.();
        snapshots.push({
          scaleX: renderer.backgroundRoot.scale.x,
          scaleY: renderer.backgroundRoot.scale.y,
          x: renderer.backgroundRoot.position.x - 640,
          y: 360 - renderer.backgroundRoot.position.y,
        });
      },
    );

    await renderer.setBackground("bg_test", {
      scaleX: 2.04,
      scaleY: 1.68,
      x: 24,
      y: -36,
    });
    await renderer.setBackgroundTween({
      block: true,
      durationMs: 1000,
      xFrom: 24,
      xScaleFrom: 2.04,
      xScaleTo: 1.3,
      xTo: -120,
      yFrom: -36,
      yScaleFrom: 1.68,
      yScaleTo: 1.1,
      yTo: 80,
    });

    expect(snapshots).toEqual([
      { scaleX: 2.04, scaleY: 1.68, x: 24, y: -36 },
      { scaleX: 1.67, scaleY: 1.390_000_000_000_000_1, x: -48, y: 22 },
      { scaleX: 1.3, scaleY: 1.1, x: -120, y: 80 },
    ]);
  });

  it("applies largeimgtween in largeimg transform space", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    const snapshots: Array<{
      scaleX: number;
      scaleY: number;
      x: number;
      y: number;
    }> = [];

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        step(0.5);
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
        done?.();
        snapshots.push({
          scaleX: root.scale.x,
          scaleY: root.scale.y,
          x: root.position.x - 640,
          y: 360 - root.position.y,
        });
      },
    );

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 1000,
      xFrom: -160,
      xScaleFrom: 1.2,
      xScaleTo: 0.8,
      xTo: -720,
      yFrom: 0,
      yScaleFrom: 1.2,
      yScaleTo: 0.6,
      yTo: 360,
    });

    expect(snapshots).toEqual([
      { scaleX: 1.2, scaleY: 1.2, x: -160, y: 0 },
      { scaleX: 1, scaleY: 0.899_999_999_999_999_9, x: -440, y: 180 },
      { scaleX: 0.8, scaleY: 0.6, x: -720, y: 360 },
    ]);
  });

  it("applies zero-duration largeimgtween immediately and cancels stale tweens", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    const root = renderer.buildGridBackgroundRoot(
      {
        ...createGridBackgroundInput(),
        imageKeys: ["tile-0", "tile-1"],
        layout: "large",
        solidHeights: [900],
        solidWidths: [1600, 1600],
        x: -160,
      },
      [Texture.EMPTY, Texture.EMPTY],
    );
    let pendingStep: ((progress: number) => void) | null = null;
    let pendingDone: (() => void) | null = null;

    renderer.app = {};
    renderer.imageLayer.addChild(root);
    renderer.largeImageRoot = root;
    renderer.tween = vi.fn(
      async (
        _durationMs: number,
        step: (progress: number) => void,
        done?: () => void,
      ) => {
        pendingStep = step;
        pendingDone = done ?? null;
      },
    );

    await renderer.setLargeImageTween({
      block: false,
      durationMs: 1000,
      xFrom: -160,
      xTo: -720,
      yFrom: 0,
      yTo: 0,
    });

    const applySpy = vi.spyOn(renderer, "applyCenteredTransform");

    await renderer.setLargeImageTween({
      block: true,
      durationMs: 0,
      xFrom: -320,
    });

    expect(applySpy.mock.calls).toEqual([
      [root, { scaleX: 0.5, scaleY: 0.75, x: -320, y: 0 }],
      [root, { scaleX: 0.5, scaleY: 0.75, x: -160, y: 0 }],
    ]);

    (pendingStep as ((progress: number) => void) | null)?.(1);
    (pendingDone as (() => void) | null)?.();

    expect(root.position.x - 640).toBe(-160);
    expect(360 - root.position.y).toBe(0);
  });

  it("counts the timer sticker up from 00:00:00 like the native stopwatch", async () => {
    vi.useFakeTimers();
    try {
      const renderer = new PixiStoryRenderer(createContext()) as any;
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
      const renderer = new PixiStoryRenderer(createContext()) as any;
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
    const renderer = new PixiStoryRenderer(createContext()) as any;
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
      const renderer = new PixiStoryRenderer(createContext()) as any;
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
      const renderer = new PixiStoryRenderer(createContext()) as any;
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
});

describe("PixiStoryRenderer blocker", () => {
  interface CapturedTween {
    complete: () => void;
    step: (progress: number) => void;
  }

  function captureTweens(renderer: any): CapturedTween[] {
    const tweens: CapturedTween[] = [];
    renderer.tween = vi.fn(
      (
        _durationMs: number,
        step: (progress: number) => void,
        complete?: () => void,
      ) => {
        tweens.push({ complete: complete ?? (() => {}), step });
        return new Promise<void>(() => {});
      },
    );
    return tweens;
  }

  it("renders the blocker below the curtains container", async () => {
    const renderer = createBlockerRenderer();

    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: { a: Number.NaN, b: Number.NaN, g: Number.NaN, r: Number.NaN },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });

    const world = renderer.layers.world as Container;
    const sprite = renderer.blockerSprite;
    // Native panel_blocker (sibling 1) renders below panel_curtains
    // (sibling 3): curtains cover the blocker when both are up.
    expect(sprite.parent).toBe(world);
    expect(world.getChildIndex(sprite)).toBeLessThan(
      world.getChildIndex(renderer.layers.curtains),
    );
  });

  it("saturates 0-255 endpoints at the tint write instead of rescaling mid-fade", async () => {
    const renderer = createBlockerRenderer();
    const tweens = captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 300,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 255, g: 255, r: 255 },
    });

    const sprite = renderer.blockerSprite;
    // Halfway the raw channels are 127.5; the GPU-side clamp saturates them,
    // it does not divide by 255 (which would render mid-gray ~128).
    tweens[0]!.step(0.5);
    expect(sprite.tint).toBe(0xff_ff_ff);
    expect(renderer.readBlockerColor()).toEqual({
      a: 0.5,
      b: 127.5,
      g: 127.5,
      r: 127.5,
    });

    // Below 1/255 the channel still ramps briefly before saturating.
    tweens[0]!.step(0.001);
    expect((sprite.tint >> 16) & 0xff).toBe(65);
  });

  it("drops stale tween callbacks once a new blocker command takes over", async () => {
    const renderer = createBlockerRenderer();
    const tweens = captureTweens(renderer);

    // First command fades out to a=0; its completion would reset the texture
    // and hide the sprite.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    // Second command (DOKill equivalent) takes over while the first tween
    // would still be mid-flight.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0.5, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    expect(sprite.visible).toBe(true);

    tweens[0]!.step(1);
    expect(renderer.readBlockerColor().a).toBe(1);
    tweens[0]!.complete();
    expect(sprite.visible).toBe(true);

    // The active tween keeps writing.
    tweens[1]!.step(0.5);
    expect(renderer.readBlockerColor().a).toBe(0.75);
  });

  it("mounts the slide mask wipe for slider style with the native material constants", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    const tweens = captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    const filter = renderer.blockerSlideFilter;
    expect(filter).not.toBeNull();
    expect(sprite.filters).toEqual([filter]);
    // Torappu/UI/AVG/SlideMask material floats: _Slide/_End/_Width.
    const uniforms = filter.filterUniforms.uniforms;
    expect(uniforms.uSlide).toBeCloseTo(0.601, 6);
    expect(uniforms.uEnd).toBeCloseTo(0.641, 6);
    expect(uniforms.uExtent).toBeCloseTo(0.787, 6);
    expect(uniforms.uVertical).toBe(0);

    // The tweened raw alpha drives the shader reveal progress; the sprite
    // itself stays opaque so the filter input rgb is the untinted tint.
    tweens[0]!.step(0.5);
    expect(filter.alpha).toBe(0.5);
    expect(renderer.readBlockerColor().a).toBe(0.5);
    expect(sprite.alpha).toBe(1);
  });

  it("switches the wipe axis and extent for verticalslider and mirrors it with inverse", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);

    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: true,
      style: "verticalslider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    const filter = renderer.blockerSlideFilter;
    // ENABLE_VERTICAL uses _Height = 1.0 and samples uv.y.
    expect(filter.isVertical()).toBe(true);
    expect(filter.filterUniforms.uniforms.uExtent).toBeCloseTo(1, 6);
    // localScale.y = -1 mirrors the mask coordinate, and the flip keeps the
    // full-screen coverage (mirrored around the centered anchor).
    expect(filter.filterUniforms.uniforms.uFlipY).toBe(1);
    expect(filter.filterUniforms.uniforms.uFlipX).toBe(0);
    expect(sprite.scale.y).toBeLessThan(0);
    expect(Math.abs(sprite.height)).toBe(720);

    // inverse = false never resets the sign (only destroy does), and the
    // next default-style animated command runs _CleanMaterial.
    await renderer.setBlocker({
      block: false,
      fadeMs: 500,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();
    expect(sprite.filters).toEqual([]);
    expect(sprite.scale.y).toBeLessThan(0);
    expect(sprite.alpha).toBeGreaterThan(0);
  });

  it("hands alpha back to the sprite when the slide wipe is unmounted", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    const tweens = captureTweens(renderer);

    // A non-blocking slider settles mid-alpha (act53side_07_beg:474 and
    // act47side_05_end:44 are the two block=false sliders in the corpus).
    await renderer.setBlocker({
      block: false,
      fadeMs: 2000,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0.5, b: 0, g: 0, r: 0 },
    });
    tweens[0]!.step(1);

    // _CleanMaterial takes the wipe away; the blocker must drop straight back
    // to the 0.5 veil rather than sitting fully opaque until the next frame's
    // tween step lands.
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: Number.NaN, b: Number.NaN, g: Number.NaN, r: Number.NaN },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });

    const sprite = renderer.blockerSprite;
    expect(sprite.filters).toEqual([]);
    expect(sprite.alpha).toBe(0.5);
  });

  it("reuses the slide filter instance across unmount and remount", async () => {
    const renderer = createBlockerRenderer();
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);

    const slider = {
      block: false,
      fadeMs: 1000,
      from: { a: 0, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider" as const,
      to: { a: 1, b: 0, g: 0, r: 0 },
    };
    await renderer.setBlocker(slider);
    const filter = renderer.blockerSlideFilter;

    await renderer.setBlocker({
      ...slider,
      style: "default" as const,
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();

    // `_SetMaterial` re-fetches the same cached slide_mask Material; the web
    // port must not rebuild the shader/UniformGroup per mount either.
    await renderer.setBlocker(slider);
    expect(renderer.blockerSlideFilter).toBe(filter);
  });

  it("keeps the material untouched on the zero-duration slider branch", async () => {
    const renderer = createBlockerRenderer();

    // A zero-duration slider command runs before _GenTweenerWithParam, so no
    // material is mounted (and none persisted yet).
    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: true,
      style: "slider",
      to: { a: 1, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBeNull();

    // After an animated slider mounts the wipe, a zero-duration command
    // (slider or default) leaves the material in place.
    renderer.blockerMaskSource = {
      _resourceType: "textureSource",
      style: {},
    };
    captureTweens(renderer);
    await renderer.setBlocker({
      block: false,
      fadeMs: 1000,
      from: { a: 1, b: 0, g: 0, r: 0 },
      image: undefined,
      inverse: false,
      style: "slider",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    const filter = renderer.blockerSlideFilter;
    expect(filter).not.toBeNull();

    await renderer.setBlocker({
      block: false,
      fadeMs: 0,
      from: {
        a: Number.NaN,
        b: Number.NaN,
        g: Number.NaN,
        r: Number.NaN,
      },
      image: undefined,
      inverse: false,
      style: "default",
      to: { a: 0, b: 0, g: 0, r: 0 },
    });
    expect(renderer.blockerSlideFilter).toBe(filter);
    // The instant color write still routes through the attached filter.
    expect(filter.alpha).toBe(0);
  });
});

function createSubtitleRenderer() {
  const renderer = new PixiStoryRenderer(createContext()) as any;
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
