// Native slot metrics, measured from the serialized scene
// (`slot_showItem_photo` / `slot_showItem_cutin` prefabs, 2.7.51 APK
// sharedassets1, re-checked against 2.7.81):
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
// expands from (see the renderer's cutin state).

import { tryParseInt32 } from "./commandParams";

import type { ShowItemFadeStyle, ShowItemLayout } from "./types";

export type { ShowItemFadeStyle, ShowItemLayout };

export const SHOWITEM_FRAME_BORDER = 32;

/** `AVGShowItemCutinSlot.FadeStyle` member names in ordinal order. */
const FADE_STYLES: readonly ShowItemFadeStyle[] = [
  "fade",
  "horiz_expand_center",
  "horiz_expand_left2right",
  "horiz_expand_right2left",
  "vert_expand_center",
  "vert_expand_top2bottom",
  "vert_expand_bottom2top",
];

/** 2791 CutinSlot.Show (0x184244230) uses case-sensitive GetEnum. */
export function parseShowItemFadeStyle(
  raw: string | undefined,
): ShowItemFadeStyle | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const ordinal = tryParseInt32(value);
  return ordinal === null
    ? FADE_STYLES.find((style) => style === value)
    : FADE_STYLES[ordinal];
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
