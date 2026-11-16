import {
  Container,
  Rectangle,
  Texture,
  type Graphics,
  type Sprite,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { CharacterCutinPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/CharacterCutinPanel";

import {
  createInstantTweenRunner,
  PlaybackTestFrames,
} from "./helpers/playbackFrames";

import type { CharacterArt } from "../src/widgets/StoryPlayer/engine/rendering/characters/CharacterArt";
import type { CharacterSlotView } from "../src/widgets/StoryPlayer/engine/rendering/characters/CharacterSlotView";
import type { CharacterCutinInput } from "../src/widgets/StoryPlayer/engine/types";

/** The fields of the panel's private per-widget slot state these tests read. */
interface SlotView {
  backdrop: Graphics;
  portrait: CharacterSlotView;
  content: Container;
  mask: Graphics;
  maskSize: { h: number; w: number };
  root: Container;
}

/** Reaches the private `slots` map; the only cast into panel internals. */
function slots(panel: CharacterCutinPanel): Map<string, SlotView> {
  return (panel as unknown as { slots: Map<string, SlotView> }).slots;
}

function visibleSprites(state: SlotView): Sprite[] {
  return (state.portrait.offset.children as Sprite[]).filter(
    (sprite) => sprite.visible,
  );
}

function input(
  overrides: Partial<CharacterCutinInput> = {},
): CharacterCutinInput {
  return {
    block: true,
    characterKey: "avg_test",
    charOffsetX: 0,
    charOffsetY: 0,
    expression: "1$1",
    fadeMs: 0,
    fadeStyle: undefined,
    offsetX: 0,
    offsetY: 0,
    povX: 0,
    povY: 0,
    widgetId: "1",
    width: 200,
    zoom: 1,
    ...overrides,
  };
}

function texture(width: number, height: number): Texture {
  return new Texture({ frame: new Rectangle(0, 0, width, height) });
}

/** Art descriptor with a no-op hub (identity pos/size), as texture() implies. */
function art(width: number, height: number): CharacterArt {
  const image = texture(width, height);
  return {
    acquire: () => ({ texture: image }),
    height,
    pos: { x: 0, y: 0 },
    width,
  };
}

/** A texture loader whose promise the test resolves by hand. */
function deferredArt(): {
  loadTexture: () => Promise<CharacterArt>;
  release: (value: CharacterArt) => void;
} {
  let resolve!: (value: CharacterArt) => void;
  const pending = new Promise<CharacterArt>((r) => {
    resolve = r;
  });
  return { loadTexture: () => pending, release: (v) => resolve(v) };
}

describe("CharacterCutinPanel", () => {
  it("renders the character at original size in a full-height mask at screen center + offset", async () => {
    const layer = new Container();
    const tex = art(120, 300);
    const loadTexture = vi.fn().mockResolvedValue(tex);
    const panel = new CharacterCutinPanel(
      layer,
      loadTexture,
      createInstantTweenRunner(),
    );

    await panel.run(input({ offsetX: -300, offsetY: 40 }))?.completion;

    expect(layer.children).toHaveLength(1);
    const root = layer.children[0]!;
    // Slot center = screen center + (offsetx, offsety) (Unity y-up flipped).
    expect(root.x).toBe(340);
    expect(root.y).toBe(320);

    const state = slots(panel).get("1")!;
    // Mask is width x full canvas height under the default align.
    expect(state.maskSize).toEqual({ h: 720, w: 200 });
    expect(root.mask).toBe(state.mask);

    const sprite = visibleSprites(state)[0];
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(0.5);
    // No stretching: the texture keeps its original scale, only the mask crops.
    expect(sprite.scale.x).toBe(1);
    expect(sprite.scale.y).toBe(1);
    // charOffsetY = 0 parks the slot node on the mask bottom (720 / 2); the
    // hub pos of the character (see the hub test below) shifts the art from
    // there. AVGCharacterSlot.Set zeroes the prefab's (0, 360) offset child
    // before the hub pos applies.
    expect(state.content.toLocal(sprite.getGlobalPosition())).toMatchObject({
      x: 0,
      y: 360,
    });
    // fade style: alpha tween completed to 1 with the mask at full size.
    expect(root.alpha).toBe(1);
  });

  it("applies zoom, pov, and charOffset keys to the slot hierarchy", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => art(120, 300),
      createInstantTweenRunner(),
    );

    await panel.run(
      input({
        charOffsetX: 5,
        charOffsetY: -20,
        povX: -50,
        povY: 30,
        zoom: 2,
      }),
    )?.completion;

    const state = slots(panel).get("1")!;
    // _zoomAndPovRectTransform: localScale = zoom, anchoredPosition =
    // (-povX, -povY) in Unity y-up, flipped for PIXI.
    expect(state.content.scale.x).toBe(2);
    expect(state.content.x).toBe(50);
    expect(state.content.y).toBe(30);
    expect(state.portrait.root.position).toMatchObject({ x: 5, y: 380 });
  });

  it("applies the AVGCharacterSpriteHub pos/size on top of the slot position", async () => {
    const layer = new Container();
    // avg_486_espumo_1 (act12side_01_beg line 214): hub size 1210x1210 over a
    // 1024x1024 sheet, pos (0, 110). Native: art center lands at
    // charOffsetY - maskHeight/2 + pos.y = -250 (Unity y-up) -> PIXI +250.
    const espumo: CharacterArt = {
      ...art(1024, 1024),
      height: 1210,
      pos: { x: 0, y: 110 },
      width: 1210,
    };
    const panel = new CharacterCutinPanel(
      layer,
      async () => espumo,
      createInstantTweenRunner(),
    );

    await panel.run(input({ offsetX: -300, width: 200 }))?.completion;

    const state = slots(panel).get("1")!;
    const sprite = visibleSprites(state)[0];
    expect(state.content.toLocal(sprite.getGlobalPosition())).toMatchObject({
      x: 0,
      y: 250,
    });
    expect(sprite.scale.x).toBeCloseTo(1210 / 1024);
    expect(sprite.scale.y).toBeCloseTo(1210 / 1024);
  });

  it("renders the #898989 defaultBackground strip behind the character", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => art(120, 300),
      createInstantTweenRunner(),
    );

    await panel.run(input({}))?.completion;

    const state = slots(panel).get("1")!;
    // _defualtBackground: under the mask (clipped), below the zoomAndPov
    // content, static full-canvas rect -- revealed as the mask expands.
    expect(state.backdrop.context.instructions).toMatchObject([
      { action: "fill", data: { style: { color: 0x89_89_89 } } },
    ]);
    expect(state.root.mask).toBe(state.mask);
    // root children: mask, backdrop, content.
    expect(state.root.children.indexOf(state.backdrop)).toBe(1);
    expect(state.root.children.indexOf(state.content)).toBe(2);
    // The backdrop is drawn once at full-canvas size; it never resizes with
    // the mask (native rect is 2560x720, only the mask clips it).
    expect(state.backdrop.bounds).toMatchObject({
      maxX: 640,
      maxY: 360,
      minX: -640,
      minY: -360,
    });
    expect(state.backdrop.scale.x).toBe(1);
    expect(state.backdrop.scale.y).toBe(1);
  });

  it("expands the mask rect from the pinned edge instead of scaling the sprite", async () => {
    const layer = new Container();
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = new CharacterCutinPanel(
      layer,
      async () => art(120, 300),
      frames.createTweenRunner(),
    );

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
      }),
    )?.completion;
    frames.step(50);

    const state = slots(panel).get("1")!;
    expect(state.maskSize).toEqual({ h: 720, w: 150 });
    // left2right pins the left edge at -width / 2 and grows rightward.
    expect(state.mask.bounds.minX).toBe(-100);
    expect(state.mask.bounds.maxX).toBe(50);
    expect(state.root.alpha).toBe(1);
    expect(state.content.x).toBe(0);
    expect(visibleSprites(state)[0].scale.x).toBe(1);
    expect(visibleSprites(state)[0].x).toBe(0);

    frames.step(50);
    expect(state.maskSize).toEqual({ h: 720, w: 200 });
  });

  it("SlotUpdate interpolates from the current layout instead of replaying the entry", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(art(120, 300));
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = new CharacterCutinPanel(
      layer,
      loadTexture,
      frames.createTweenRunner(),
    );

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
        offsetX: -300,
      }),
    )?.completion;
    frames.step(100);

    await panel.run(
      input({
        block: false,
        fadeMs: 100,
        fadeStyle: "horiz_expand_left2right",
        offsetX: 300,
        width: 300,
      }),
    )?.completion;
    frames.step(50);

    const state = slots(panel).get("1")!;
    // Root glides 340 -> 940, mask width 200 -> 300; no fresh entry replay
    // and no second sprite for the same character identity.
    expect(state.root.x).toBe(790);
    expect(state.maskSize).toEqual({ h: 720, w: 275 });
    expect(state.mask.bounds.minX).toBe(-100);
    expect(state.content.x).toBe(37.5);
    expect(state.root.alpha).toBe(1);
    expect(visibleSprites(state)).toHaveLength(1);
    expect(visibleSprites(state)[0].alpha).toBe(1);
    expect(loadTexture).toHaveBeenCalledTimes(1);
    expect(layer.children).toHaveLength(1);

    // Drive the tween to completion: a same-key Set skips its whole swap
    // branch in native, so the art must survive the update rather than being
    // treated as an outgoing crossfade layer.
    frames.step(50);
    expect(visibleSprites(state)).toHaveLength(1);
    expect(visibleSprites(state)[0].alpha).toBe(1);
    expect(visibleSprites(state)[0].destroyed).toBe(false);
  });

  it("SlotUpdate keeps the art of a repeated name (story_hibisc_1_1.txt:350/360)", async () => {
    const layer = new Container();
    const loadTexture = vi.fn().mockResolvedValue(art(120, 300));
    const panel = new CharacterCutinPanel(
      layer,
      loadTexture,
      createInstantTweenRunner(),
    );
    // Both lines are byte-identical, including `fadetime=0` -- which makes the
    // tween settle synchronously, so a mishandled crossfade drops the art on
    // the spot instead of over 400ms.
    const line = input({
      fadeStyle: "horiz_expand_center",
      offsetX: 300,
      width: 200,
    });

    await panel.run(line)?.completion;
    await panel.run({ ...line })?.completion;

    const state = slots(panel).get("1")!;
    expect(visibleSprites(state)).toHaveLength(1);
    expect(visibleSprites(state)[0].alpha).toBe(1);
    // Set never re-loads for a matching key either.
    expect(loadTexture).toHaveBeenCalledTimes(1);
  });

  it("SlotUpdate holds layout keys the command omits", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => art(120, 300),
      createInstantTweenRunner(),
    );

    await panel.run(input({ offsetX: -300, povX: -50, width: 400, zoom: 1.5 }))
      ?.completion;
    // Native reads every layout key with the live transform as its default
    // (`GetInt(param, "width", (int)sizeDelta.x)` etc.), so a name-only
    // update must not animate the slot back to the prefab defaults.
    await panel.run(
      input({
        expression: "2$2",
        offsetX: undefined,
        povX: undefined,
        width: undefined,
        zoom: undefined,
      }),
    )?.completion;

    const state = slots(panel).get("1")!;
    expect(state.root.x).toBe(340);
    expect(state.maskSize).toEqual({ h: 720, w: 400 });
    expect(state.content.x).toBe(50);
    expect(state.content.scale.x).toBe(1.5);
  });

  it("does not render a full-size slot while the character texture loads", async () => {
    const layer = new Container();
    const { loadTexture, release } = deferredArt();
    const panel = new CharacterCutinPanel(
      layer,
      loadTexture,
      createInstantTweenRunner(),
    );

    const pending = panel.run(
      input({ fadeMs: 400, fadeStyle: "horiz_expand_center" }),
    );
    // The slot is already in the scene graph, so whatever it looks like here
    // is what renders for the frames the texture request takes.
    const state = slots(panel).get("1")!;
    expect(state.maskSize).toEqual({ h: 720, w: 0 });

    release(art(120, 300));
    await pending?.completion;
    expect(state.maskSize).toEqual({ h: 720, w: 200 });
  });

  it("does not render an opaque fade-style slot while the texture loads", async () => {
    const layer = new Container();
    const { loadTexture, release } = deferredArt();
    const panel = new CharacterCutinPanel(
      layer,
      loadTexture,
      createInstantTweenRunner(),
    );

    const pending = panel.run(input({ fadeMs: 400 }));
    const state = slots(panel).get("1")!;
    expect(state.root.alpha).toBe(0);

    release(art(120, 300));
    await pending?.completion;
    expect(state.root.alpha).toBe(1);
  });

  it("starts a fresh Show when a named command supersedes a pending entry texture", async () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const { loadTexture, release } = deferredArt();
    const replacement = art(140, 300);
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      ({ expression }) => (expression === "2$2" ? replacement : loadTexture()),
      runner,
    );

    const pending = panel.run(input());
    const show = panel.run(input({ expression: "2$2" }));
    expect(pending?.endReason).toBe("reset");
    release(art(120, 300));
    await frames.advance(16);

    const state = slots(panel).get("1")!;
    expect(layer.children).toHaveLength(1);
    expect(visibleSprites(state)[0].texture).toBe(
      replacement.acquire()?.texture,
    );
    expect(state.root.alpha).toBe(1);
    expect(show?.endReason).toBe("complete");
  });

  it.each([
    { fadeMs: 0, frameMs: 16, firstFrameAlphas: [1], finalX: 740 },
    { fadeMs: 100, frameMs: 50, firstFrameAlphas: [0.5, 0.5], finalX: 640 },
  ])(
    "finishes a $fadeMs ms portrait swap across a same-portrait layout update",
    ({ fadeMs, frameMs, firstFrameAlphas, finalX }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const tween = frames.createTweenRunner();
      const texA = art(120, 300);
      const texB = art(140, 300);
      const panel = new CharacterCutinPanel(
        new Container(),
        ({ expression }) => (expression === "2$2" ? texB : texA),
        tween,
      );
      panel.run(input());
      frames.step(16);

      panel.run(input({ block: false, expression: "2$2", fadeMs }));
      const layout = panel.run(input({ expression: "2$2", offsetX: 100 }));
      const state = slots(panel).get("1")!;

      frames.step(frameMs);
      expect(visibleSprites(state).map((sprite) => sprite.alpha)).toEqual(
        firstFrameAlphas,
      );
      expect(layout?.endReason).toBe("complete");
      expect(state.root.x).toBe(740);

      frames.step(frameMs);
      // The first layout can outlast the second layout's zero-duration tween.
      expect(state.root.x).toBe(finalX);
      expect(visibleSprites(state)).toHaveLength(1);
      expect(visibleSprites(state)[0].texture).toBe(texB.acquire()?.texture);
      expect(visibleSprites(state)[0].alpha).toBe(1);
    },
  );

  it("restores the previous portrait after a replacement fails to load", () => {
    const portrait = art(120, 300);
    const panel = new CharacterCutinPanel(
      new Container(),
      ({ expression }) => (expression === "2$2" ? null : portrait),
      createInstantTweenRunner(),
    );
    panel.run(input());
    const state = slots(panel).get("1")!;

    panel.run(input({ expression: "2$2" }));
    expect(visibleSprites(state)).toHaveLength(0);

    panel.run(input());
    expect(visibleSprites(state)).toHaveLength(1);
    expect(visibleSprites(state)[0].texture).toBe(portrait.acquire()?.texture);
  });

  it.each([undefined, "fade"] as const)(
    "hide collapses the entry mask after SlotUpdate with fadestyle=%s",
    async (fadeStyle) => {
      const layer = new Container();
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const panel = new CharacterCutinPanel(
        layer,
        async () => art(120, 300),
        frames.createTweenRunner(),
      );

      await panel.run(
        input({
          block: false,
          fadeMs: 100,
          fadeStyle: "horiz_expand_right2left",
        }),
      )?.completion;
      frames.step(100);
      expect(slots(panel).size).toBe(1);

      await panel.run(input({ block: false, fadeStyle, width: 300 }))
        ?.completion;
      frames.step(0);

      await panel.run(
        input({
          block: false,
          characterKey: undefined,
          expression: undefined,
          fadeMs: 100,
          fadeStyle: undefined,
        }),
      )?.completion;
      frames.step(50);

      const state = slots(panel).get("1")!;
      expect(state.maskSize).toEqual({ h: 720, w: 75 });
      expect(state.mask.bounds.maxX).toBe(100);
      expect(state.content.x).toBe(-50);
      expect(state.root.alpha).toBe(1);

      frames.step(50);
      // Native b__0 @ 0x183e62c90 recycles the slot and drops the widgetID.
      expect(slots(panel).has("1")).toBe(false);
      expect(layer.children).toHaveLength(0);
    },
  );

  it("uses OutQuad for fade-style entry and exit", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = new CharacterCutinPanel(
      new Container(),
      () => art(120, 300),
      runner,
    );

    panel.run(input({ fadeMs: 100 }));
    const state = slots(panel).get("1")!;
    frames.step(50);
    expect(state.root.alpha).toBeCloseTo(0.75);
    frames.step(50);

    panel.run(
      input({
        characterKey: undefined,
        expression: undefined,
        fadeMs: 100,
      }),
    );
    frames.step(50);

    expect(state.root.alpha).toBeCloseTo(0.25);
    expect(state.maskSize).toEqual({ h: 720, w: 200 });

    frames.step(50);
    expect(slots(panel).has("1")).toBe(false);
  });

  it.each([
    { fadeStyle: "horiz_expand_center", axis: "w", firstSize: 49.21875 },
    { fadeStyle: "vert_expand_center", axis: "h", firstSize: 177.1875 },
    { fadeStyle: "horiz_expand_left2right", axis: "w", firstSize: 0 },
  ] as const)(
    "uses the native $fadeStyle hide start size during entry",
    ({ fadeStyle, axis, firstSize }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const panel = new CharacterCutinPanel(
        new Container(),
        () => art(120, 300),
        frames.createTweenRunner(),
      );
      panel.run(input({ block: false, fadeMs: 100, fadeStyle }));
      const hide = panel.run(input({ characterKey: undefined, fadeMs: 100 }));
      const state = slots(panel).get("1")!;

      // At 25 ms, OutQuad has advanced each tween by 7/16. The center
      // styles shrink from the size that Show just wrote on this frame.
      frames.step(25);
      expect(state.maskSize[axis]).toBeCloseTo(firstSize);
      expect(hide?.endReason).toBeUndefined();
      frames.step(75);
      expect(hide?.endReason).toBe("complete");
      expect(slots(panel).has("1")).toBe(false);
    },
  );

  it.each([
    { fadeStyle: "horiz_expand_left2right", completes: true },
    { fadeStyle: "horiz_expand_center", completes: false },
    { fadeStyle: "fade", completes: false },
  ] as const)(
    "preserves the later $fadeStyle hide's completion behavior after recycle",
    ({ fadeStyle, completes }) => {
      const layer = new Container();
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const panel = new CharacterCutinPanel(
        layer,
        () => art(120, 300),
        frames.createTweenRunner(),
      );
      panel.run(input({ fadeStyle }));
      frames.step(16);

      const hide = { characterKey: undefined, expression: undefined };
      panel.run(input({ ...hide, block: false, fadeMs: 100 }));
      const finish = vi.fn();
      const wait = panel.run(input({ ...hide, fadeMs: 1000 }), finish);

      frames.step(100);
      expect(layer.children).toHaveLength(0);
      expect(wait?.endReason).toBeUndefined();
      expect(finish).not.toHaveBeenCalled();

      panel.run(input({ block: false, fadeStyle }));
      const replacement = layer.children[0];
      frames.step(899);
      expect(finish).not.toHaveBeenCalled();
      frames.step(1);
      expect(wait?.endReason).toBe(completes ? "complete" : undefined);
      expect(finish).toHaveBeenCalledTimes(completes ? 1 : 0);
      expect(layer.children).toEqual([replacement]);

      panel.clear();
      expect(wait?.endReason).toBe(completes ? "complete" : "reset");
    },
  );

  it.each([
    { clearedWidgetId: "2", finishCalls: 1, reason: "complete" },
    { clearedWidgetId: "1", finishCalls: 0, reason: "reset" },
  ])(
    "recycles on Hide before clearing widget $clearedWidgetId",
    ({ clearedWidgetId, finishCalls, reason }) => {
      const frames = new PlaybackTestFrames();
      frames.manual = true;
      const runner = frames.createTweenRunner();
      const layer = new Container();
      const panel = new CharacterCutinPanel(layer, () => art(120, 300), runner);
      panel.run(input());
      frames.step(16);

      panel.run(input({ block: false, characterKey: undefined }));
      const finish = vi.fn();
      const layout = panel.run(input({ fadeMs: 64, offsetX: 100 }), finish);
      frames.step(16);
      expect(layer.children).toHaveLength(0);
      expect(slots(panel).has("1")).toBe(false);
      expect(layout?.endReason).toBeUndefined();
      expect(finish).not.toHaveBeenCalled();

      panel.clear(clearedWidgetId);
      frames.step(48);
      expect(layout?.endReason).toBe(reason);
      expect(finish).toHaveBeenCalledTimes(finishCalls);
    },
  );

  it("keeps the entry fade running on its own clock across a SlotUpdate", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const panel = new CharacterCutinPanel(
      new Container(),
      () => art(120, 300),
      runner,
    );
    panel.run(input({ block: false, fadeMs: 100 }));
    const layout = panel.run(input({ fadeMs: 25, offsetX: 100 }));
    const { root } = slots(panel).get("1")!;
    frames.step(25);
    expect(root.alpha).toBe(0.4375);
    expect(root.x).toBe(740);
    expect(layout?.endReason).toBe("complete");

    frames.step(75);
    expect(root.alpha).toBe(1);
  });

  it("holds the captured integer height when updating a slot during vertical entry", () => {
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const panel = new CharacterCutinPanel(
      new Container(),
      () => art(120, 300),
      frames.createTweenRunner(),
    );
    panel.run(
      input({ block: false, fadeMs: 64, fadeStyle: "vert_expand_center" }),
    );
    const { maskSize } = slots(panel).get("1")!;
    frames.step(8);
    expect(maskSize.h).toBe(168.75);

    const update = panel.run(input({ fadeMs: 56 }));
    frames.step(56);
    expect(update?.endReason).toBe("complete");
    expect(maskSize).toEqual({ h: 168, w: 200 });
  });

  it("still runs the show tween for an unresolvable name to keep block timing", async () => {
    const layer = new Container();
    const frames = new PlaybackTestFrames();
    frames.manual = true;
    const runner = frames.createTweenRunner();
    const tweenSpy = vi.spyOn(runner, "start");
    const loadTexture = vi.fn();
    const panel = new CharacterCutinPanel(layer, loadTexture, runner);

    await panel.run(
      input({
        block: false,
        characterKey: undefined,
        characterMissing: true,
        expression: undefined,
        fadeMs: 250,
      }),
    )?.completion;

    // One tween, for the full fadetime.
    expect(tweenSpy.mock.calls.map(([durationMs]) => durationMs)).toEqual([
      250,
    ]);
    expect(loadTexture).not.toHaveBeenCalled();
    const state = slots(panel).get("1")!;
    expect(visibleSprites(state)).toHaveLength(0);

    // Driving that tween fades the (empty) slot in.
    frames.step(250);
    expect(state.root.alpha).toBe(1);
    expect(slots(panel).has("1")).toBe(true);
  });

  it("clear drops one widget or every slot", async () => {
    const layer = new Container();
    const panel = new CharacterCutinPanel(
      layer,
      async () => art(120, 300),
      createInstantTweenRunner(),
    );

    await panel.run(input({ widgetId: "1" }))?.completion;
    await panel.run(input({ widgetId: "2" }))?.completion;
    panel.clear("1");
    expect(slots(panel).has("1")).toBe(false);
    expect(slots(panel).has("2")).toBe(true);

    panel.clear();
    expect(slots(panel).size).toBe(0);
    expect(layer.children).toHaveLength(0);
  });
});
