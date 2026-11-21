import {
  exactArg,
  getBool,
  hasTweenDuration,
  toNumber,
  toOptionalNumber,
  toString,
} from "./commandParams";

import type { LargeBackgroundTweenInput, StoryCommandArgs } from "./types";

/** Native _TryExtractCGParam prefers imagegroup to cggroup. */
export function resolvePuzzleAssets(
  args: StoryCommandArgs,
): { assetKind: "background" | "image"; imageKeys: string[] } | null {
  const imageGroup = toString(exactArg(args, "imagegroup"));
  const group = imageGroup || toString(exactArg(args, "cggroup"));
  if (!group) return null;

  // Native Split('/') keeps each slot for the executor's count and name checks.
  return {
    assetKind: imageGroup ? "background" : "image",
    imageKeys: group.split("/").map((key) => key.trim().toLowerCase()),
  };
}

export function parsePuzzleDimensions(value: unknown): number[] {
  if (typeof value === "number" && Number.isFinite(value)) return [value];
  if (typeof value !== "string") return [];

  return value
    .split("/")
    .map((part) => Number(part.trim().replaceAll(",", "")))
    .filter(Number.isFinite);
}

/** LargeBackgroundPanel._ExecuteImageTween uses literal seconds and exact keys. */
export function parsePuzzleTween(
  args: StoryCommandArgs,
): LargeBackgroundTweenInput {
  const read = (key: string) => exactArg(args, key);
  const seconds = Math.max(0, toNumber(read("duration")));
  const timed = hasTweenDuration(seconds);
  const loop = getBool(args, "loop");
  return {
    block: timed && getBool(args, "block"),
    // _ExecuteImageTween calls Complete for a near-zero duration. DOTween
    // skips that operation on an infinite loop.
    durationMs: timed || loop ? seconds * 1000 : 0,
    ease: toString(read("ease"), "Linear"),
    loop,
    xFrom: toOptionalNumber(read("xFrom")),
    xScaleFrom: toOptionalNumber(read("xScaleFrom")),
    xScaleTo: toOptionalNumber(read("xScaleTo")),
    xTo: toOptionalNumber(read("xTo")),
    yFrom: toOptionalNumber(read("yFrom")),
    yScaleFrom: toOptionalNumber(read("yScaleFrom")),
    yScaleTo: toOptionalNumber(read("yScaleTo")),
    yTo: toOptionalNumber(read("yTo")),
  };
}
