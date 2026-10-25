export interface ShakePoint {
  durationRatio: number;
  x: number;
  y: number;
}

export interface ShakePathInput {
  fadeOut: boolean;
  randomness: number;
  vectorBased: boolean;
  vibrato: number;
  xStrength: number;
  yStrength: number;
}

type RandomSource = () => number;

type Vector3 = { x: number; y: number; z: number };

function randomRange(min: number, max: number, random: RandomSource): number {
  return min + (max - min) * random();
}

function clampMagnitude(vector: Vector3, maxLength: number): Vector3 {
  const sqrMagnitude =
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z;
  if (sqrMagnitude <= maxLength * maxLength) return vector;
  const magnitude = Math.sqrt(sqrMagnitude);
  return {
    x: (vector.x / magnitude) * maxLength,
    y: (vector.y / magnitude) * maxLength,
    z: (vector.z / magnitude) * maxLength,
  };
}

function normalize(vector: Vector3): Vector3 {
  const magnitude = Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
  // Unity's Vector3.Normalize collapses near-zero vectors to zero.
  if (magnitude <= 1e-5) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

/**
 * Ports the waypoint walk of the inner `DG.Tweening.DOTween.Shake` overload
 * (2.7.81 @ 0x18424e2d0; branch-identical in 2.7.71/2.7.51) used by
 * `Torappu.AVG.AVGCameraEffect._ExecuteCameraShake` and
 * `AVGCharacterSlot.CharShake`:
 *
 * - `vectorBased: true` — Vector3-strength `DOShakePosition` (CameraShake).
 *   Radius = |(xStrength, yStrength, 0)|; each waypoint is a full-radius
 *   direction from `Vector3FromAngle` rotated by `AngleAxis(rnd, up)`, then
 *   pushed through a per-axis `Vector3.ClampMagnitude` chain whose lengths
 *   are xStrength / yStrength / 0. The chain only biases the direction —
 *   the final `Normalize × radius` restores the full magnitude, so per-axis
 *   strengths shape the shake, they don't cap it (only a 0 strength kills
 *   its axis).
 * - `vectorBased: false` — float-strength `DOShakePosition` (CharShake;
 *   native expands the scalar to (s, s, s) and uses only `.x` as the
 *   circle radius). The rotated waypoint's Z component, invisible on a 2D
 *   canvas, is dropped.
 *
 * `fadeOut` decays the radius by `radius / count` per waypoint; native also
 * re-clamps the strength vector to the decayed radius each iteration, which
 * scales the clamp lengths by the same factor, so multiplying the finished
 * waypoint by `fade` is exactly equivalent. `sampleShakePath` stays linear
 * per segment because the `SetShake` startup forces Ease.Linear on every
 * shake tween.
 */
export function buildShakePath(
  durationMs: number,
  input: ShakePathInput,
  random: RandomSource = Math.random,
): ShakePoint[] {
  const durationSeconds = Math.max(0, durationMs) / 1000;
  const count = Math.max(
    2,
    Math.trunc(Math.max(0, input.vibrato) * durationSeconds),
  );
  const randomness = Math.max(0, input.randomness);
  const radius = input.vectorBased
    ? Math.sqrt(input.xStrength ** 2 + input.yStrength ** 2)
    : input.xStrength;
  const rawDurations = Array.from({ length: count }, (_, index) =>
    input.fadeOut ? index + 1 : 1,
  );
  const durationTotal = rawDurations.reduce((total, value) => total + value, 0);
  let angle = randomRange(0, 360, random);

  return rawDurations.map((rawDuration, index) => {
    if (index === count - 1)
      return { durationRatio: rawDuration / durationTotal, x: 0, y: 0 };

    if (index > 0)
      angle = angle - 180 + randomRange(-randomness, randomness, random);

    const radians = (angle * Math.PI) / 180;
    // Full mode draws a second independent random per waypoint and rotates
    // the direction around Vector3.up; with the input Z already 0 this
    // leaves Y untouched.
    const tilt = (randomRange(-randomness, randomness, random) * Math.PI) / 180;
    const sinAngle = Math.sin(radians);
    const vec = {
      x: sinAngle * radius * Math.cos(tilt),
      y: Math.cos(radians) * radius,
      z: -sinAngle * radius * Math.sin(tilt),
    };
    const fade = input.fadeOut ? 1 - index / count : 1;

    if (!input.vectorBased)
      return {
        durationRatio: rawDuration / durationTotal,
        x: vec.x * fade,
        y: vec.y * fade,
      };

    const xAxis = clampMagnitude(vec, input.xStrength);
    const yAxis = clampMagnitude({ ...vec, x: xAxis.x }, input.yStrength);
    // zStrength is hard-coded 0: ClampMagnitude(v, 0) zeroes the axis.
    const direction = normalize({ x: xAxis.x, y: yAxis.y, z: 0 });
    return {
      durationRatio: rawDuration / durationTotal,
      x: direction.x * radius * fade,
      y: direction.y * radius * fade,
    };
  });
}

export function sampleShakePath(
  path: ShakePoint[],
  progress: number,
): { x: number; y: number } {
  const target = Math.min(1, Math.max(0, progress));
  let elapsed = 0;
  let fromX = 0;
  let fromY = 0;

  for (const point of path) {
    const end = elapsed + point.durationRatio;
    if (target <= end || point === path.at(-1)) {
      const localProgress =
        point.durationRatio > 0
          ? Math.min(1, (target - elapsed) / point.durationRatio)
          : 1;
      return {
        x: fromX + (point.x - fromX) * localProgress,
        y: fromY + (point.y - fromY) * localProgress,
      };
    }
    elapsed = end;
    fromX = point.x;
    fromY = point.y;
  }

  return { x: 0, y: 0 };
}
