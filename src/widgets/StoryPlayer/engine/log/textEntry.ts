import { parseRichChars } from "../richtext";
import { expandStoryText } from "../textVariables";

import type { LogLineEntry, LogLineSource, LogTextSpan } from "./types";

/** 把含 <color> / <b> / <i> 的富文本拆成连续同样式的 span */
export function toSpans(
  text: string,
  variables: Record<string, unknown>,
): LogTextSpan[] {
  const chars = parseRichChars(expandStoryText(text, variables));
  const spans: LogTextSpan[] = [];
  let current: LogTextSpan | null = null;

  for (const { bold, char, color, italic } of chars) {
    if (
      !current ||
      current.color !== color ||
      Boolean(current.bold) !== bold ||
      Boolean(current.italic) !== italic
    ) {
      current = { text: "", color };
      if (bold) current.bold = true;
      if (italic) current.italic = true;
      spans.push(current);
    }
    current.text += char;
  }
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
    .map(
      (span) =>
        `${span.color ?? ""}${span.bold ? "b" : ""}${span.italic ? "i" : ""}\u{3}${span.text}`,
    )
    .join("\u{1}");
  return `${entry.lineIndex}\u{2}${entry.speaker}\u{2}${entry.source}\u{2}${spans}`;
}
