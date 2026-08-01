export interface RichChar {
  char: string;
  color: string | null;
}

const COLOR_TAG_RE = /<color=(#[^>]+)>([\s\S]*?)<\/color>/gi;

export function parseRichChars(text: string): RichChar[] {
  const re = new RegExp(COLOR_TAG_RE.source, COLOR_TAG_RE.flags);
  const chars: RichChar[] = [];
  let lastIndex = 0;
  let match = re.exec(text);
  while (match !== null) {
    const plain = text.slice(lastIndex, match.index);
    for (const char of plain) {
      chars.push({ char, color: null });
    }
    const color = match[1];
    for (const char of match[2]) {
      chars.push({ char, color });
    }
    lastIndex = match.index + match[0].length;
    match = re.exec(text);
  }
  const remaining = text.slice(lastIndex);
  for (const char of remaining) {
    chars.push({ char, color: null });
  }
  return chars;
}

export function collectColors(chars: RichChar[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const { color } of chars) {
    if (color != null && !seen.has(color)) {
      seen.add(color);
      result.push(color);
    }
  }
  return result;
}

function colorTagName(color: string): string {
  return `_c${color.replace("#", "")}`;
}

export function richCharsToTaggedText(chars: RichChar[]): string {
  if (chars.length === 0) return "";

  const parts: string[] = [];
  let currentColor: string | null = null;

  for (const { char, color } of chars) {
    if (color !== currentColor) {
      if (currentColor !== null) parts.push(`</${colorTagName(currentColor)}>`);
      if (color !== null) parts.push(`<${colorTagName(color)}>`);
      currentColor = color;
    }
    parts.push(char);
  }
  if (currentColor !== null) parts.push(`</${colorTagName(currentColor)}>`);

  return parts.join("");
}

export function buildTagStyles(
  colors: string[],
): Record<string, { fill: string }> {
  const styles: Record<string, { fill: string }> = {};
  for (const color of colors) {
    styles[colorTagName(color)] = { fill: color };
  }
  return styles;
}
