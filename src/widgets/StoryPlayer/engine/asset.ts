import {
  boxedParamString,
  convertStoryParameter,
  exactArg,
  toString,
} from "./commandParams";

import type { StoryCommandArgs } from "./types";

const TORAPPU_ORIGIN = "https://torappu.prts.wiki";

/**
 * Native provenance: `Torappu.ResourceRouter.GetBackgroundPath`, `GetImagePath`,
 * `GetCharacterPath`, `GetItemPath`, `GetMusicPath`, and `GetAudioPath`. The
 * cutin family comes from `CutinController`'s `Cutin/Characters/{name}` route
 * (interlude type=1), not `GetImagePath`.
 *
 * Ports the AVG asset-family routing. HTTP URLs, extension conversion, and URL
 * escaping are web delivery adaptations rather than native behavior.
 *
 */

export type StoryAssetFamily = "background" | "image" | "cutin";

/** _StripResPath in the cutin collector and dialog (2791 @ 0x1841B5960, 0x1815007C0). */
export function cutinPortraitResourceKey(name: string): string {
  return /^[\p{L}\p{Mn}\p{Nd}\p{Pc}]*/u.exec(name)![0];
}

/** ABResourceManager._PreprocessAssetPath (2791 @ 0x183E80A30). */
export function nativeBundleKey(name: string): string {
  return name.toLowerCase().replace(/\.[^./\\:]+$/u, "");
}

const FAMILY_FOLDER: Record<StoryAssetFamily, string> = {
  background: "background",
  image: "images",
  cutin: "cutin",
};

/** Web asset keys are lowercase. Preserve the raw script key for warnings. */
export function normalizeImageKey(rawKey: string): string | null {
  return rawKey.trim().toLowerCase() || null;
}

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function audioUrlFromValue(value: string): string {
  const assetsBase = `${TORAPPU_ORIGIN}/assets/`;
  return `${value.toLowerCase().replace("sound_beta_2", `${assetsBase}audio`)}.mp3`;
}

function normalizeAssetPath(rawPath: string): string {
  return rawPath.trim().replace(/^\/+/, "");
}

export function resolveAssetUrl(raw: string): string {
  return raw;
}

export function resolveStoryAssetByKey(
  rawKey: string,
  family: StoryAssetFamily,
  useBundlePath = family === "cutin",
): string | null {
  const key = useBundlePath
    ? nativeBundleKey(rawKey)
    : normalizeImageKey(rawKey);
  if (!key) return null;

  const resourcePath = useBundlePath ? encodePathSegments(key) : key;
  return `${TORAPPU_ORIGIN}/assets/avg/${FAMILY_FOLDER[family]}/${resourcePath}.png`;
}

export function resolveStoryCharacterAssetByKey(rawKey: string): string | null {
  const key = rawKey.trim();
  if (!key) return null;
  return `${TORAPPU_ORIGIN}/assets/avg/characters/${encodePathSegments(key)}.png`;
}

/** AVGVideoPanel._PlayVideo (2791 @ 0x1841BEC90) branches on key presence. */
export function getStoryVideoSource(
  args: StoryCommandArgs,
): { kind: "url" | "res"; key: string } | null {
  const url = exactArg(args, "url");
  if (url !== undefined) return { kind: "url", key: toString(url) };
  const res = exactArg(args, "res");
  return res === undefined ? null : { kind: "res", key: toString(res) };
}

export function resolveStoryVideoByKey(rawKey: string): string | null {
  const key = normalizeAssetPath(rawKey);
  if (!key) return null;

  if (/^https?:\/\//i.test(key)) return key;

  return `${TORAPPU_ORIGIN}/assets/${encodePathSegments(key.toLowerCase())}`;
}

export function resolveStoryAudioByKey(
  rawKey: string,
  variables?: Record<string, unknown> | null,
): string | null {
  let key = rawKey.trim();
  if (key.startsWith("$")) {
    // AVGVariableConfig.Convert precedes GetString (2791 @ 0x1869417D0).
    const value = convertStoryParameter(key, variables ?? undefined);
    if (value === key) return null;
    key = boxedParamString(value).trim();
  }

  if (!key) return null;
  if (key.startsWith("@")) return `${TORAPPU_ORIGIN}/assets/${key.slice(1)}`;

  if (/^https?:\/\//i.test(key)) return key;

  return audioUrlFromValue(key);
}
