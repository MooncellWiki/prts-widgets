import { describe, expect, it } from "vitest";

import { computeLegacyShowItemLayout } from "../src/widgets/StoryPlayer/engine/showitem";

describe("computeLegacyShowItemLayout", () => {
  it("translates the legacy 960x540 showitem sizing into the 1280x720 stage", () => {
    const layout = computeLegacyShowItemLayout(941, 529);
    expect(layout.borderPx).toBe(10);
    expect(layout.contentHeight).toBeCloseTo(423.2);
    expect(layout.contentWidth).toBeCloseTo(752.8);
    expect(layout.scale).toBeCloseTo(0.8);
  });

  it("preserves the legacy border thickness ratio", () => {
    expect(computeLegacyShowItemLayout(200, 100).borderPx).toBe(10);
  });
});
