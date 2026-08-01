export interface ShakePoint {
  durationRatio: number;
  x: number;
  y: number;
}

export interface ShakePathInput {
  fadeOut: boolean;
  randomness: number;
  vibrato: number;
  xStrength: number;
  yStrength: number;
}

type RandomSource = () => number;

function randomRange(min: number, max: number, random: RandomSource): number {
  return min + (max - min) * random();
}

/** Build the waypoint array used by DOTween's vector-based Shake overload. */
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
    // Full mode also rotates the waypoint around Vector3.up by an independent
    // random angle. CameraShake has zStrength=0, so the resulting Z component
    // is discarded and only the attenuated X component remains visible.
    const tilt = (randomRange(-randomness, randomness, random) * Math.PI) / 180;
    const fade = input.fadeOut ? 1 - index / count : 1;
    return {
      durationRatio: rawDuration / durationTotal,
      x: Math.cos(radians) * Math.cos(tilt) * input.xStrength * fade,
      y: Math.sin(radians) * input.yStrength * fade,
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
