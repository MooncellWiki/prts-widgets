import {
  exactArg,
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

export const LOOP_BLOCK_WARNING =
  "Loop and block both true when tween background! Will cause intinity lop!";

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

  return {
    assetKind: imageGroup && !foreground ? "background" : "image",
    imageKeys: group
      .split("/")
      .map((key) => key.trim().toLowerCase())
      .filter(Boolean),
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
  const durationMs = Math.max(0, toNumber(read("duration")) * 1000);

  // The Web extension also accepts the static transform keys as fallbacks.
  const x = foreground ? toOptionalNumber(read("x")) : undefined;
  const y = foreground ? toOptionalNumber(read("y")) : undefined;
  const xScale = foreground ? toOptionalNumber(read("xScale")) : undefined;
  const yScale = foreground ? toOptionalNumber(read("yScale")) : undefined;
  return {
    block: durationMs > 0 && toBoolean(read("block")),
    durationMs,
    ease: toString(read("ease"), "Linear"),
    loop: toBoolean(read("loop")),
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
