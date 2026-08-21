import type { StoryLinkNode } from "./types";

/**
 * Native provenance: `Torappu.AVG.AVGCharacterSlot._LoadImage` and the three
 * private helpers it inlines -- `_TryParseBody` (`$`), `_TryParseAlias` (`@`)
 * and `_TryParseIndex` (`#`).
 *
 * The native parse is three independent right-to-left strips, each a
 * `LastIndexOf` + `Substring` + `Int32.TryParse`. That shape is not expressible
 * as one anchored regex: a regex alternation can only carry a single suffix in
 * a fixed order, so forms like `name@alias$1` (both suffixes) or an index that
 * overflows Int32 silently fall out of it. Porting the loop directly removes
 * that whole class of divergence.
 *
 * Mapping the parsed (group, index) pair onto `character.json` entries is a web
 * asset-pipeline adaptation -- native indexes into the AB's sprite arrays.
 */
export interface NativeCharacterRef {
  /** Native keeps the leading `@`; `_TryParseAlias` uses `Substring(idx)`. */
  alias: string | null;
  base: string;
  /** 0-based, `null` when no `$N` suffix parsed. */
  group: number | null;
  /** 0-based, defaults to 0. */
  index: number;
}

export interface CharacterRefSelection {
  base: string;
  expression: string;
}

/**
 * Port of `AVGCharacterSlot._GetIdWithoutAliasOrIndex`.
 *
 * This is deliberately not the resource base returned by
 * `parseNativeCharacterRef`: native strips the last `@` first, otherwise the
 * last `#`, but leaves a standalone `$body` suffix in place. `Set` compares
 * this value when deciding whether `dontFadeIfSameChar` suppresses a fade.
 */
export function nativeCharacterFadeIdentity(ref: string): string {
  const alias = ref.lastIndexOf("@");
  if (alias !== -1) return ref.slice(0, alias);

  const index = ref.lastIndexOf("#");
  if (index === -1) return ref;
  return ref.slice(0, index);
}

/** `System.Number.IsWhite`: 0x20 and 0x09..0x0D only -- no NBSP, no U+3000. */
function isDotNetWhite(text: string, at: number): boolean {
  const code = text.codePointAt(at) ?? -1;
  return code === 0x20 || (code >= 0x09 && code <= 0x0d);
}

/**
 * `System.Int32.TryParse(String, out Int32)`, i.e. `NumberStyles.Integer` =
 * `AllowLeadingWhite | AllowTrailingWhite | AllowLeadingSign`. Returns `null`
 * where the BCL returns false, which includes Int32 overflow.
 *
 * The whitespace tolerance is not incidental: it is what absorbs authoring
 * typos like `avg_4236_tmslot_1#3 $1` in native, so the port has to keep it.
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
  if (value < -2147483648 || value > 2147483647) return null;
  return value;
}

/**
 * Port of the `_LoadImage` suffix parse. Deliberately does not trim: native
 * does not either, and every trailing space observed in the story corpus sits
 * inside a numeric suffix where `Int32.TryParse` already absorbs it.
 */
export function parseNativeCharacterRef(
  ref: string,
): NativeCharacterRef | null {
  if (!ref) return null;

  let value = ref;

  // _TryParseBody -- `$N` carries the group and is stripped first.
  let group: number | null = null;
  const dollar = value.lastIndexOf("$");
  if (dollar !== -1) {
    const parsed = tryParseInt32(value.slice(dollar + 1));
    if (parsed !== null) {
      group = parsed - 1;
      value = value.slice(0, dollar);
    }
  }

  // _TryParseAlias -- an alias short-circuits the index parse entirely.
  const at = value.lastIndexOf("@");
  if (at !== -1) {
    return {
      alias: value.slice(at),
      base: value.slice(0, at),
      group,
      index: 0,
    };
  }

  // _TryParseIndex -- a `#N` that fails to parse is left on the base.
  let index = 0;
  const hash = value.lastIndexOf("#");
  if (hash !== -1) {
    const parsed = tryParseInt32(value.slice(hash + 1));
    if (parsed !== null) {
      index = parsed - 1;
      value = value.slice(0, hash);
    }
  }

  return { alias: null, base: value, group, index };
}

/**
 * Resolves a story character reference against the `character.json` link map.
 *
 * Case folding stands in for native's resource layer: `_LoadImage` preserves
 * case, but `ABResourceManager._PreprocessAssetPath` lowercases the whole path
 * before the bundle lookup and every `avg/characters/*.ab` entry is lowercase,
 * so the effective native semantics are case-insensitive.
 */
export function resolveCharacterSelection(
  linkMap: Record<string, StoryLinkNode>,
  rawRef: string,
): CharacterRefSelection | null {
  if (!rawRef) return null;
  const normalized = rawRef.toLowerCase();

  const directLink = linkMap[normalized];
  if (directLink?.array[0]?.name)
    return { base: normalized, expression: directLink.array[0].name };

  // Web-only form: `base-expression` names an entry outright. Native has no
  // such syntax; it is kept for scripts authored against the wiki player.
  for (const [base, link] of Object.entries(linkMap)) {
    const prefix = `${base}-`;
    if (!normalized.startsWith(prefix)) continue;

    const expression = normalized.slice(prefix.length);
    if (!expression) continue;

    const found = link.array.find(
      (item) => item.name.toLowerCase() === expression,
    );
    if (found) return { base, expression: found.name };
  }

  const parsed = parseNativeCharacterRef(normalized);
  if (!parsed) return null;

  const link = linkMap[parsed.base];
  if (!link) return null;

  if (parsed.alias !== null) {
    // Deviation from native, on purpose. `_TryParseAlias` keeps the leading
    // `@`, and AVGCharacterSpriteHub.SetImage compares that `@`-prefixed string
    // against SpriteConfig.alias with ordinal equality -- but the stored
    // aliases carry no `@` ("angry", "QAQ", ...), so native always misses and
    // falls back to sprites[0] with "[AVG] No alias {0} for character holder
    // {1}, use default instead.". Matching the alias is more useful than
    // reproducing that, and no story in the corpus uses the `@` form at all.
    const wanted = parsed.alias.slice(1);
    const found = link.array.find(
      (item) => String(item.alias).toLowerCase() === wanted,
    );
    const expression = found?.name ?? link.array[0]?.name;
    return expression ? { base: parsed.base, expression } : null;
  }

  if (parsed.group !== null) {
    const suffix = `$${parsed.group + 1}`;
    const grouped = link.array.filter((entry) => entry.name.endsWith(suffix));
    if (grouped.length === 0) return null;
    const picked = grouped[Math.max(0, parsed.index)] ?? grouped[0];
    return picked?.name ? { base: parsed.base, expression: picked.name } : null;
  }

  const entry = link.array[Math.max(0, parsed.index)] ?? link.array[0];
  return entry?.name ? { base: parsed.base, expression: entry.name } : null;
}
