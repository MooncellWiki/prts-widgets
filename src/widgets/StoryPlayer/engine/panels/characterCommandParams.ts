import { roundHalfToEven, toNumber } from "../commandParams";

import type { CharacterRefResolution } from "../characterRef";
import type { ParsedCommandLine, RuntimeWarning } from "../types";

export interface CharacterCommandContext {
  calculateFadeMs: (seconds: unknown, fallback: number) => number;
  resolveCharacterName: (ref: string) => CharacterRefResolution;
  warn: (
    type: RuntimeWarning["type"],
    detail: string,
    line?: ParsedCommandLine,
  ) => void;
}

/**
 * Native port: `Command.GetOrDefault<int>` runs the JSON-boxed parameter value
 * through `System.Convert.ToInt32`. AVGParser wraps the parameter list in JSON,
 * so `random=true` arrives as a real boolean and converts to 1 (false to 0) --
 * it never means "enabled".
 */
export function toNativeIntParam(value: unknown, fallback: number): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "true") return 1;
  if (value === "false") return 0;
  return roundHalfToEven(toNumber(value, fallback));
}

/**
 * The ref makes native `SetImage` throw IndexOutOfRangeException, which
 * nothing catches before the `DoExecuteCommands` coroutine dies: native
 * stops running the story at this command, with the slot still showing its
 * previous art. Web adaptation: warn, leave the slot as it is and skip the
 * rest of the command, but keep playing (as with verticalbg's single tile).
 */
export function warnNativeSlotThrows(
  warn: CharacterCommandContext["warn"],
  ref: string,
  line: ParsedCommandLine,
): "continue" {
  warn(
    "invalid_parameter",
    `character ${ref} is out of its sprite hub's bounds; native SetImage throws and stops the story here`,
    line,
  );
  return "continue";
}
