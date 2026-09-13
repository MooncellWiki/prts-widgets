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

const FAMILY_FOLDER: Record<StoryAssetFamily, string> = {
  background: "background",
  image: "images",
  cutin: "cutin",
};

function normalizeImageKey(rawKey: string): string {
  return rawKey.trim().toLowerCase();
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
): string | null {
  const key = normalizeImageKey(rawKey);
  if (!key) return null;

  return `${TORAPPU_ORIGIN}/assets/avg/${FAMILY_FOLDER[family]}/${key}.png`;
}

export function resolveStoryCharacterAssetByKey(rawKey: string): string | null {
  const key = rawKey.trim();
  if (!key) return null;
  return `${TORAPPU_ORIGIN}/assets/avg/characters/${encodePathSegments(key)}.png`;
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
  const key = rawKey.trim();
  if (!key) return null;

  if (key.startsWith("$")) {
    if (!variables) return null;

    const variableKey = key.slice(1).toLowerCase();
    const variableValue = variables[variableKey];
    if (typeof variableValue !== "string") return null;
    return audioUrlFromValue(variableValue);
  }

  if (key.startsWith("@")) return `${TORAPPU_ORIGIN}/assets/${key.slice(1)}`;

  if (/^https?:\/\//i.test(key)) return key;

  return audioUrlFromValue(key);
}
