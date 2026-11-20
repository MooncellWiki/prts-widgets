import { boxedParamString, tryParseEnum } from "./commandParams";

import type {
  ParsedDialogueLine,
  ParsedLine,
  StoryCommandArgs,
  StoryCommandValue,
  StoryMetadata,
} from "./types";

/**
 * Native provenance: `Torappu.AVG.AVGParser.cctor` and
 * `Torappu.AVG.AVGParser._ParseCommand`.
 *
 * Ports the command-tag shape and lower-cased command names. Parameter keys
 * deliberately retain source case, matching the native parameter dictionary.
 *
 */
const commandRegex = /^\[\s*(?:(.*?)\((.*)\)|(?:([.|\w]*)|(.*)))\s*\]\s*(.*)/;
// Param keys are case-sensitive in the native dictionary, so `[Name="X"]` is a
// dialog line whose `name` lookup misses -- it renders without a speaker rather
// than treating X as one.
const dialogueInnerRegex = /^name\s*=\s*"((?:\\.|[^"])*)"$/;

function splitArgs(raw: string) {
  const output: { commaTerminated: boolean; part: string }[] = [];
  let current = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index]!;
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\" && quote) {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    // JsonTextReader.ParseComment (2791 @ 0x1861B70B0) consumes block
    // comments between parameter tokens. Keep adjacent tokens separated.
    if (char === "/" && raw[index + 1] === "*") {
      const end = raw.indexOf("*/", index + 2);
      if (end !== -1) {
        current += " ";
        index = end + 1;
        continue;
      }
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    } else if (char === "," && depth === 0) {
      const part = current.trim();
      if (part) output.push({ commaTerminated: true, part });
      current = "";
      continue;
    }
    current += char;
  }

  const part = current.trim();
  if (part) output.push({ commaTerminated: false, part });
  return output;
}

const quotedEscapeCharacters: Readonly<Record<string, string>> = {
  '"': '"',
  "'": "'",
  "/": "/",
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/** JsonTextReader.ReadStringIntoBuffer (2791 @ 0x1861BD6E0). */
function unescapeQuoted(value: string): string {
  return value
    .slice(1, -1)
    .replace(/\\(u[\da-fA-F]{4}|.)/g, (_match, escaped: string) => {
      if (escaped.length === 5)
        return String.fromCharCode(Number.parseInt(escaped.slice(1), 16));
      return quotedEscapeCharacters[escaped] ?? `\\${escaped}`;
    });
}

function parseValue(value: string): StoryCommandValue {
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return unescapeQuoted(value);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  // JsonTextReader.ParseValue (2791 @ 0x1861B9FC0) accepts these bare
  // literals. CreateValueInternal boxes the floats and reads undefined as null.
  if (value === "null" || value === "undefined") return null;
  if (value === "NaN" || value === "Infinity" || value === "-Infinity")
    return Number(value);
  // 2791 JsonTextReader.ParseNumber @ 0x1861B7F50 reads hex and
  // leading-zero integers as base 16 and 8, with signed Int64 results.
  const integerLiteral = /^0x[0-9a-f]+$/i.test(value)
    ? value
    : /^0[0-7]+$/.test(value)
      ? `0o${value.slice(1)}`
      : null;
  if (integerLiteral) {
    const integer = Number(integerLiteral);
    if (Number.isSafeInteger(integer) || typeof BigInt === "undefined")
      return integer;
    const exact = BigInt(integerLiteral);
    if (exact === BigInt.asUintN(64, exact))
      return Number(BigInt.asIntN(64, exact));
  }
  // Preserve the boxed value type produced by Newtonsoft for GetInt/GetEnum.
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
    return Number(value);
  return value;
}

function parseArgs(raw: string): StoryCommandArgs {
  const args: StoryCommandArgs = {};
  for (const { commaTerminated, part } of splitArgs(raw)) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    // ParseValue (2791 @ 0x1861B9FC0) and ParsePostValue (0x1861B9170)
    // skip NUL and Char.IsWhiteSpace, including NEL outside quoted values.
    const value = part
      .slice(separator + 1)
      .replace(/^[\s\u0085\0]+|[\s\u0085\0]+$/g, "");
    // JsonTextReader.ParseValue (2791 @ 0x1861B9FC0) emits Undefined for a
    // comma in value position, just as it does for the undefined literal.
    if (key)
      args[key] = commaTerminated && value === "" ? null : parseValue(value);
  }
  return args;
}

function parseDialogueSpeaker(inner: string): string | null {
  const match = inner.match(dialogueInnerRegex);
  return match ? unescapeQuoted(`"${match[1]}"`) : null;
}

