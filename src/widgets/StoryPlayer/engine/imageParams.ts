import {
  exactArg,
  toBoolean,
  toNumber,
  toOptionalNumber,
  toString,
} from "./commandParams";

import type {
  BackgroundInput,
  ImageTweenInput,
  StoryCommandArgs,
} from "./types";

function parseScreenAdapt(value: unknown): BackgroundInput["screenAdapt"] {
  const mode = toString(value);
  if (
    mode === "coverall" ||
    mode === "fill" ||
    mode === "height" ||
    mode === "showall" ||
    mode === "width"
  )
    return mode;
  return undefined;
}

/** Foreground and background share AVGImagePanel._LoadImage (2791 @ 0x1841ADFA0). */
export function parseImageLayout(
  args: StoryCommandArgs,
): Omit<BackgroundInput, "block" | "fadeMs"> {
  return {
    height: toNumber(exactArg(args, "height"), 1),
    scaleX: toNumber(exactArg(args, "xScale"), 1),
    scaleY: toNumber(exactArg(args, "yScale"), 1),
    screenAdapt: parseScreenAdapt(exactArg(args, "screenadapt")),
    tiled: toBoolean(exactArg(args, "tiled"), false),
    width: toNumber(exactArg(args, "width"), 1),
    x: toNumber(exactArg(args, "x")),
    y: toNumber(exactArg(args, "y")),
  };
}

/** AVGImagePanel._ExecuteImageTween (2791 @ 0x1841AD170). */
export function parseImageTween(
  args: StoryCommandArgs,
): Omit<ImageTweenInput, "block" | "durationMs"> {
  return {
    ease: toString(exactArg(args, "ease"), "Linear"),
    loop: toBoolean(exactArg(args, "loop"), false),
    xFrom: toOptionalNumber(exactArg(args, "xFrom")),
    xScaleFrom: toOptionalNumber(exactArg(args, "xScaleFrom")),
    xScaleTo: toOptionalNumber(exactArg(args, "xScaleTo")),
    xTo: toOptionalNumber(exactArg(args, "xTo")),
    yFrom: toOptionalNumber(exactArg(args, "yFrom")),
    yScaleFrom: toOptionalNumber(exactArg(args, "yScaleFrom")),
    yScaleTo: toOptionalNumber(exactArg(args, "yScaleTo")),
    yTo: toOptionalNumber(exactArg(args, "yTo")),
  };
}
