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
        vectorBased: true,
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

  it("keeps every vectorBased waypoint at |(xStrength, yStrength)| whatever the clamp chain does", () => {
    // Constant random 0.25 → angle 90°, tilt -30°. The per-axis
    // ClampMagnitude chain biases the direction (waypoint lands on +X) but
    // the final renormalize restores the full radius sqrt(10² + 6²), which
    // exceeds xStrength itself — per-axis strengths never cap the magnitude.
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 60,
        vectorBased: true,
        vibrato: 2,
        xStrength: 10,
        yStrength: 6,
      },
      () => 0.25,
    );

    expect(path[0].x).toBeCloseTo(Math.sqrt(136));
    expect(path[0].y).toBeCloseTo(0);
    expect(path[1]).toMatchObject({ x: 0, y: 0 });
  });

  it("treats randomness as angular deviation instead of a probability", () => {
    // randomness 0 → the angle flips by 180° each waypoint; angle 0° puts
    // the walk on Y at ±|strength|.
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 0,
        vectorBased: true,
        vibrato: 3,
        xStrength: 10,
        yStrength: 10,
      },
      () => 0,
    );

    expect(path[0].y).toBeCloseTo(Math.sqrt(200));
    expect(path[1].y).toBeCloseTo(-Math.sqrt(200));
    expect(path[0].x).toBeCloseTo(0);
    expect(path[1].x).toBeCloseTo(0);
  });

  it("kills the axis whose strength is 0 (ClampMagnitude(v, 0))", () => {
    // angle 90° keeps the walk on X at the full single-axis magnitude;
    // yStrength 0 zeroes the Y component of every waypoint.
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 0,
        vectorBased: true,
        vibrato: 3,
        xStrength: 10,
        yStrength: 0,
      },
      () => 0.25,
    );

    expect(path[0].x).toBeCloseTo(10);
    expect(path[0].y).toBe(0);
    expect(path[1].x).toBeCloseTo(-10);
    expect(path[1].y).toBe(0);
  });

  it("scales waypoint magnitudes linearly when fading out", () => {
    const path = buildShakePath(
      1000,
      {
        fadeOut: true,
        randomness: 0,
        vectorBased: true,
        vibrato: 3,
        xStrength: 6,
        yStrength: 8,
      },
      () => 0,
    );

    expect(Math.hypot(path[0].x, path[0].y)).toBeCloseTo(10);
    expect(Math.hypot(path[1].x, path[1].y)).toBeCloseTo(10 * (2 / 3));
    expect(path[2]).toMatchObject({ x: 0, y: 0 });
  });

  it("uses the scalar radius directly on the non-vectorBased branch", () => {
    // CharShake expands the scalar strength to (s, s, s) but only .x is the
    // radius — 8 here, not |(8, 8)| — and the rotated Z component is
    // dropped by the 2D renderer.
    const path = buildShakePath(
      1000,
      {
        fadeOut: false,
        randomness: 0,
        vectorBased: false,
        vibrato: 3,
        xStrength: 8,
        yStrength: 8,
      },
      () => 0,
    );

    expect(path[0].y).toBeCloseTo(8);
    expect(path[1].y).toBeCloseTo(-8);
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
