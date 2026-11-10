import type { SubtitleInput } from "./types";
/**
 * Native port: `Command.GetOrDefault<float>` (2.7.71 `Command.TryGetParam`
 * VA 0x183EF3950) and `DotNetExtensionMethods.GetFloat` (VA 0x1862F7660)
 * both run the JSON-boxed parameter value through `System.Convert.ToSingle`
 * — `true`/`false` convert to 1/0 and exponent-notation strings ("1e2")
 * parse like any JSON number. A trailing decimal point is a number too:
 * `AVGParser._ParseCommand` deserializes the parameters with Newtonsoft,
 * whose `JsonTextReader.ParseNumber` hands an unquoted `afrom = 0.` to
 * `Double.TryParse(NumberStyles.Float)`, so corpus lines such as
 * level_main_15-01_end.txt:742 read 0, not the fallback. Values double.Parse
 * rejects (e.g. "abc") throw FormatException in native; `undefined` (the
 * caller's fallback) is kept here instead of breaking playback.
 */
export function toOptionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (
    typeof value === "string" &&
    /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(value.trim())
  )
    return Number(value);
  return undefined;
}

export function toNumber(value: unknown, fallback = 0): number {
  return toOptionalNumber(value) ?? fallback;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

export function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

export function parseVector2(
  value: unknown,
): { x: number; y: number } | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parts = value.split(",");
  if (parts.length < 2) return undefined;
  const x = Number(parts[0]!.trim());
  const y = Number(parts[1]!.trim());
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export function parseSubtitleAlignment(
  value: unknown,
): SubtitleInput["alignment"] | undefined {
  const normalized = toString(value).toLowerCase();
  if (
    normalized === "left" ||
    normalized === "center" ||
    normalized === "right"
  )
    return normalized;
  return undefined;
}
