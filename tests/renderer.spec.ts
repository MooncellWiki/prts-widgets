import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { PixiStoryRenderer } from "../src/widgets/StoryPlayer/engine/renderer";

import type { Context } from "../src/widgets/StoryPlayer/context";
import type { GridBackgroundInput } from "../src/widgets/StoryPlayer/engine/types";

function createContext(): Context {
  return {
    linkMap: {},
    script: [],
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
    const renderer = createCharacterRenderer();

    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const state = renderer.characterSlots.get("m");
    // characteraction(type=move) end state: slot offset shifted by +200.
    state.actionX = 200;
    state.actionY = 0;
    renderer.updateCharacterState(state);

    // `character(name=..., focus=-1)` after the move: native Set keeps
    // `_offset` because the key is unchanged -- no snap back to center.
    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "1$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });

    expect(state.actionX).toBe(200);
    expect(state.motionLayer.x).toBe(200);

    // A different expression is a different native key (the #index is part
    // of m_currentKey): Set zeroes `_offset` before the new art shows.
    await renderer.setCharacter({
      characterKey: "avg_test",
      durationMs: 0,
      expression: "2$1",
      fadeIdentity: "avg_test",
      slot: "m",
    });
    const replaced = renderer.characterSlots.get("m");
    expect(replaced.actionX).toBe(0);
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

  it("keeps the Unity background rect size when screenadapt is omitted", async () => {
    const renderer = new PixiStoryRenderer(createContext()) as any;
    renderer.app = {};
    renderer.textureForImageKey = vi.fn().mockResolvedValue(Texture.EMPTY);

    await renderer.setBackground("bg_festival_2");

    expect(renderer.backgroundSprite.width).toBe(1280);
    expect(renderer.backgroundSprite.height).toBe(720);
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
