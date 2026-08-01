import { describe, expect, it } from "vitest";

import { rotateTweenDelta } from "../src/widgets/StoryPlayer/engine/rendering/core/SceneGeometry";

describe("AVGUtils.CreateRotateTween sweep", () => {
  it("forces a negative sweep clockwise even without circles", () => {
    // inverse defaults to false, and any positive delta is rewritten to
    // delta - 360, so angle=90 from 0 travels -270 rather than +90.
    expect(rotateTweenDelta(0, 90, 0, false)).toBe(-270);
    expect(rotateTweenDelta(0, 30, 0, false)).toBe(-330);
  });

  it("forces a positive sweep counter-clockwise even without circles", () => {
    expect(rotateTweenDelta(0, -90, 0, true)).toBe(270);
    expect(rotateTweenDelta(0, 270, 0, true)).toBe(270);
  });

  it("stacks whole circles on top of the direction-corrected delta", () => {
    expect(rotateTweenDelta(0, 90, 2, false)).toBe(-270 - 720);
    expect(rotateTweenDelta(0, 90, 2, true)).toBe(90 + 720);
  });

  it("wraps the current and target angles with Repeat rather than clamping", () => {
    expect(rotateTweenDelta(720, 90, 0, true)).toBe(90);
    expect(rotateTweenDelta(-90, 0, 0, true)).toBe(90);
    expect(rotateTweenDelta(45, 405, 0, true)).toBe(0);
  });

  it("keeps a 180 degree delta positive before the direction correction", () => {
    // Repeat puts delta at exactly 180, which the `> 180` test leaves alone.
    expect(rotateTweenDelta(0, 180, 0, true)).toBe(180);
    expect(rotateTweenDelta(0, 180, 0, false)).toBe(-180);
  });
});
