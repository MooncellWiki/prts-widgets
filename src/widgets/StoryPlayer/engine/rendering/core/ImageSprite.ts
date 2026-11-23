import { Sprite, TilingSprite, type Texture } from "pixi.js";

import { STORY_HEIGHT, STORY_WIDTH, type BackgroundInput } from "../../types";

/** Unity Image.SetNativeSize uses sprite.rect / ppu with a canvas reference PPU of 100. */
export function nativeSpriteRect(
  texture: Texture,
  ppu?: number,
): readonly [number, number] | undefined {
  if (ppu === undefined || !Number.isFinite(ppu) || ppu <= 0) return;
  return [
    (Math.max(1, texture.width) / ppu) * 100,
    (Math.max(1, texture.height) / ppu) * 100,
  ];
}

/**
 * AVGImagePanel._LoadImage (2791 @ 0x1841ADFA0) multiplies the native rect
 * before applying screenadapt.
 */
export function createImageSprite(
  texture: Texture,
  input?: BackgroundInput,
  nativeRect?: readonly [number, number],
): Sprite | TilingSprite {
  // PIXI's repeat addressing also applies to other users of this texture.
  // Simple sprites keep their original 0..1 UVs.
  let sprite: Sprite | TilingSprite;
  if (input?.tiled) {
    texture.source.style.addressMode = "repeat";
    sprite = new TilingSprite({ texture });
  } else {
    sprite = new Sprite(texture);
  }
  sprite.anchor.set(0.5);
  layoutImageForScreenAdapt(sprite, input?.screenAdapt, input, nativeRect);
  if (sprite instanceof TilingSprite) {
    if (nativeRect) {
      sprite.tileScale.set(
        nativeRect[0] / Math.max(1, texture.width),
        nativeRect[1] / Math.max(1, texture.height),
      );
    }
    alignTilesToLowerLeft(sprite);
  }
  return sprite;
}

function layoutImageForScreenAdapt(
  sprite: Sprite | TilingSprite,
  mode?: BackgroundInput["screenAdapt"],
  input?: BackgroundInput,
  nativeRect?: readonly [number, number],
): void {
  const nativeWidth = nativeRect?.[0] ?? Math.max(1, sprite.texture.width);
  const nativeHeight = nativeRect?.[1] ?? Math.max(1, sprite.texture.height);
  const sourceWidth = nativeWidth * (input?.width ?? 1);
  const sourceHeight = nativeHeight * (input?.height ?? 1);
  let width = sourceWidth;
  let height = sourceHeight;

  if (mode === "fill") {
    width = STORY_WIDTH;
    height = STORY_HEIGHT;
  } else if (
    mode === "width" ||
    (mode === "showall" &&
      sourceWidth / sourceHeight > STORY_WIDTH / STORY_HEIGHT) ||
    (mode === "coverall" &&
      sourceWidth / sourceHeight < STORY_WIDTH / STORY_HEIGHT)
  ) {
    width = STORY_WIDTH;
    height = (sourceHeight * STORY_WIDTH) / sourceWidth;
  } else if (mode === "height" || mode === "showall" || mode === "coverall") {
    height = STORY_HEIGHT;
    width = (sourceWidth * STORY_HEIGHT) / sourceHeight;
  }

  sprite.width = width;
  sprite.height = height;
  sprite.position.set(0, 0);
}

/**
 * `Image.GenerateTiledSprite` lays tiles out from the rect's lower-left
 * corner and clips the last row at the top edge, while a TilingSprite starts
 * at its top-left corner. Shifting the tile origin by the leftover height
 * puts a tile boundary on the bottom edge like Unity. A no-op whenever the
 * rect is a whole number of tiles high, which covers every tiled story line
 * today (none passes screenadapt/width/height, so the rect is one tile).
 */
function alignTilesToLowerLeft(sprite: TilingSprite): void {
  const tileHeight = sprite.texture.height * sprite.tileScale.y;
  sprite.tilePosition.set(0, tileHeight > 0 ? sprite.height % tileHeight : 0);
}
