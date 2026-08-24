import { Container, Sprite, type Texture } from "pixi.js";

import {
  STORY_HEIGHT,
  STORY_WIDTH,
  type GridBackgroundInput,
} from "../../types";

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
  if (
    (input.layout !== "large" && input.layout !== "grid") ||
    input.initPositionMode === undefined
  )
    return { x: 0, y: 0 };

  const widths = input.solidWidths;

  if (input.layout === "grid") {
    // Port of `LargeBackgroundPanel` POSITION_INIT_FUNCTION for `_ExecuteGridBG`
    // (2.7.61: applied unconditionally at 0x183e77451-0x183e775ce). Native
    // passes the full width list plus `heightList2 = [heightList[0],
    // heightList[2]]`, so the `get_Item(0)+get_Item(1)` sums in
    // `_InitPositionUpperLeft`/`_InitPositionLowerCenter` collapse to
    // w0+w1 / h0+h1, and `_InitPositionDefault` reads
    // `(widthList[1]/2, -heightList2[1]/2)` = (w1/2, -h1/2) — the half-tile
    // offset that anchors the default view on the top row. The `_offset` rect
    // (`sizeDelta` = (w0+w1, h0+h1), 0x183e76ef8) wraps the 2×2 puzzle
    // exactly and is center-pivoted, so unlike the "large" row below there is
    // no pivot compensation: the native Vector2 ports straight in and the
    // position formula flips y for Pixi's downward axis.
    const height0 = input.solidHeights[0] ?? 0;
    const height1 = input.solidHeights[1] ?? 0;
    const totalHeight = height0 + height1;
    switch (input.initPositionMode) {
      case "center": {
        return { x: 0, y: 0 };
      }
      case "upperleft": {
        return {
          x: ((widths[0] ?? 0) + (widths[1] ?? 0) - STORY_WIDTH) / 2,
          y: (STORY_HEIGHT - totalHeight) / 2,
        };
      }
      case "lowercenter": {
        return { x: 0, y: (totalHeight - STORY_HEIGHT) / 2 };
      }
      default: {
        return { x: (widths[1] ?? 0) / 2, y: -height1 / 2 };
      }
    }
  }

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
 * Port of `Torappu.AVG.AVGUtils.CreateRotateTween`'s signed sweep for
 * `AVGImagePanel._ExecuteImageRotate`; this only reproduces the angle choice,
 * not DOTween's Unity transform tween.
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
    // `LargeBackgroundPanel._ExecuteVerticalBG` sizes its RectTransform from
    // the first two heights but still places every child. This PIXI pivot is
    // the coordinate-system adaptation of that quirk.
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
  let totalWidth = 0;
  let totalHeight = 0;
  for (const row of rows) {
    let rowWidth = 0;
    let rowHeight = 0;
    for (const item of row) {
      rowWidth += item.width;
      rowHeight = Math.max(rowHeight, item.height);
    }
    totalWidth = Math.max(totalWidth, rowWidth);
    totalHeight += rowHeight;
  }
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