export function parseLine(raw: string, lineNumber = 1): ParsedLine {
  const match = raw.match(commandRegex);
  if (match) {
    const parenthesizedName = match[1];
    const parenthesizedArgs = match[2];
    const bareName = match[3];
    const bareFallback = match[4];
    const content = match[5] ?? "";
    const speaker = bareFallback
      ? parseDialogueSpeaker(bareFallback.trim())
      : null;

    if (speaker !== null) {
      const dialogue: ParsedDialogueLine = {
        kind: "dialogue",
        lineNumber,
        raw,
        speaker,
        text: content,
      };
      return dialogue;
    }

    // When neither the parenthesized nor the bare name group matches, _ParseCommand
    // falls back to the sentinel "dialog" -- the same key DialogPanel registers
    // _ExecuteDialog under. `[imagegroup=...]` and friends are dialog commands
    // carrying params, not unregistered commands.
    const command = (bareName || parenthesizedName || "dialog")
      .trim()
      .toLowerCase();
    if (command) {
      return {
        args: parseArgs(parenthesizedArgs ?? bareFallback ?? ""),
        command,
        content,
        kind: "command",
        lineNumber,
        paramPresent: parenthesizedArgs !== undefined || Boolean(bareFallback),
        raw,
        trailingText: content,
      };
    }
  }

  return {
    kind: "narration",
    lineNumber,
    raw,
    text: raw,
  };
}

interface LogicalLine {
  lineNumber: number;
  raw: string;
}

/**
 * Native provenance: `Torappu.AVG.AVGParser._ReadNextBlock` and
 * `Torappu.AVG.AVGParser.TryParse(string, List<Command>)`.
 *
 * Ports backslash continuation, comment/blank-line filtering, and physical
 * first-line numbering. The web parser intentionally keeps its own lightweight
 * argument parser rather than embedding Json.NET's complete error surface.
 *
 */
