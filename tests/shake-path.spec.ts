import { describe, expect, it } from "vitest";

import {
  buildShakePath,
  sampleShakePath,
} from "../src/widgets/StoryPlayer/engine/rendering/core/ShakePath";

describe("DOTween-compatible shake path", () => {
  it("builds vibrato * duration waypoints with fade-out-weighted durations and returns to zero", () => {
    const path = buildShakePath(
      2000,
      {
        fadeOut: true,
        randomness: 60,
        vibrato: 30,
        xStrength: 14,
        yStrength: 6,
      },
      () => 0.5,
    );

    expect(path).toHaveLength(60);
    expect(path.at(-1)).toMatchObject({ x: 0, y: 0 });
    expect(
      path.reduce((sum, point) => sum + point.durationRatio, 0),
    ).toBeCloseTo(1);
    // fadeOut weights the waypoints 1, 2, ..., 60 out of their 1830 total.
    expect(path[0].durationRatio).toBe(1 / 1830);
    expect(path[1].durationRatio).toBe(2 / 1830);
  });

  it("treats randomness as angular deviation instead of a probability", () => {
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 0,
        vibrato: 3,
        xStrength: 10,
        yStrength: 10,
      },
      () => 0,
    );

    expect(path[0].x).toBeCloseTo(10);
    expect(path[1].x).toBeCloseTo(-10);
    expect(path[0].y).toBeCloseTo(0);
    expect(path[1].y).toBeCloseTo(0);
  });

  it("discards the Full-mode tilt that rotates into the disabled Z axis", () => {
    const values = [0, 1];
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 60,
        vibrato: 2,
        xStrength: 10,
        yStrength: 6,
      },
      () => values.shift() ?? 0.5,
    );

    expect(path[0].x).toBeCloseTo(5);
    expect(path[0].y).toBeCloseTo(0);
  });

  it("interpolates continuously between waypoints", () => {
    const path = [
      { durationRatio: 0.5, x: 10, y: 4 },
      { durationRatio: 0.5, x: 0, y: 0 },
    ];
    expect(sampleShakePath(path, 0.25)).toEqual({ x: 5, y: 2 });
    expect(sampleShakePath(path, 1)).toEqual({ x: 0, y: 0 });
  });
});
