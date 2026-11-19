import { exactArg, getBool, getFiniteFloat, toString } from "./commandParams";

import type {
  BackgroundInput,
  ImageTweenInput,
  StoryCommandArgs,
} from "./types";

export const LOOP_BLOCK_WARNING =
  "Loop and block both true when tween background! Will cause intinity lop!";

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
    height: getFiniteFloat(args, "height") ?? 1,
    scaleX: getFiniteFloat(args, "xScale") ?? 1,
    scaleY: getFiniteFloat(args, "yScale") ?? 1,
    screenAdapt: parseScreenAdapt(exactArg(args, "screenadapt")),
    tiled: getBool(args, "tiled"),
    width: getFiniteFloat(args, "width") ?? 1,
    x: getFiniteFloat(args, "x") ?? 0,
    y: getFiniteFloat(args, "y") ?? 0,
  };
}

/** AVGImagePanel._ExecuteImageTween (2791 @ 0x1841AD170). */
export function parseImageTween(
  args: StoryCommandArgs,
): Omit<ImageTweenInput, "block" | "durationMs"> {
  return {
    ease: toString(exactArg(args, "ease"), "Linear"),
    loop: getBool(args, "loop"),
    xFrom: getFiniteFloat(args, "xFrom"),
    xScaleFrom: getFiniteFloat(args, "xScaleFrom"),
    xScaleTo: getFiniteFloat(args, "xScaleTo"),
    xTo: getFiniteFloat(args, "xTo"),
    yFrom: getFiniteFloat(args, "yFrom"),
    yScaleFrom: getFiniteFloat(args, "yScaleFrom"),
    yScaleTo: getFiniteFloat(args, "yScaleTo"),
    yTo: getFiniteFloat(args, "yTo"),
  };
}
