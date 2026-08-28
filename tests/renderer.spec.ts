import {
  Container,
  Sprite,
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

  it("bakes the black gradient over the body as well as the face", async () => {
    const baked = new Texture();
    const renderer = createFaceOverlayRenderer(baked);

    const built = await renderer.buildCharacterVisual("avg_test", "1$1", 0, 1);

    // Native composites the face into the same material as the body
    // (`AlphaSplitImageHolder.SetSprite` binds it as `_HGDynamicTex`) and only
    // then applies `_BlackStart`/`_BlackEnd`, so the darkening covers the
    // whole character. Baking the face alone would leave the body at its
    // original colour with a darkened patch over the face.
    const [sprites] = renderer.bakeDarkenedCharacterTexture.mock.calls[0];
    const bodyTexture = await renderer.textureForCharacterKey("body-1");
    const faceTexture = await renderer.textureForCharacterKey("face-1");
    expect(sprites.map((sprite: Sprite) => sprite.texture)).toEqual([
      bodyTexture,
      faceTexture,
    ]);
    // Draw order matters: the body goes down first, the face patch on top.
    expect(sprites.map((sprite: Sprite) => [sprite.x, sprite.y])).toEqual([
      [0, 0],
      [10, 20],
    ]);

    const content = built.visual.children[0] as Container;
    expect(content.children.length).toBe(1);
    expect((content.children[0] as Sprite).texture).toBe(baked);
  });

  it("keeps every content sprite when one of them cannot be baked", async () => {
    const renderer = createFaceOverlayRenderer(new Texture());
    renderer.bakeDarkenedCharacterTexture = vi.fn(() => null);

    const built = await renderer.buildCharacterVisual("avg_test", "1$1", 0, 1);

    // The originals are only dropped in favour of a baked texture; when the
    // bake fails the character must stay drawable, just undarkened.
    const content = built.visual.children[0] as Container;
    expect(content.children.length).toBe(2);
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
});
