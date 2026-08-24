import { Container, Texture } from "pixi.js";
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
});
