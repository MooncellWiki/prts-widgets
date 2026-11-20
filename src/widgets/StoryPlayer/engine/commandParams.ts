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
const FLOAT_ZERO_TOLERANCE = Math.fround(1e-5);

/** Exact-key parameter lookup (no case folding), as `Command.TryGetParam`. */
export function exactArg(
  args: StoryCommandArgs,
  key: string,
): StoryCommandValue | undefined {
  return Object.prototype.hasOwnProperty.call(args, key)
    ? args[key]
    : undefined;
}

/** AVGVariableConfig.Convert (2791 @ 0x1841991E0) runs before typed reads. */
export function convertStoryParameter(
  value: StoryCommandValue | undefined,
  variables?: Readonly<Record<string, unknown>>,
): StoryCommandValue | undefined {
  if (typeof value !== "string" || !value.startsWith("$") || !variables)
    return value;

  // The Web context stores variable names lowercased.
  const key = value.slice(1).toLowerCase();
  if (!Object.hasOwn(variables, key)) return value;
  const replacement = variables[key];
  if (
    replacement === null ||
    typeof replacement === "string" ||
    typeof replacement === "number" ||
    typeof replacement === "boolean"
  )
    return replacement;
  return value;
}

/** `System.Number.IsWhite` accepts space and the ASCII characters 0x09–0x0D. */
function isDotNetWhite(text: string, at: number): boolean {
  const code = text.codePointAt(at) ?? -1;
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/** Number.TryParseInt32IntegerStyle (2791 @ 0x186126910), before the range check. */
function parseInteger(text: string): number | null {
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
  // Number.TrailingZeros accepts a suffix consisting entirely of NULs.
  while (text[i] === "\0") i++;
  if (i !== text.length) return null;

  return negative && magnitude !== 0 ? -magnitude : magnitude;
}

function inInt32Range(value: number): boolean {
  return value >= INT32_MIN && value <= INT32_MAX;
}

/** System.Int32.TryParse with NumberStyles.Integer. */
export function tryParseInt32(text: string): number | null {
  const value = parseInteger(text);
  return value !== null && inInt32Range(value) ? value : null;
}

const enumWhitespace = /\p{White_Space}/u;

function trimEnumWhitespace(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && enumWhitespace.test(text[start]!)) start++;
  while (end > start && enumWhitespace.test(text[end - 1]!)) end--;
  return text.slice(start, end);
}

type EnumMembers = Readonly<Record<string, number | string>>;

// The AVG enum identifiers are ASCII. 2791 OrdinalIgnoreCase uppercases
// individual UTF-16 chars and its invariant table maps only a-z into A-Z.
function foldEnumName(name: string): string {
  return name.replace(/[a-z]/g, (letter) => letter.toUpperCase());
}

function enumMemberValue(
  members: EnumMembers,
  name: string,
  ignoreCase: boolean,
): number | null {
  if (ignoreCase) {
    const folded = foldEnumName(name);
    let first: number | null = null;
    for (const [key, value] of Object.entries(members)) {
      if (typeof value !== "number" || foldEnumName(key) !== folded) continue;
      // GetCachedValuesAndNames orders names by unsigned enum value.
      if (first === null || value >>> 0 < first >>> 0) first = value;
    }
    return first;
  }
  const value = Object.hasOwn(members, name) ? members[name] : undefined;
  return typeof value === "number" ? value : null;
}

/**
 * System.Enum.TryParseEnum (2791 @ 0x18615E0A0) for the Int32-backed AVG enums.
 * GetEnum<T> (@ 0x1846BAC50) supplies the caller's default on failure.
 */
export function tryParseEnum(
  raw: string | null | undefined,
  members: EnumMembers,
  ignoreCase = false,
): number | null {
  if (raw == null) return null;
  const text = trimEnumWhitespace(raw);
  if (!text) return null;
  // Convert.ChangeType falls through to names on FormatException only.
  // An unnamed integer succeeds, and OverflowException ends the parse.
  if (/^[-+\p{Decimal_Number}]/u.test(text[0]!)) {
    const ordinal = parseInteger(text);
    if (ordinal !== null) return inInt32Range(ordinal) ? ordinal : null;
  }

  let result = 0;
  for (const member of text.split(",")) {
    const value = enumMemberValue(
      members,
      trimEnumWhitespace(member),
      ignoreCase,
    );
    if (value === null) return null;
    result |= value;
  }
  return result;
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

/** A literal duration above the 2791 MathUtil.LE(seconds, 0) tolerance (@ 0x186945C90). */
export function hasTweenDuration(seconds: number): boolean {
  return Math.fround(seconds) > FLOAT_ZERO_TOLERANCE;
}

/** 2791 MathUtil.IsZero(float) @ 0x186945A80. */
export function isZeroFloat(value: number): boolean {
  return Math.abs(Math.fround(value)) <= FLOAT_ZERO_TOLERANCE;
}

/** 2791 MathUtil.GE(float, 0) @ 0x186945130. */
export function isNonNegativeFloat(value: number): boolean {
  return Math.fround(value) >= -FLOAT_ZERO_TOLERANCE;
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
  return inInt32Range(integer) ? integer : null;
}

// The client sets InvariantCulture in _InitAPPDefaultCulture (2791).
// Convert.ToSingle uses Single.Parse with group separators for strings.
function parseSingleInput(value: StoryCommandValue): number | null {
  if (typeof value !== "string") return Number(value);

  const text = value.trim();
  if (text === "NaN") return Number.NaN;
  if (text === "Infinity" || text === "-Infinity") return Number(text);
  if (!/^[+-]?(?:\d[\d,]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
    return null;

  const parsed = Number(text.replaceAll(",", ""));
  return Number.isFinite(Math.fround(parsed)) ? parsed : null;
}

/** Convert.ToSingle for boxed command values. */
export function tryConvertToSingle(value: StoryCommandValue): number | null {
  const parsed = parseSingleInput(value);
  return parsed === null ? null : Math.fround(parsed);
}

/**
 * Uses Convert.ToSingle input syntax while keeping Web frame timing at
 * JavaScript precision. Missing and invalid values use the caller's default.
 */
export function getFiniteFloat(
  args: StoryCommandArgs,
  key: string,
  variables?: Readonly<Record<string, unknown>>,
): number | undefined {
  const value = convertStoryParameter(exactArg(args, key), variables);
  if (value === undefined) return undefined;
  const parsed = parseSingleInput(value);
  return parsed !== null && Number.isFinite(Math.fround(parsed))
    ? parsed
    : undefined;
}

export function toBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

/** GetBool / Command.TryGetParam<bool> (2791) use Convert.ToBoolean. */
export function getBool(
  args: StoryCommandArgs,
  key: string,
  variables?: Readonly<Record<string, unknown>>,
): boolean {
  const value = convertStoryParameter(exactArg(args, key), variables);
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string")
    return /^[\p{White_Space}\0]*true[\p{White_Space}\0]*$/iu.test(value);
  return value === true;
}

export function toString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return fallback;
}

/** DotNetExtensionMethods.GetString (2791 @ 0x1869417D0) calls Convert.ToString. */
export function boxedParamString(value: unknown): string {
  if (typeof value === "boolean") return value ? "True" : "False";
  return toString(value);
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
