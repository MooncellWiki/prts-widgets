import { describe, expect, it } from "vitest";

import {
  computeShowItemLayout,
  SHOWITEM_FRAME_BORDER,
} from "../src/widgets/StoryPlayer/engine/showitem";

describe("computeShowItemLayout", () => {
  it("sizes the nine-slice frame at the native sprite size plus 32px padding per side", () => {
    const layout = computeShowItemLayout(941, 529);

    // Serialized `sprite_avg_showItem_photo` border and the fitter's 32px
    // padding per side (2.7.51 APK scene, `slot_showItem_photo`).
    expect(SHOWITEM_FRAME_BORDER).toBe(32);
    expect(layout.frameWidth).toBe(941 + 32 * 2);
    expect(layout.frameHeight).toBe(529 + 32 * 2);
  });
});
