// Native slot metrics, measured from the serialized scene
// (`slot_showItem_photo` / `slot_showItem_cutin` prefabs in PC 2.7.91
// sharedassets1.assets):
//
// SceneCanvas runs a 1280x720 ScaleWithScreenSize scaler — the stage's exact
// logical size — and every slot ancestor is scale 1, so the base `Show`
// (`SetNativeSize`) renders each item sprite at its native pixel size. The
// "photo frame" is NOT baked into the item art (avg/items sprites carry no
// border): it is the photo prefab's `background` Image (a sibling drawn
// under `image_item`) with the nine-sliced `sprite_avg_showItem_photo`
// (120x409, border 32 on every side), which a `UICustomAnchor` re-fits every
// frame to `image_item` plus 32px padding per side.
// That sprite ships inside the client's scene assets — CDN hot-update and the
// PRTS mirror do not carry it — so the texture is bundled via assets.ts.
//
// The cutin prefab instead nests a RectMask2D window (`offset` → `mask`,
// width x 720; `offset` stretches over the fixed 1280x720 `panel_avg`)
// around a 0.192-gray plate, the plate's 200px `header` strip tinted from
// `sprite_avg_cutscene` (0,0,0,0.706) — pivot bottom-center 50px above the
// window top and rotated 180°, so 150px of it hangs into the window upside
// down — and the centered item; `fadestyle` drives which edge the window
// expands from.

import { tryParseInt32 } from "./commandParams";

import type { ShowItemLayout } from "./types";

export type { ShowItemLayout };

export const SHOWITEM_FRAME_BORDER = 32;

/** `AVGShowItemCutinSlot.FadeStyle` member names and values. */
export enum ShowItemFadeStyle {
  fade = 0,
  horiz_expand_center = 1,
  horiz_expand_left2right = 2,
  horiz_expand_right2left = 3,
  vert_expand_center = 4,
  vert_expand_top2bottom = 5,
  vert_expand_bottom2top = 6,
}

/**
 * 2791 GetEnum @ 0x1846BAC50 uses case-sensitive Enum.Parse, including
 * unnamed Int32 values and comma-separated names. Its catch path logs and
 * returns the supplied default (fade).
 */
export function parseShowItemFadeStyle(raw: string): ShowItemFadeStyle {
  const ordinal = tryParseInt32(raw.trim());
  if (ordinal !== null) return ordinal;

  let result = ShowItemFadeStyle.fade;
  for (const member of raw.split(",")) {
    const name = member.trim() as keyof typeof ShowItemFadeStyle;
    const value = ShowItemFadeStyle[name];
    if (typeof value !== "number") return ShowItemFadeStyle.fade;
    result |= value;
  }
  return result;
}

export function computeShowItemLayout(
  sourceWidth: number,
  sourceHeight: number,
): ShowItemLayout {
  return {
    frameHeight: sourceHeight + SHOWITEM_FRAME_BORDER * 2,
    frameWidth: sourceWidth + SHOWITEM_FRAME_BORDER * 2,
  };
}
