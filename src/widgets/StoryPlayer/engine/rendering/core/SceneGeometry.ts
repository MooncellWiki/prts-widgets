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

/**
 * Port of `LargeBackgroundPanel.POSITION_INIT_FUNCTION` as applied by
 * `_ExecuteImage` (2.7.71 VA 0x183f32f40-0x183f3308e): the selected
 * `_InitPosition*` result is written verbatim into
 * `_initOffset.localPosition`.
 *
 * `_ExecuteImage` hands those helpers the parsed `solidwidth` list plus
 * `new List<float> { solidheight, 0f }` (VA 0x183f33005-0x183f33025; the
 * second `Add` takes a register zeroed at 0x183f32947). largebg is a single
 * row, so the second row height is **0**, not a repeat of `solidheight` —
 * `_InitPositionDefault` reads `height[1]` and `_InitPositionUpperLeft` /
 * `_InitPositionLowerCenter` sum `height[0] + height[1]`.
 *
 * No coordinate conversion is needed on top of that: native's `_offset`
 * RectTransform gets `sizeDelta = (w0 + w1, solidheight)` (VA 0x183f32c23)
 * with a centered pivot and the two top-left-pivoted tiles at anchored
 * positions (0, 0) and (w0, 0), which is exactly the flattened Pixi root
 * (`buildGridBackgroundRoot` pivots on the same rect). The caller applies the
 * only remaining difference, Pixi's downward y axis.
 */
function largeBackgroundInitOffset(input: GridBackgroundInput): {
  x: number;
  y: number;
} {
  if (input.initPositionMode === undefined) return { x: 0, y: 0 };

  if (input.layout === "vertical") {
    // `_ExecuteVerticalBG` builds widthList = [solidwidth, solidwidth] and
    // passes the full height list, but the shared `_InitPosition*` helpers
    // only read entries [0]+[1] (2.7.61: 0x183e7a3b4 / 0x183e7a4fa) — the
    // same two-tile truncation as the sizeDelta quirk in the builder below.
    const width = input.solidWidths[0] ?? 0;
    const heightSum =
      (input.solidHeights[0] ?? 0) + (input.solidHeights[1] ?? 0);
    // The conversion baseline is `_offset.sizeDelta.y` (the quirk value
    // h0+h1), matching the pivot set in the vertical branch of the builder.
    const centeredY = (nativeY: number) => nativeY + heightSum / 2;
    switch (input.initPositionMode) {
      case "center": {
        return { x: 0, y: centeredY(0) };
      }
      case "upperleft": {
        return {
          x: (width * 2 - STORY_WIDTH) / 2,
          y: centeredY((STORY_HEIGHT - heightSum) / 2),
        };
      }
      case "lowercenter": {
        return { x: 0, y: centeredY((heightSum - STORY_HEIGHT) / 2) };
      }
      default: {
        // default = (width[1] / 2, -height[1] / 2) over the full list.
        return {
          x: width / 2,
          y: centeredY(-(input.solidHeights[1] ?? 0) / 2),
        };
      }
    }
  }

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

  if (input.layout !== "large") return { x: 0, y: 0 };

  const height = input.solidHeights[0] ?? 0;
  switch (input.initPositionMode) {
    // `_InitPositionCenter` (VA 0x183f34390) returns `Vector2.zero`, and an
    // unregistered `initposmode` leaves the same zero in place, so this is
    // also the fallback the runtime maps unknown values onto.
    case "center": {
      return { x: 0, y: 0 };
    }
    // `_InitPositionUpperLeft` (VA 0x183f34640):
    // ((width[0] + width[1] - 1280) / 2, (720 - (height[0] + height[1])) / 2).
    case "upperleft": {
      return {
        x: (widths.reduce((sum, width) => sum + width, 0) - STORY_WIDTH) / 2,
        y: (STORY_HEIGHT - height) / 2,
      };
    }
    // `_InitPositionLowerCenter` (VA 0x183f34550):
    // (0, (height[0] + height[1] - 720) / 2).
    case "lowercenter": {
      return { x: 0, y: (height - STORY_HEIGHT) / 2 };
    }
    // `_InitPositionDefault` (VA 0x183f34450): (width[1] / 2, -height[1] / 2),
    // and height[1] is the padded 0.
    default: {
      return { x: (widths[1] ?? 0) / 2, y: 0 };
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
