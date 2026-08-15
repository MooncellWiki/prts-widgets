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

function splitArgs(raw: string): string[] {
  const output: string[] = [];
  let current = "";
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const char of raw) {
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
      if (current.trim()) output.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) output.push(current.trim());
  return output;
}

function unescapeQuoted(value: string): string {
  const quote = value[0];
  const body = value.slice(1, -1);
  return body.replace(/\\(.)/g, (_match, escaped: string) => {
    if (escaped === "n") return "\n";
    if (escaped === "r") return "\r";
    if (escaped === "t") return "\t";
    if (escaped === quote || escaped === "\\") return escaped;
    return `\\${escaped}`;
  });
}

function parseValue(raw: string): StoryCommandValue {
  const value = raw.trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    return unescapeQuoted(value);
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseArgs(raw: string): StoryCommandArgs {
  const args: StoryCommandArgs = {};
  for (const part of splitArgs(raw)) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    if (key) args[key] = parseValue(part.slice(separator + 1));
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
  if (lines.length > 0) {
    const last = lines.at(-1);
    if (!(last?.kind === "command" && last.command === "endtip")) {
      const lineNumber = sourceLines.at(-1)?.lineNumber ?? 1;
      // Native provenance: `Torappu.AVG.AVGParser.TryParse(string, List<Command>)`
      // and `Torappu.AVG.AVGUtils.GenerateEndtipCommand`. Ports the implicit
      // terminal command for a non-empty script.
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
  }
  return lines;
}

function metadataValue(
  args: StoryCommandArgs,
  key: string,
): StoryCommandValue | undefined {
  return args[key];
}

export function parseStory(source: string | readonly string[]): {
  lines: ParsedLine[];
  metadata: StoryMetadata;
} {
  const lines = parseScript(source);
  const first = lines[0];
  const header =
    first?.kind === "command" && first.command === "header" ? first : undefined;
  const fitMode = String(
    metadataValue(header?.args ?? {}, "fit_mode") ?? "DEFAULT",
  ).toUpperCase();
  const isTutorial = metadataValue(header?.args ?? {}, "is_tutorial") === true;
  const isVideoOnly =
    metadataValue(header?.args ?? {}, "is_video_only") === true;
  const autoable = metadataValue(header?.args ?? {}, "is_autoable");
  const skippable = metadataValue(header?.args ?? {}, "is_skippable");
  return {
    lines,
    metadata: {
      args: header?.args ?? {},
      characterSortType: String(
        metadataValue(header?.args ?? {}, "char_sort_type") ??
          "BY_GAIN_TIME_DOWN",
      ).toUpperCase(),
      denyAutoSwitchScene:
        metadataValue(header?.args ?? {}, "deny_auto_switch_scene") === true,
      dontClearGameObjectPoolOnStart:
        metadataValue(
          header?.args ?? {},
          "dont_clear_gameobjectpool_onstart",
        ) === true,
      fitMode: fitMode === "BLACK_MASK" ? "BLACK_MASK" : "DEFAULT",
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
