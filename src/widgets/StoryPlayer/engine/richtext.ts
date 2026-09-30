export interface RichChar {
  char: string;
  color: string | null;
  bold: boolean;
  italic: boolean;
}

/** PIXI `tagStyles` entries emitted for rich-text runs. */
export interface RichTagStyle {
  fill?: string;
  fontStyle?: "italic";
  fontWeight?: "bold";
}

export type RichTagStyles = Record<string, RichTagStyle>;

type RichTagKind = "b" | "color" | "i";

interface RichTag {
  close: boolean;
  end: number;
  kind: RichTagKind;
  start: number;
  value: string | null;
}

// `<b>`, `<i>`, `<color=#…>` and their closers; any other markup is text.
const RICH_TAG_RE = /<(?:(b|i)|color=(#[^<>]+)|\/(b|i|color))>/gi;

function scanRichTags(text: string): RichTag[] {
  return [...text.matchAll(RICH_TAG_RE)].map((match) => {
    const [raw, styleOpen, colorValue, closeKind] = match;
    return {
      close: closeKind !== undefined,
      end: match.index + raw.length,
      kind: (styleOpen ?? closeKind ?? "color").toLowerCase() as RichTagKind,
      start: match.index,
      value: colorValue ?? null,
    };
  });
}

/**
 * Native provenance: every AVG Text (panel_dialog text_message / text_name,
 * panel_decision options, panel_subtitle, sticker_text, timer_sticker_text,
 * spellsticker) serializes `m_RichText` 1, so Unity's rich text renders
 * `<b>`, `<i>` and `<color>` spans instead of showing the tags.
 * `AVGTypeWriterText._GetTextMessageGenerator` (2.7.71 VA 0x183f9fc30) skips
 * every `<…>` without spending a typing step, so tags are zero-width here.
 *
 * Web adaptation scope: `<b>`, `<i>` and `<color=#hex>`, which is every tag
 * the story corpus uses (525 `<i>`, 410 `<color=#RRGGBB>`, 1 `<b>`; no
 * `<size>`, `<material>`, `<quad>` or named colors). Spans nest; a closer
 * pairs with the nearest open tag of its kind, and a tag left unpaired stays
 * literal text. The corpus has no unpaired or crossed tags.
 */
export function parseRichChars(text: string): RichChar[] {
  const tags = scanRichTags(text);

  // Pair closers with the nearest open tag of the same kind.
  const paired = new Set<RichTag>();
  const open: RichTag[] = [];
  for (const tag of tags) {
    if (!tag.close) {
      open.push(tag);
      continue;
    }
    for (let index = open.length - 1; index >= 0; index -= 1) {
      if (open[index]!.kind !== tag.kind) continue;
      paired.add(open[index]!).add(tag);
      open.splice(index, 1);
      break;
    }
  }

  const chars: RichChar[] = [];
  const active: RichTag[] = [];
  const pushText = (segment: string): void => {
    const color = active.findLast((tag) => tag.kind === "color")?.value ?? null;
    const bold = active.some((tag) => tag.kind === "b");
    const italic = active.some((tag) => tag.kind === "i");
    for (const char of segment) chars.push({ bold, char, color, italic });
  };

  let cursor = 0;
  for (const tag of tags) {
    if (!paired.has(tag)) continue;
    pushText(text.slice(cursor, tag.start));
    cursor = tag.end;
    if (!tag.close) {
      active.push(tag);
      continue;
    }
    const index = active.findLastIndex((item) => item.kind === tag.kind);
    active.splice(index, 1);
  }
  pushText(text.slice(cursor));
  return chars;
}

export function colorTagName(color: string): string {
  return `_c${color.replace("#", "")}`;
}

const BOLD_TAG = "_b";
const ITALIC_TAG = "_i";

function runTags({ bold, color, italic }: RichChar): string[] {
  const tags: string[] = [];
  if (bold) tags.push(BOLD_TAG);
  if (italic) tags.push(ITALIC_TAG);
  if (color !== null) tags.push(colorTagName(color));
  return tags;
}

/**
 * Serializes chars as PIXI tagged text: each run of identical style is wrapped
 * in nested `_b` / `_i` / color tags (PIXI merges nested tag styles), so the
 * output of any prefix is balanced, like the closers native appends while
 * typing.
 */
export function richCharsToTaggedText(chars: RichChar[]): string {
  const parts: string[] = [];
  let runKey: string | null = null;
  let runClosers = "";

  for (const char of chars) {
    const tags = runTags(char);
    const key = tags.join(" ");
    if (key !== runKey) {
      parts.push(runClosers);
      parts.push(tags.map((tag) => `<${tag}>`).join(""));
      runClosers = tags
        .toReversed()
        .map((tag) => `</${tag}>`)
        .join("");
      runKey = key;
    }
    parts.push(char.char);
  }
  parts.push(runClosers);

  return parts.join("");
}

/** The `tagStyles` needed by `richCharsToTaggedText(chars)`; empty if none. */
export function buildTagStyles(chars: RichChar[]): RichTagStyles {
  const styles: RichTagStyles = {};
  for (const { bold, color, italic } of chars) {
    if (bold) styles[BOLD_TAG] = { fontWeight: "bold" };
    if (italic) styles[ITALIC_TAG] = { fontStyle: "italic" };
    if (color !== null) styles[colorTagName(color)] = { fill: color };
  }
  return styles;
}
