import {
  Container,
  type Graphics,
  NineSliceSprite,
  type Sprite,
  Texture,
  TextureSource,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";

import { StoryRuntime } from "../../src/widgets/StoryPlayer/engine/runtime";
import { createRenderer } from "../helpers/rendererFixtures";
import {
  createContext,
  FakeAudio,
  FakeRenderer,
} from "../helpers/runtimeFakes";

import type { TweenRunOptions } from "../../src/widgets/StoryPlayer/engine/rendering/core/TweenRunner";
import type { StoryShowItemSlot } from "../../src/widgets/StoryPlayer/engine/types";

interface ManualTween {
  complete: () => void;
  durationMs: number;
  step: (progress: number) => void;
}

function createShowItemRenderer() {
  const renderer = createRenderer();
  const layer: Container = renderer.itemLayer;
  const tweens: ManualTween[] = [];
  renderer.showItemFrameTextureFailed = true;
  renderer.dialogFrameTextureFailed = true;
  renderer.textureForImageKey = vi.fn(
    async () => new Texture({ label: "item" }),
  );
  renderer.tween = (
    durationMs: number,
    step: (progress: number) => void,
    done?: () => void,
    options?: TweenRunOptions,
  ) =>
    new Promise<void>((resolve) => {
      tweens.push({
        complete: () => {
          if (options?.isAlive?.() !== false) step(1);
          done?.();
          resolve();
        },
        durationMs,
        step,
      });
    });

  return {
    createSlot: (style: string): StoryShowItemSlot =>
      renderer.createShowItemSlot(style),
    createRuntime: (lines: string[]) => {
      const playback = new FakeRenderer();
      playback.createShowItemSlot = (style) =>
        renderer.createShowItemSlot(style);
      return new StoryRuntime(createContext(lines), playback, new FakeAudio());
    },
    layer,
    renderer,
    tweens,
  };
}

const flushAsync = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("ShowItemSlot rendering", () => {
  it("replaces the slot by fading it out with the new command's fadetime", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const runtime = createRuntime([
      '[showitem(image="item_a")]',
      '[showitem(image="item_b",fadetime=0.3)]',
      '[name="A"]ok',
    ]);
    const started = runtime.start();
    await flushAsync();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    const firstRoot = layer.children[0]!;
    tweens[0]!.complete();
    await flushAsync();

    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300]);
    tweens[1]!.step(0.5);
    expect(firstRoot.alpha).toBeCloseTo(0.5);
    tweens[1]!.complete();
    await flushAsync();
    expect(firstRoot.parent).toBeNull();
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500, 300, 300]);
    expect(runtime.getState()).toBe("running");
    tweens[2]!.complete();
    await started;
    expect(layer.children).toHaveLength(1);
    expect(layer.children[0]).not.toBe(firstRoot);
    expect(runtime.getState()).toBe("waiting_input");
  });

  it("starts the next show directly once hideitem has removed the old slot", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      "[hideitem(fadetime=0)]",
      '[showitem(image="item_b",fadetime=0.3)]',
      '[name="A"]ok',
    ]);
    const started = runtime.start();
    await flushAsync();

    expect(tweens.map((entry) => entry.durationMs)).toEqual([300]);
    tweens[0]!.complete();
    await started;
    expect(layer.children).toHaveLength(1);
  });

  it("keeps animtext on the shared layer when swapping and hiding items", async () => {
    const { createRuntime, layer } = createShowItemRenderer();
    const animTextRoot = layer.addChild(new Container());
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      '[showitem(image="item_b",fadetime=0)]',
      '[name="A"]before hide',
      "[hideitem(fadetime=0)]",
      '[name="A"]after hide',
    ]);

    await runtime.start();
    expect(layer.children[0]).toBe(animTextRoot);
    expect(layer.children).toHaveLength(2);
    await runtime.advance();
    expect(layer.children).toEqual([animTextRoot]);
  });

  it("leaves the shared layer alone when hideitem has no slot", async () => {
    const { createRuntime, layer, tweens } = createShowItemRenderer();
    const stamp = layer.addChild(new Container());
    await createRuntime(["[hideitem]", '[name="A"]ok']).start();

    expect(layer.children).toEqual([stamp]);
    expect(tweens).toHaveLength(0);
  });

  it("plays the placeholder fade when the item texture fails to load", async () => {
    const { createSlot, layer, renderer, tweens } = createShowItemRenderer();
    renderer.textureForImageKey = vi.fn(async () => null);
    const finished = vi.fn();
    await createSlot("photo").show({}, "item_a", finished);

    const root = layer.children[0]!;
    const placeholder = root.children[1]!.children[0] as Sprite;
    expect(placeholder.texture).toBe(Texture.WHITE);
    expect(placeholder.width).toBe(100);
    expect(placeholder.height).toBe(100);
    expect(tweens.map((entry) => entry.durationMs)).toEqual([500]);
    expect(finished).not.toHaveBeenCalled();
    tweens[0]!.complete();
    expect(root.alpha).toBe(1);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it("fits the nine-slice photo frame to the image's native size and offset", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.showItemFrameTexture = new Texture({ label: "frame" });
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({ source: new TextureSource({ height: 529, width: 941 }) }),
    );
    await createSlot("photo").show(
      { fadetime: 0, offsetx: 30, offsety: 20 },
      "item_a",
      vi.fn(),
    );

    const content = layer.children[0]!.children[1]!;
    const frame = content.children[0] as NineSliceSprite;
    expect(frame).toBeInstanceOf(NineSliceSprite);
    expect(frame.leftWidth).toBe(32);
    expect(frame.topHeight).toBe(32);
    expect(frame.rightWidth).toBe(32);
    expect(frame.bottomHeight).toBe(32);
    expect(frame.width).toBe(941 + 32 * 2);
    expect(frame.height).toBe(529 + 32 * 2);
    const sprite = content.children[1] as Sprite;
    expect(sprite.scale.x).toBe(1);
    expect(sprite.scale.y).toBe(1);
    expect(content.position.x).toBe(1280 / 2 + 30);
    expect(content.position.y).toBe(720 / 2 - 20);
  });

  it("snaps photo alpha to 1 and lets the first tween finish the current hide", async () => {
    const { createSlot, layer, tweens } = createShowItemRenderer();
    const slot = createSlot("photo");
    const shown = vi.fn();
    const hidden = vi.fn(() => slot.destroy());
    await slot.show({}, "item_a", shown);
    const root = layer.children[0]!;
    expect(root.alpha).toBe(0);

    slot.hide({ fadetime: 0.3 }, hidden);
    expect(root.alpha).toBe(1);
    tweens[1]!.step(0.5);
    expect(root.alpha).toBeCloseTo(0.5);
    tweens[0]!.complete();
    expect(root.parent).toBeNull();
    tweens[1]!.complete();

    expect(shown).not.toHaveBeenCalled();
    expect(hidden).toHaveBeenCalledTimes(1);
  });

  it("plays cutin fade over the full-width mask and hides from current alpha", async () => {
    const { createSlot, layer, renderer, tweens } = createShowItemRenderer();
    renderer.textureForImageKey = vi.fn(
      async () =>
        new Texture({ source: new TextureSource({ height: 529, width: 941 }) }),
    );
    const slot = createSlot("cutin");
    await slot.show({ fadetime: 0.4 }, "item_a", vi.fn());

    const root = layer.children[0]!;
    const [backdrop, mask] = root.children as Graphics[];
    expect(mask!.width).toBe(941);
    expect(mask!.height).toBe(720);
    expect(backdrop!.alpha).toBeCloseTo(0.4);
    expect(root.alpha).toBe(0);
    tweens[0]!.complete();
    expect(root.alpha).toBe(1);

    root.alpha = 0.4;
    slot.hide({ fadetime: 0.3 }, () => slot.destroy());
    tweens[1]!.step(0.5);
    expect(root.alpha).toBeCloseTo(0.2);
    tweens[1]!.complete();
    expect(root.parent).toBeNull();
  });

  it.each([2, "2", " horiz_expand_left2right "])(
    "expands and collapses the cutin window for fadestyle %s",
    async (fadestyle) => {
      const { createSlot, layer, tweens } = createShowItemRenderer();
      const slot = createSlot("cutin");
      await slot.show({ fadestyle, width: 200.5 }, "item_a", vi.fn());

      const root = layer.children[0]!;
      const [backdrop, mask] = root.children as Graphics[];
      expect(root.alpha).toBe(1);
      expect(mask!.width).toBe(0);
      expect(mask!.height).toBe(720);
      expect(backdrop!.alpha).toBe(0);
      tweens[0]!.step(0.5);
      // GetInt rounds 200.5 to the even integer 200.
      expect(mask!.width).toBeCloseTo(100);
      expect(mask!.getLocalBounds().minX).toBeCloseTo(1280 / 2 - 100);
      expect(backdrop!.alpha).toBeCloseTo(0.2);
      tweens[0]!.complete();
      expect(mask!.width).toBe(200);

      slot.hide({ fadetime: 0.3 }, () => slot.destroy());
      tweens[1]!.step(0.5);
      expect(mask!.width).toBeCloseTo(100);
      expect(backdrop!.alpha).toBeCloseTo(0.2);
      expect(root.alpha).toBe(1);
      tweens[1]!.complete();
      expect(root.parent).toBeNull();
    },
  );

  it("clears a fading slot and discards its pending replacement on destroy", async () => {
    const { createRuntime, layer, renderer, tweens } = createShowItemRenderer();
    const runtime = createRuntime([
      '[showitem(image="item_a",fadetime=0)]',
      '[showitem(image="item_b",fadetime=0.3)]',
    ]);
    const started = runtime.start();
    await flushAsync();
    expect(tweens).toHaveLength(1);

    runtime.destroy();
    await started;
    tweens[0]!.complete();
    expect(renderer.textureForImageKey).toHaveBeenCalledTimes(1);
    expect(layer.children).toHaveLength(0);
  });

  it("does not mount a slot after destroy during the texture load", async () => {
    const { createRuntime, layer, renderer } = createShowItemRenderer();
    const texture = Promise.withResolvers<Texture>();
    renderer.textureForImageKey = vi.fn(() => texture.promise);
    const runtime = createRuntime(['[showitem(image="item_a",fadetime=0)]']);
    const started = runtime.start();
    expect(renderer.textureForImageKey).toHaveBeenCalledExactlyOnceWith(
      "item_a",
      "image",
    );

    runtime.destroy();
    await started;
    texture.resolve(new Texture({ label: "item" }));
    await flushAsync();
    expect(layer.children).toHaveLength(0);
  });

  it("keeps a framed placeholder without looking up an empty image", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.showItemFrameTexture = new Texture({ label: "frame" });
    await createSlot("photo").show({ fadetime: 0 }, null, vi.fn());

    expect(renderer.textureForImageKey).not.toHaveBeenCalled();
    const content = layer.children[0]!.children[1]!;
    const [frame, image] = content.children as [NineSliceSprite, Sprite];
    expect(frame.width).toBe(100 + 32 * 2);
    expect(frame.height).toBe(100 + 32 * 2);
    expect(image.texture).toBe(Texture.WHITE);
  });

  it("hangs the cutin header 150px into the window top, rotated 180 degrees", async () => {
    const { createSlot, layer, renderer } = createShowItemRenderer();
    renderer.dialogFrameTexture = new Texture({
      label: "header",
      source: new TextureSource({ height: 310, width: 4 }),
    });
    await createSlot("cutin").show(
      { fadetime: 0, width: 200 },
      "item_a",
      vi.fn(),
    );

    const header = layer.children[0]!.children[2]!.children[1] as Sprite;
    expect(header.rotation).toBeCloseTo(Math.PI);
    expect(header.anchor.x).toBe(0.5);
    expect(header.anchor.y).toBe(1);
    expect(header.width).toBeCloseTo(200);
    expect(header.height).toBeCloseTo(200);
    expect(header.position.x).toBeCloseTo(0);
    expect(header.position.y).toBeCloseTo(-360 - 50);
    const bounds = header.getBounds();
    expect(bounds.minY).toBeCloseTo(-50);
    expect(bounds.maxY).toBeCloseTo(150);
  });
});
