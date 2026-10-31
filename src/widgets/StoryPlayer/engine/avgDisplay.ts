import type { AvgDisplaySlot, AvgDisplayStyle } from "./types";

/**
 * Native port: Torappu.AVG.AVGDisplayableUtil.GenTypeFromRaw / GenSlotFromRaw
 * (2.7.81 VA 0x183F9B340 / 0x183F9B210). Both try `Int32.TryParse` first
 * (surrounding ASCII whitespace, a sign and leading zeros all parse; no enum
 * range check), then a case-sensitive alias match, else NONE.
 *
 * The web keeps the alias spelling as the canonical value, so every
 * downstream string comparison (AvgDisplayPanel's holder reuse check, which
 * mirrors `_DisplayInternal`'s enum comparison, feature routing, preload)
 * behaves like the native enum. Values with no alias stay raw for
 * diagnostics: native can never build a holder for them (`_GenerateDisplayable`
 * returns null for slot NONE and for types without a holder prefab).
 */
const STYLE_ALIASES: Readonly<Record<number, AvgDisplayStyle>> = {
  1: "animetext",
  2: "spine",
  3: "effect",
  4: "bgeffect",
  5: "bg",
  6: "animekv",
  7: "character",
};

const SLOT_ALIASES: Readonly<Record<number, AvgDisplaySlot>> = {
  1: "bgover",
  2: "charover",
  3: "cgover",
};

function resolveAlias(
  raw: string,
  byValue: Readonly<Record<number, string>>,
): string {
  const integer = /^[\t-\r ]*([+-]?\d+)[\t-\r ]*$/.exec(raw)?.[1];
  return (integer === undefined ? undefined : byValue[Number(integer)]) ?? raw;
}

export function resolveAvgDisplayStyle(raw: string): AvgDisplayStyle {
  return resolveAlias(raw, STYLE_ALIASES);
}

export function resolveAvgDisplaySlot(raw: string): AvgDisplaySlot {
  return resolveAlias(raw, SLOT_ALIASES);
}
