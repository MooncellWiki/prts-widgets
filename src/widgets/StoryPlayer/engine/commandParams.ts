import type {
  OverlayTextLayout,
  StoryCommandArgs,
  StoryCommandValue,
} from "./types";

/**
 * `AVGTypeWriterText.originDelay` of the dialogue / sticker typewriter assets
 * (0.04s). Commands that take a `delay` ratio scale the global
 * typeWriterDelay by `delay / originDelay`.
 */
export const TYPE_WRITER_ORIGIN_DELAY_MS = 40;

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;

/** Exact-key parameter lookup (no case folding), as `Command.TryGetParam`. */
export function exactArg(
  args: StoryCommandArgs,
  key: string,
): StoryCommandValue | undefined {
  return Object.prototype.hasOwnProperty.call(args, key)
    ? args[key]
    : undefined;
}

/** `System.Number.IsWhite` accepts space and the ASCII characters 0x09–0x0D. */
function isDotNetWhite(text: string, at: number): boolean {
  const code = text.codePointAt(at) ?? -1;
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/**
 * Native port of `System.Int32.TryParse` with `NumberStyles.Integer`.
 * Accepts leading and trailing whitespace and a leading sign. Invalid input
 * or values outside the signed 32-bit range return null.
 */
export function tryParseInt32(text: string): number | null {
  let i = 0;
  while (i < text.length && isDotNetWhite(text, i)) i++;

  let negative = false;
  if (text[i] === "+" || text[i] === "-") {
    negative = text[i] === "-";
    i++;
  }

  const digitsStart = i;
  while (i < text.length && text[i]! >= "0" && text[i]! <= "9") i++;
  if (i === digitsStart) return null;

  const magnitude = Number(text.slice(digitsStart, i));

  while (i < text.length && isDotNetWhite(text, i)) i++;
  if (i !== text.length) return null;

  const value = negative ? -magnitude : magnitude;
  if (value < INT32_MIN || value > INT32_MAX) return null;
  return value;
}

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

/** Numeric conversion used by `System.Convert.ToInt32(double)`. */
export function roundHalfToEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction < 0.5) return floor;
  if (fraction > 0.5) return floor + 1;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Convert.ToInt32 for boxed command values. Returns null on conversion failure.
 */
export function tryConvertToInt32(
  value: StoryCommandValue | undefined,
): number | null {
  if (typeof value === "string") return tryParseInt32(value);
  const integer =
    typeof value === "number" ? roundHalfToEven(value) : Number(value);
  return integer >= INT32_MIN && integer <= INT32_MAX ? integer : null;
}

/**
 * Convert.ToSingle for boxed command values. The client sets InvariantCulture
 * in _InitAPPDefaultCulture (2791), and Single.Parse allows group separators.
 */
export function tryConvertToSingle(value: StoryCommandValue): number | null {
  if (typeof value !== "string") return Math.fround(Number(value));

  const text = value.trim();
  if (text === "NaN") return Number.NaN;
  if (text === "Infinity" || text === "-Infinity") return Number(text);
  if (!/^[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return null;

  const single = Math.fround(Number(text.replaceAll(",", "")));
  return Number.isFinite(single) ? single : null;
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
): OverlayTextLayout["alignment"] | undefined {
  const normalized = toString(value).toLowerCase();
  if (
    normalized === "left" ||
    normalized === "center" ||
    normalized === "right"
  )
    return normalized;
  return undefined;
}
