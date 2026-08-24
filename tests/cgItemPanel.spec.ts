import { Container, type Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";

import { CgItemPanel } from "../src/widgets/StoryPlayer/engine/rendering/panels/CgItemPanel";

import type { CgItemInput } from "../src/widgets/StoryPlayer/engine/types";

function input(key: string, overrides: Partial<CgItemInput> = {}): CgItemInput {
  return {
    alphaDelayMs: 0,
    alphaDurationMs: 0,
    alphaFrom: 1,
    alphaTo: 1,
    assetKey: key,
    block: false,
    ease: "Linear",
    height: 0,
    key,
    positionDelayMs: 0,
    positionDurationMs: 0,
    rotationDurationMs: 0,
    rotationFrom: -1,
    rotationTo: 0,
    scaleDelayMs: 0,
    scaleDurationMs: 0,
    scaleFrom: 1,
    scaleTo: 1,
    width: 0,
    ...overrides,
  };
}

async function tweenImmediately(
  _duration: number,
  update: (progress: number) => void,
  complete?: () => void,
): Promise<void> {
  update(1);
  complete?.();
}

// Manual tween driver: index-ordered steps advanced by the test.
function manualTween() {
  const steps: Array<{
    complete: () => void;
    resolve: () => void;
    update: (progress: number) => void;
  }> = [];
  const tween = (
    _durationMs: number,
    update: (progress: number) => void,
    complete?: () => void,
  ): Promise<void> =>
    new Promise((resolve) => {
      steps.push({
        complete: complete ?? ((): void => {}),
        resolve,
        update,
      });
    });
  return { steps, tween };
}

describe("CgItemPanel", () => {
  it("keeps different keys and replaces an equal key in place", async () => {
    const layer = new Container();
    const panel = new CgItemPanel(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );

    await panel.show(input("a"));
    const oldA = panel.targets("a")[0];
    await panel.show(input("b"));
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 10, y: 20 },
      }),
    );

    expect(panel.targets("a")).toHaveLength(1);
    expect(panel.targets("b")).toHaveLength(1);
    expect(panel.targets("a")[0]).not.toBe(oldA);
    expect(layer.children).toHaveLength(2);
  });

  it("hides one key or clears all keys independently of block", async () => {
    const layer = new Container();
    const panel = new CgItemPanel(
      layer,
      async () => Texture.WHITE,
      tweenImmediately,
    );
    await panel.show(input("a"));
    await panel.show(input("b"));

    await panel.hide("a", 130, "Linear", true);
    expect(panel.targets("a")).toEqual([]);
    expect(panel.targets("b")).toHaveLength(1);

    await panel.hide(undefined, 130, "Linear", true);
    expect(panel.targets("")).toEqual([]);
    expect(layer.children).toHaveLength(0);
  });

  it("fades with the native InSine default curve, not linearly", async () => {
    const layer = new Container();
    const { steps, tween } = manualTween();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(input("a"));
    const root = panel.targets("a")[0];

    void panel.hide("a", 500, "InSine", false);
    // InSine(0.5) = 1 - cos(pi/4), so the remaining alpha is cos(pi/4).
    steps[0].update(0.5);
    expect(root.alpha).toBeCloseTo(Math.cos(Math.PI / 4), 5);
    steps[0].update(1);
    expect(root.alpha).toBeCloseTo(0, 5);
  });

  it("keeps driving the show tween while a single-key hide fades", async () => {
    const layer = new Container();
    const { steps, tween } = manualTween();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    const sprite = panel.targets("a")[0].children[0] as Sprite;
    steps[0].update(0.25);
    expect(sprite.position.x).toBe(25);

    // Native `AVGShowItemCgSlot.Hide` has no DOKill: the show sequence keeps
    // driving the slot while the fade runs.
    void panel.hide("a", 500, "Linear", false);
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    steps[1].update(1);
    steps[1].complete();
    expect(panel.targets("a")).toEqual([]);
    // dispose() bumped the session: a late show-side tick must not touch the
    // destroyed sprite (Pixi v8 nulls `position` on destroy, so a surviving
    // write would throw).
    expect(() => steps[0].update(0.75)).not.toThrow();
  });

  it("single-key hide does not dispose a slot replaced mid-fade", async () => {
    const layer = new Container();
    const { steps, tween } = manualTween();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(input("a"));
    const oldRoot = panel.targets("a")[0];

    void panel.hide("a", 500, "Linear", false);
    await panel.show(input("a"));
    const newRoot = panel.targets("a")[0];
    expect(newRoot).not.toBe(oldRoot);

    steps[0].update(1);
    steps[0].complete();
    expect(panel.targets("a")).toEqual([newRoot]);
    expect(layer.children).toContain(newRoot);
  });

  it("clear-all keeps driving during the fade and stops after destroy", async () => {
    const layer = new Container();
    const { steps, tween } = manualTween();
    const panel = new CgItemPanel(layer, async () => Texture.WHITE, tween);
    await panel.show(
      input("a", {
        positionFrom: { x: 0, y: 0 },
        positionTo: { x: 100, y: 0 },
        positionDurationMs: 1000,
      }),
    );
    const sprite = panel.targets("a")[0].children[0] as Sprite;
    steps[0].update(0.5);
    expect(sprite.position.x).toBe(50);

    await panel.hide(undefined, 500, "Linear", false);
    steps[0].update(0.75);
    // Native keeps driving the removed slots until Dispose destroys them.
    expect(sprite.position.x).toBe(75);

    steps[1].update(1);
    steps[1].complete();
    // The fade completion bumped the session: further show-side ticks must
    // not touch the destroyed sprite (would throw on the nulled position).
    expect(() => steps[0].update(1)).not.toThrow();
  });
});
