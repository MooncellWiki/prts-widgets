import {
  exactArg,
  getBool,
  hasTweenDuration,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "./commandParams";

import type {
  LargeBackgroundTweenInput,
  StoryCommandArgs,
  StoryCommandValue,
} from "./types";

/** Web-only key lookup used by largeimg and largeimgtween. */
export function legacyPuzzleArg(
  args: StoryCommandArgs,
  key: string,
): StoryCommandValue | undefined {
  if (Object.prototype.hasOwnProperty.call(args, key)) return args[key];
  const match = Object.keys(args).find(
    (candidate) => candidate.toLowerCase() === key,
  );
  return match === undefined ? undefined : args[match];
}

/** Native _TryExtractCGParam prefers imagegroup. Web largeimg uses the image route. */
export function resolvePuzzleAssets(
  args: StoryCommandArgs,
  foreground: boolean,
): { assetKind: "background" | "image"; imageKeys: string[] } | null {
  const read = foreground ? legacyPuzzleArg : exactArg;
  const imageGroup = toString(read(args, "imagegroup"));
  const group = imageGroup || toString(read(args, "cggroup"));
  if (!group) return null;

  // Native Split('/') keeps each slot for the executor's count and name checks.
  const imageKeys = group.split("/").map((key) => key.trim().toLowerCase());
  return {
    assetKind: imageGroup && !foreground ? "background" : "image",
    imageKeys: foreground ? imageKeys.filter(Boolean) : imageKeys,
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
  foreground: boolean,
): LargeBackgroundTweenInput {
  const read = foreground
    ? (key: string) => legacyPuzzleArg(args, key.toLowerCase())
    : (key: string) => exactArg(args, key);
  const seconds = Math.max(0, toNumber(read("duration")));
  const timed = foreground ? seconds > 0 : hasTweenDuration(seconds);
  const loop = foreground ? toBoolean(read("loop")) : getBool(args, "loop");

  // The Web extension also accepts the static transform keys as fallbacks.
  const x = foreground ? toOptionalNumber(read("x")) : undefined;
  const y = foreground ? toOptionalNumber(read("y")) : undefined;
  const xScale = foreground ? toOptionalNumber(read("xScale")) : undefined;
  const yScale = foreground ? toOptionalNumber(read("yScale")) : undefined;
  return {
    block:
      timed && (foreground ? toBoolean(read("block")) : getBool(args, "block")),
    // _ExecuteImageTween calls Complete for a near-zero duration. DOTween
    // skips that operation on an infinite loop.
    durationMs: timed || loop ? seconds * 1000 : 0,
    ease: toString(read("ease"), "Linear"),
    loop,
    xFrom: toOptionalNumber(read("xFrom")) ?? x,
    xScaleFrom: toOptionalNumber(read("xScaleFrom")) ?? xScale,
    xScaleTo: toOptionalNumber(read("xScaleTo")) ?? xScale,
    xTo: toOptionalNumber(read("xTo")) ?? x,
    yFrom: toOptionalNumber(read("yFrom")) ?? y,
    yScaleFrom: toOptionalNumber(read("yScaleFrom")) ?? yScale,
    yScaleTo: toOptionalNumber(read("yScaleTo")) ?? yScale,
    yTo: toOptionalNumber(read("yTo")) ?? y,
  };
}
