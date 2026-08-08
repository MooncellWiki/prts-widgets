import { Container, Texture } from "pixi.js";
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
    ease: "OutQuad",
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

    await panel.hide("a", 130, "OutQuad", true);
    expect(panel.targets("a")).toEqual([]);
    expect(panel.targets("b")).toHaveLength(1);

    await panel.hide(undefined, 130, "OutQuad", true);
    expect(panel.targets("")).toEqual([]);
    expect(layer.children).toHaveLength(0);
  });
});