function logicalLines(source: string | readonly string[]): LogicalLine[] {
  const physicalLines =
    typeof source === "string"
      ? source.replace(/\r\n?/g, "\n").split("\n")
      : [...source];
  const output: LogicalLine[] = [];

  for (let index = 0; index < physicalLines.length; index += 1) {
    const lineNumber = index + 1;
    let raw = physicalLines[index] ?? "";
    while (raw.endsWith("\\") && index + 1 < physicalLines.length) {
      raw = raw.slice(0, -1) + (physicalLines[index + 1] ?? "");
      index += 1;
    }
    if (!raw || /^\s+$/.test(raw) || /^\s*\/\//.test(raw)) continue;
    output.push({ lineNumber, raw });
  }
  return output;
}

export function parseScript(source: string | readonly string[]): ParsedLine[] {
  const sourceLines = logicalLines(source);
  const lines = sourceLines.map((line) => parseLine(line.raw, line.lineNumber));
  const last = lines.at(-1);
  if (!(last?.kind === "command" && last.command === "endtip")) {
    const lineNumber = sourceLines.at(-1)?.lineNumber ?? 1;
    // Native provenance: `Torappu.AVG.AVGParser.TryParse(string, List<Command>)`
    // (2.7.61: 0x183E7E450, plus the extracted `_AppendEndTip` 0x183E7EA10;
    // 2.7.81: TryParse 0x183FFB410, _AppendEndTip 0x183FFB9D0) and
    // `Torappu.AVG.AVGUtils.GenerateEndtipCommand` (2.7.61: 0x183E40F70;
    // 2.7.81: 0x183FA2B40). Native appends when the commands list is non-null
    // and `Count <= 0 || Last(commands).command != "endtip"`, so an EMPTY
    // command list (empty / whitespace-only / comment-only script) also
    // receives the implicit terminal endtip. The generated command leaves
    // `content` null (the executor shows an empty-text dialog) and
    // `lineNumber` at the ctor default 0 — native `Command` does carry a
    // `lineNumber` field (2.7.81 offset 0x28) with 1-based values for parsed
    // commands, so the appended line's `lineNumber` here is a web diagnostic
    // only.
    lines.push({
      args: { block: true },
      command: "endtip",
      content: "",
      kind: "command",
      lineNumber,
      paramPresent: true,
      raw: "[endtip(block=true)]",
      trailingText: "",
    });
  }
  return lines;
}

function metadataValue(
  args: StoryCommandArgs,
  key: string,
): StoryCommandValue | undefined {
  return args[key];
}

// Native provenance: `Torappu.AVG.AVGController.FitMode` and
// `Torappu.UI.CharacterSortType` member values. HEADER parses both fields
// through `DotNetExtensionMethods.GetEnum<T>` ->
// `Enum.Parse(typeof(T), s, ignoreCase: true)`, which resolves purely numeric
// literals by enum *value*: `fit_mode=1` is BLACK_MASK and `char_sort_type = 5`
// is BY_GAIN_TIME_DOWN. The bare-number form really occurs in guide stories
// (e.g. obt/guide/l0-6/0_upgrade_skill.txt:1).
enum FitMode {
  DEFAULT = 0,
  BLACK_MASK = 1,
}

enum CharacterSortType {
  BY_LEVEL_UP = 0,
  BY_LEVEL_DOWN = 1,
  BY_RARITY_UP = 2,
  BY_RARITY_DOWN = 3,
  BY_GAIN_TIME_UP = 4,
  BY_GAIN_TIME_DOWN = 5,
  BY_NAME_UP = 6,
  BY_NAME_DOWN = 7,
  BY_COST_UP = 8,
  BY_COST_DOWN = 9,
  BY_HP_UP = 10,
  BY_HP_DOWN = 11,
  BY_ATK_UP = 12,
  BY_ATK_DOWN = 13,
  BY_DEF_UP = 14,
  BY_DEF_DOWN = 15,
  BY_RES_UP = 16,
  BY_RES_DOWN = 17,
  BY_FAVOR_UP = 18,
  BY_FAVOR_DOWN = 19,
  BY_RESPAWN_UP = 20,
  BY_RESPAWN_DOWN = 21,
  BY_BLOCKNUM_UP = 22,
  BY_BLOCKNUM_DOWN = 23,
  BY_ATKSPEED_UP = 24,
  BY_ATKSPEED_DOWN = 25,
  BY_HANDBOOKSTAGE_UP = 26,
  BY_HANDBOOKSTAGE_DOWN = 27,
}

export function parseStory(source: string | readonly string[]): {
  lines: ParsedLine[];
  metadata: StoryMetadata;
} {
  const lines = parseScript(source);
  const first = lines[0];
  const header =
    first?.kind === "command" && first.command === "header" ? first : undefined;
  // Native provenance: `GetEnum<FitMode>(header.param, "fit_mode", DEFAULT,
  // ignoreCase: true)` and `GetEnum<CharacterSortType>(header.param,
  // "char_sort_type", BY_GAIN_TIME_DOWN, true)` in `AVGParser.TryParse(String,
  // StoryParam, Story&)` -- numeric literals resolve by enum value and
  // unparseable values fall back to the default.
  const fitMode = tryParseEnum(
    boxedParamString(header?.args.fit_mode),
    FitMode,
    true,
  );
  const sortType = tryParseEnum(
    boxedParamString(header?.args.char_sort_type),
    CharacterSortType,
    true,
  );
  const isTutorial = metadataValue(header?.args ?? {}, "is_tutorial") === true;
  const isVideoOnly =
    metadataValue(header?.args ?? {}, "is_video_only") === true;
  const autoable = metadataValue(header?.args ?? {}, "is_autoable");
  const skippable = metadataValue(header?.args ?? {}, "is_skippable");
  return {
    lines,
    metadata: {
      args: header?.args ?? {},
      // The metadata view exposes a name, so unnamed sort ordinals use its default.
      characterSortType:
        CharacterSortType[sortType ?? CharacterSortType.BY_GAIN_TIME_DOWN] ??
        "BY_GAIN_TIME_DOWN",
      denyAutoSwitchScene:
        metadataValue(header?.args ?? {}, "deny_auto_switch_scene") === true,
      dontClearGameObjectPoolOnStart:
        metadataValue(
          header?.args ?? {},
          "dont_clear_gameobjectpool_onstart",
        ) === true,
      fitMode: fitMode === FitMode.BLACK_MASK ? "BLACK_MASK" : "DEFAULT",
      // Native provenance: `Torappu.AVG.AVGParser.TryParse(string, StoryParam,
      // out Story)`. Ports the HEADER-to-Story metadata mapping: the story id
      // comes from `key`, rather than the unrelated `id` parameter name.
      id: String(metadataValue(header?.args ?? {}, "key") ?? ""),
      isAutoable:
        typeof autoable === "boolean" ? autoable : !isTutorial && !isVideoOnly,
      isSkippable: typeof skippable === "boolean" ? skippable : !isTutorial,
      isTutorial,
      isVideoOnly,
      title: header?.content ?? "",
    },
  };
}
