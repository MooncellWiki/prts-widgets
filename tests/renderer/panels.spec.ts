import {
  Container,
  NineSliceSprite,
  Sprite,
  Texture,
  TextureSource,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { createRenderer } from "../helpers/rendererFixtures";

import type { ShowItemInput } from "../../src/widgets/StoryPlayer/engine/types";

function createShowItemInput(
  overrides: Partial<ShowItemInput> = {},
): ShowItemInput {
  return {
    blackAlpha: 0.4,
    block: true,
    fadeMs: 500,
    key: "item_a",
    offsetX: 0,
    offsetY: 0,
    style: "photo",
    ...overrides,
  };
}

interface ManualTween {
  complete: () => void;
  durationMs: number;
  step: (progress: number) => void;
}

function createManualTweens(): {
  tween: ReturnType<typeof vi.fn>;
  tweens: ManualTween[];
} {
  const tweens: ManualTween[] = [];
  const tween = vi.fn(
    (durationMs: number, step: (progress: number) => void, done?: () => void) =>
      new Promise<void>((resolve) => {
        tweens.push({
          complete: () => {
            step(1);
            done?.();
            resolve();
          },
          durationMs,
          step,
        });
      }),
  );
  return { tween, tweens };
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("PixiStoryRenderer", () => {
  it("replaces the item slot by fading the old root out with the new command's fadetime", async () => {
    const renderer = createRenderer();
    // Skip the bundled frame texture load (not under test here).
    renderer.showItemFrameTextureFailed = true;
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;
    renderer.textureForImageKey = vi.fn(
      async () => new Texture({ label: "item" }),
    );

    // Direct-show branch (`_slotInUse == null`): only the fade-in plays.
    const firstCall = renderer.showItem(createShowItemInput());
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    tweens[0].complete();
    await firstCall;
    const firstRoot = renderer.itemLayer.children[0];
    expect(firstRoot.alpha).toBe(1);

    // Replacement branch: the old root fades out with the NEW command's
    // fadetime first, then the new picture fades in (both stages block).
    const secondCall = renderer.showItem(
      createShowItemInput({ fadeMs: 300, key: "item_b" }),
    );
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300]);
    tweens[1].step(0.5);
    expect(firstRoot.alpha).toBeCloseTo(0.5);
    tweens[1].complete();
    await flushAsync();
    expect(firstRoot.parent).toBeNull();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300, 300]);
    tweens[2].complete();
    await secondCall;
    expect(renderer.itemLayer.children).toHaveLength(1);
    expect(renderer.itemLayer.children[0]).not.toBe(firstRoot);
  });

  it("takes the direct-show branch once the previous root left the layer", async () => {
    const renderer = createRenderer();
    // Skip the bundled frame texture load (not under test here).
    renderer.showItemFrameTextureFailed = true;
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;
    renderer.textureForImageKey = vi.fn(
      async () => new Texture({ label: "item" }),
    );

    const firstCall = renderer.showItem(createShowItemInput());
    await flushAsync();
    tweens[0].complete();
    await firstCall;
    // hideitem / scene reset already detached the root: `_slotInUse` is
    // effectively cleared, so no fade-out stage may run.
    renderer.itemLayer.children[0].removeFromParent();

    const secondCall = renderer.showItem(
      createShowItemInput({ fadeMs: 300, key: "item_b" }),
    );
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300]);
    tweens[1].complete();
    await secondCall;
    expect(renderer.itemLayer.children).toHaveLength(1);
  });

  it("keeps an animtext root on the shared item layer when swapping items", async () => {
    const renderer = createRenderer();
    // Skip the bundled frame texture load (not under test here).
    renderer.showItemFrameTextureFailed = true;
    renderer.textureForImageKey = vi.fn(
      async () => new Texture({ label: "item" }),
    );
    // animtext renders into the same layer but is a separate native panel;
    // swapping the show-item slot must not sweep it away.
    const animTextRoot = new Container();
    renderer.itemLayer.addChild(animTextRoot);

    await renderer.showItem(createShowItemInput({ fadeMs: 0 }));
    await renderer.showItem(createShowItemInput({ fadeMs: 0, key: "item_b" }));

    expect(animTextRoot.parent).toBe(renderer.itemLayer);
    expect(renderer.itemLayer.children).toHaveLength(2);
  });

  it("plays the backdrop-only fade when the item texture fails to load", async () => {
    const renderer = createRenderer();
    // Both the item texture and the bundled frame texture are unavailable:
    // the root degrades to the black backdrop alone.
    renderer.showItemFrameTextureFailed = true;
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;
    renderer.textureForImageKey = vi.fn(async () => null);

    // `AVGShowItemSlot.Show` skips only the sprite assignment on a failed
    // load; the slot still fades in and blocks for fadetime.
    const call = renderer.showItem(createShowItemInput());
    await flushAsync();
    expect(renderer.itemLayer.children).toHaveLength(1);
    const root = renderer.itemLayer.children[0];
    expect(root.children).toHaveLength(1);
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    tweens[0].complete();
    await call;
    expect(root.alpha).toBe(1);
  });

  it("wraps the item in the nine-slice photo frame at native size plus 32px per side", async () => {
    const renderer = createRenderer();
    // Pre-stub the bundled frame texture like the blocker slide-mask specs;
    // a real-sized item source pins the frame dimensions.
    renderer.showItemFrameTexture = new Texture({ label: "frame" });
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({
          label: "item",
          source: new TextureSource({ height: 529, width: 941 }),
        }),
    );

    await renderer.showItem(
      createShowItemInput({ fadeMs: 0, offsetX: 30, offsetY: 20 }),
    );

    const root = renderer.itemLayer.children[0];
    const content = root.children[root.children.length - 1];
    expect(content.children[0]).toBeInstanceOf(NineSliceSprite);
    const frame = content.children[0] as NineSliceSprite;
    expect(frame.leftWidth).toBe(32);
    expect(frame.topHeight).toBe(32);
    expect(frame.rightWidth).toBe(32);
    expect(frame.bottomHeight).toBe(32);
    // Fitter: `background` tracks `image_item` size + 32px padding per side.
    expect(frame.width).toBe(941 + 32 * 2);
    expect(frame.height).toBe(529 + 32 * 2);
    // The item sprite stays at its native size and renders above the frame.
    const sprite = content.children[1] as Sprite;
    expect(sprite).toBeInstanceOf(Sprite);
    expect(sprite.scale.x).toBe(1);
    expect(sprite.scale.y).toBe(1);
    // `offsetx/offsety` move `_image` (the fitter tracks it with the frame);
    // Unity's y axis points up, PIXI's down.
    expect(content.position.x).toBe(1280 / 2 + 30);
    expect(content.position.y).toBe(720 / 2 - 20);
  });

  it("snaps the photo root to alpha 1 before the hide fade", async () => {
    const renderer = createRenderer();
    renderer.showItemFrameTextureFailed = true;
    renderer.textureForImageKey = vi.fn(
      async () => new Texture({ label: "item" }),
    );
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;

    // Show still mid-fade when hideitem lands: the root sits below alpha 1.
    renderer.showItem(createShowItemInput());
    await flushAsync();
    const root = renderer.itemLayer.children[0];
    expect(root.alpha).toBe(0);

    // `AVGShowItemPhotoSlot.Hide` resets the canvas group to alpha 1 before
    // the DOFade to 0, so the fade always starts from full visibility.
    const hideCall = renderer.clearItems(300, true);
    await flushAsync();
    expect(root.alpha).toBe(1);
    tweens[1].step(0.5);
    expect(root.alpha).toBeCloseTo(0.5);
    tweens[1].complete();
    await hideCall;
    expect(root.parent).toBeNull();
  });

  it("plays the cutin fade style as a plain canvas fade over the immediate backdrop", async () => {
    const renderer = createRenderer();
    renderer.dialogFrameTexture = new Texture({ label: "header" });
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({
          label: "item",
          source: new TextureSource({ height: 529, width: 941 }),
        }),
    );
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;

    const call = renderer.showItem(
      createShowItemInput({ fadeMs: 400, style: "cutin" }),
    );
    await flushAsync();
    const state = renderer.showItemCutin;
    const root = renderer.itemLayer.children[0];
    // `fade` keeps the mask window at full extent and fades the canvas group;
    // the backdrop is already at `black` (SetAlpha applies immediately).
    expect(state).not.toBeNull();
    expect(state.fadeStyle).toBe("fade");
    // No `width` key: the window defaults to the sprite's native width.
    expect(state.maskW).toBe(941);
    expect(state.maskH).toBe(720);
    expect(state.backdrop.alpha).toBeCloseTo(0.4);
    expect(root.alpha).toBe(0);
    tweens[0].complete();
    await call;
    expect(root.alpha).toBe(1);

    // Cutin `fade` Hide fades from the CURRENT alpha (no photo-style snap).
    root.alpha = 0.4;
    const hideCall = renderer.clearItems(300, true);
    await flushAsync();
    tweens[1].step(0.5);
    expect(root.alpha).toBeCloseTo(0.2);
    tweens[1].complete();
    await hideCall;
    expect(root.parent).toBeNull();
    expect(renderer.showItemCutin).toBeNull();
  });

  it("expands the cutin mask window from the styled edge while the backdrop cross-fades", async () => {
    const renderer = createRenderer();
    renderer.dialogFrameTexture = new Texture({ label: "header" });
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({
          label: "item",
          source: new TextureSource({ height: 529, width: 941 }),
        }),
    );
    const { tween, tweens } = createManualTweens();
    renderer.tween = tween;

    const call = renderer.showItem(
      createShowItemInput({
        fadeMs: 400,
        fadeStyle: "horiz_expand_left2right",
        style: "cutin",
        width: 200,
      }),
    );
    await flushAsync();
    const state = renderer.showItemCutin;
    const root = renderer.itemLayer.children[0];
    // Expand styles keep the canvas group opaque; the window starts at zero
    // width (pinned to the band's left edge) and the black starts at 0.
    expect(root.alpha).toBe(1);
    expect(state.maskW).toBe(0);
    expect(state.maskH).toBe(720);
    expect(state.backdrop.alpha).toBe(0);
    tweens[0].step(0.5);
    expect(state.maskW).toBeCloseTo(100);
    expect(state.backdrop.alpha).toBeCloseTo(0.2);
    tweens[0].complete();
    await call;
    expect(state.maskW).toBe(200);

    // Hide collapses the window back along the same edge (left pinned) and
    // fades the black out; the canvas group stays opaque.
    const hideCall = renderer.clearItems(300, true);
    await flushAsync();
    tweens[1].step(0.5);
    expect(state.maskW).toBeCloseTo(100);
    expect(state.backdrop.alpha).toBeCloseTo(0.2);
    expect(root.alpha).toBe(1);
    tweens[1].complete();
    await hideCall;
    expect(root.parent).toBeNull();
    expect(renderer.showItemCutin).toBeNull();
  });

  it("clearItems removes only the show-item root and leaves animtext stamps alone", async () => {
    const renderer = createRenderer();
    // Native hideitem only fades the show-item slot; animtext is a separate
    // panel, but the web port mounts both on itemLayer, so clearItems must
    // track the slot root explicitly instead of fading the whole layer.
    const itemRoot = new Container();
    const stamp = new Container();
    renderer.itemLayer.addChild(stamp);
    renderer.itemLayer.addChild(itemRoot);
    renderer.showItemRoot = itemRoot;

    await renderer.clearItems(0);

    expect(itemRoot.parent).toBeNull();
    expect(renderer.showItemRoot).toBeNull();
    expect(stamp.parent).toBe(renderer.itemLayer);
  });

  it("clearItems with no live slot leaves the layer untouched", async () => {
    const renderer = createRenderer();
    const stamp = new Container();
    renderer.itemLayer.addChild(stamp);
    renderer.showItemRoot = null;

    await renderer.clearItems(0);
    await renderer.clearItems(500, true);

    expect(stamp.parent).toBe(renderer.itemLayer);
  });

  it("skips the texture lookup for an empty image but keeps the backdrop-only slot", async () => {
    const renderer = createRenderer();
    renderer.textureForImageKey = vi.fn(
      async () => new Texture({ label: "item" }),
    );

    await renderer.showItem(createShowItemInput({ fadeMs: 0, key: null }));

    expect(renderer.textureForImageKey).not.toHaveBeenCalled();
    expect(renderer.itemLayer.children).toHaveLength(1);
    expect(renderer.itemLayer.children[0].children).toHaveLength(1);
  });
});
