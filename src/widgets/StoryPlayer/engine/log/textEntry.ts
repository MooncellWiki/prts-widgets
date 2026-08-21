import { parseRichChars } from "../richtext";
import { expandStoryText } from "../textVariables";

import type { LogLineEntry, LogLineSource, LogTextSpan } from "./types";

/** 把含 <color=#xxx>...</color> 的文本拆成连续同色的 span */
export function toSpans(
  text: string,
  variables: Record<string, unknown>,
): LogTextSpan[] {
  const chars = parseRichChars(expandStoryText(text, variables));
  if (chars.length === 0) return [];

  const spans: LogTextSpan[] = [];
  let buffer = "";
  let currentColor: string | null = null;

  const flush = (): void => {
    if (buffer) {
      spans.push({ text: buffer, color: currentColor });
      buffer = "";
    }
  };

  for (const { char, color } of chars) {
    if (color !== currentColor) {
      flush();
      currentColor = color;
    }
    buffer += char;
  }
  flush();
  return spans;
}

export function buildLineEntry(
  lineIndex: number,
  speaker: string,
  text: string,
  source: LogLineSource,
  variables: Record<string, unknown>,
): LogLineEntry {
  return {
    lineIndex,
    speaker: expandStoryText(speaker, variables),
    spans: toSpans(text, variables),
    source,
  };
}

/** entry 的内容身份：同一行在不同路径上只有内容相同才允许合并 audience */
export function entryContentKey(entry: LogLineEntry): string {
  const spans = entry.spans
    .map((span) => `${span.color ?? ""}${span.text}`)
    .join("\u{1}");
  return `${entry.lineIndex}\u{2}${entry.speaker}\u{2}${entry.source}\u{2}${spans}`;
}
