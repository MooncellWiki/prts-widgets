import { Container, Sprite } from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH } from "../../types";

import type { GridBackgroundInput } from "../../types";
import type { Texture } from "pixi.js";

export interface CenteredTransform {
  scaleX: number;
  scaleY: number;
  x: number;
  y: number;
}

const largeBackgroundInitOffsets = new WeakMap<
  Container,
  { x: number; y: number }
>();

function largeBackgroundInitOffset(input: GridBackgroundInput): {
  x: number;
  y: number;
} {
  if (input.layout !== "large" || input.initPositionMode === undefined)
    return { x: 0, y: 0 };

  const widths = input.solidWidths;
  const height = input.solidHeights[0] ?? 0;
  // Unity's children use a top-left anchor/pivot, while the flattened Pixi
  // root uses a centered pivot. The latter already contributes -height / 2,
  // so convert native initOffset.y into that centered coordinate space.
  const centeredY = (nativeY: number) => nativeY + height / 2;
  switch (input.initPositionMode) {
    case "center": {
      return { x: 0, y: centeredY(0) };
    }
    case "upperleft": {
      return {
        x: (widths.reduce((sum, width) => sum + width, 0) - STORY_WIDTH) / 2,
        y: centeredY((STORY_HEIGHT - height * 2) / 2),
      };
    }
    case "lowercenter": {
      return { x: 0, y: centeredY((height * 2 - STORY_HEIGHT) / 2) };
    }
    default: {
      return { x: (widths[1] ?? 0) / 2, y: centeredY(-height / 2) };
    }
  }
}

function repeat360(value: number): number {
  const wrapped = value - Math.floor(value / 360) * 360;
  return Math.min(360, Math.max(0, wrapped));
}

/**
 * AVGUtils.CreateRotateTween (0x1839786B0): the signed sweep handed to
 * DORotate(..., RotateMode.LocalAxisAdd).
 *
 * `inverse` is a direction switch, not just a sign for `circles`: with
 * `circles = 0` a clockwise rotation still rewrites any positive delta into
 * delta - 360, so `angle=90` sweeps -270 rather than +90.
 */
export function rotateTweenDelta(
  currentAngle: number,
  targetAngle: number,
  circles: number,
  inverse: boolean,
): number {
  const current = repeat360(currentAngle);
  const end = repeat360(targetAngle);
  let delta = repeat360(end - current);
  if (delta > 180) delta -= 360;

  const circlesDeg = circles * 360;
  if (inverse) {
    if (delta < 0) delta += 360;
    return delta + circlesDeg;
  }
  if (delta > 0) delta -= 360;
  return delta - circlesDeg;
}

export function layoutCover(
  sprite: Sprite,
  x = STORY_WIDTH / 2,
  y = STORY_HEIGHT / 2,
): void {
  const ratio = Math.max(
    STORY_WIDTH / Math.max(1, sprite.texture.width),
    STORY_HEIGHT / Math.max(1, sprite.texture.height),
  );
  sprite.scale.set(ratio);
  sprite.position.set(x, y);
}

export function readCenteredTransform(root: Container): CenteredTransform {
  const initOffset = largeBackgroundInitOffsets.get(root) ?? { x: 0, y: 0 };
  return {
    scaleX: root.scale.x,
    scaleY: root.scale.y,
    x: root.position.x - STORY_WIDTH / 2 - initOffset.x,
    y: STORY_HEIGHT / 2 - root.position.y - initOffset.y,
  };
}

export function applyCenteredTransform(
  root: Container,
  transform: CenteredTransform,
): void {
  const initOffset = largeBackgroundInitOffsets.get(root) ?? { x: 0, y: 0 };
  root.position.set(
    STORY_WIDTH / 2 + initOffset.x + transform.x,
    STORY_HEIGHT / 2 - initOffset.y - transform.y,
  );
  root.scale.set(transform.scaleX, transform.scaleY);
}

export function buildGridBackgroundRoot(
  input: GridBackgroundInput,
  textures: Texture[],
): Container {
  const root = new Container();
  const initOffset = largeBackgroundInitOffset(input);
  largeBackgroundInitOffsets.set(root, initOffset);
  root.position.set(
    STORY_WIDTH / 2 + initOffset.x + input.x,
    STORY_HEIGHT / 2 - initOffset.y - input.y,
  );
  root.scale.set(input.scaleX, input.scaleY);

  if (input.layout === "vertical") {
    const width = input.solidWidths[0]!;
    let offsetY = 0;
    for (const [index, texture] of textures.entries()) {
      const height = input.solidHeights[index]!;
      const sprite = new Sprite(texture);
      sprite.width = width;
      sprite.height = height;
      sprite.position.set(0, offsetY);
      root.addChild(sprite);
      offsetY += height;
    }
    // Native sizeDelta only sums the first two heights, but child placement
    // continues through all N entries. Pivot mirrors that documented quirk.
    const pivotHeight =
      (input.solidHeights[0] ?? 0) + (input.solidHeights[1] ?? 0);
    root.pivot.set(width / 2, pivotHeight / 2);
    return root;
  }

  if (input.layout === "large") {
    let offsetX = 0;
    for (const [index, texture] of textures.entries()) {
      const width = input.solidWidths[index]!;
      const height = input.solidHeights[0]!;
      const sprite = new Sprite(texture);
      sprite.width = width;
      sprite.height = height;
      sprite.position.set(offsetX, 0);
      root.addChild(sprite);
      offsetX += width;
    }
    const totalWidth = input.solidWidths[0]! + input.solidWidths[1]!;
    const totalHeight = input.solidHeights[0]!;
    root.pivot.set(totalWidth / 2, totalHeight / 2);
    return root;
  }

  const rows: Array<
    Array<{ height: number; texture: Texture; width: number }>
  > = [];
  for (let index = 0; index < textures.length; index += 2) {
    rows.push(
      textures.slice(index, index + 2).map((texture, offset) => ({
        height: input.solidHeights[Math.floor((index + offset) / 2)]!,
        texture,
        width: input.solidWidths[(index + offset) % 2]!,
      })),
    );
  }
  const totalWidth = rows.reduce(
    (max, row) =>
      Math.max(
        max,
        row.reduce((sum, item) => sum + item.width, 0),
      ),
    0,
  );
  const totalHeight = rows.reduce(
    (sum, row) =>
      sum + row.reduce((max, item) => Math.max(max, item.height), 0),
    0,
  );
  let offsetY = 0;
  for (const row of rows) {
    let offsetX = 0;
    let rowHeight = 0;
    for (const item of row) {
      const sprite = new Sprite(item.texture);
      sprite.width = item.width;
      sprite.height = item.height;
      sprite.position.set(offsetX, offsetY);
      root.addChild(sprite);
      offsetX += item.width;
      rowHeight = Math.max(rowHeight, item.height);
    }
    offsetY += rowHeight;
  }
  root.pivot.set(totalWidth / 2, totalHeight / 2);
  return root;
}
