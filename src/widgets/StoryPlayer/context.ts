import { resolveAssetUrl, resolveStoryVideoByKey } from "./engine/asset";
import { parseStory } from "./engine/parser";

import type {
  ParsedLine,
  StoryCharacterEntry,
  StoryCommandArgs,
  StoryLinkNode,
  StoryMetadata,
} from "./engine/types";

const RAW_ASSET_BASE = "https://torappu.prts.wiki/assets";
const STORY_BASE = "https://torappu.prts.wiki/gamedata/latest/story";

export interface Context {
  script: readonly string[];
  scriptText?: string;
  storyMetadata?: StoryMetadata;
  audioVariables?: Record<string, unknown>;
  charMap?: Record<string, string>; // Legacy fallback. New rendering path reads from linkMap(character.json).
  linkMap: Record<string, StoryLinkNode>;
  /**
   * AVG background key -> sprite pixelsPerUnit, from `avg/background.json`
   * (same sidecar family as character.json). The native background rect is
   * `texture size / ppu * 100` (Image.SetNativeSize), so the renderer needs
   * the ppu to reproduce it. Absent/empty falls back to texture-size
   * heuristics in the renderer.
   */
  backgroundPpuMap?: Record<string, number>;
  /**
   * Resolved `video(res=...)` URLs the CDN definitively reported missing; see
   * `findMissingVideoUrls`. Absent/empty means every video is attempted.
   */
  missingVideoUrls?: ReadonlySet<string>;
}

function assetUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return resolveAssetUrl(`${RAW_ASSET_BASE}/${normalized}`);
}

function storyUrl(path: string): string {
  const normalized = path.replace(/^\/+/, "");
  return `${STORY_BASE}/${normalized}`;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value))
    return Number(value);
  return fallback;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** `body`/`index` only count as a pair of integers; older exports have neither. */
function nativeSlot(
  item: Record<string, unknown>,
): Pick<StoryCharacterEntry, "body" | "index"> {
  const { body, index } = item;
  if (!Number.isInteger(body) || !Number.isInteger(index)) return {};
  return { body: body as number, index: index as number };
}

export function normalizeCharacterMap(
  raw: unknown,
): Record<string, StoryLinkNode> {
  const root = asObject(raw);
  if (!root) return {};

  const output: Record<string, StoryLinkNode> = {};

  for (const [base, rawNode] of Object.entries(root)) {
    const node = asObject(rawNode);
    if (!node) continue;

    const posRaw = asObject(node.pos) ?? {};
    const sizeRaw = asObject(node.size) ?? {};

    const groupsRaw = Array.isArray(node.groups) ? node.groups : [];
    const groups: StoryLinkNode["groups"] = groupsRaw.map((rawGroup) => {
      const group = asObject(rawGroup);
      if (!group) return { mode: "single" };

      if (group.mode === "face_overlay" && typeof group.base === "string") {
        const faceRectRaw = asObject(group.faceRect) ?? {};
        return {
          mode: "face_overlay",
          base: group.base,
          faceRect: {
            x: Math.round(toNumber(faceRectRaw.x, 0)),
            y: Math.round(toNumber(faceRectRaw.y, 0)),
            w: Math.round(toNumber(faceRectRaw.w, 0)),
            h: Math.round(toNumber(faceRectRaw.h, 0)),
          },
        };
      }

      return { mode: "single" };
    });

    const arrayRaw = Array.isArray(node.array) ? node.array : [];
    const array: StoryLinkNode["array"] = [];

    for (const rawItem of arrayRaw) {
      const item = asObject(rawItem);
      if (!item || typeof item.name !== "string") continue;

      const name = item.name;
      const alias = typeof item.alias === "string" ? item.alias : "";
      const group = Math.trunc(toNumber(item.group, -1));
      const slot = nativeSlot(item);

      if (group === -1) {
        array.push({
          alias,
          group: -1,
          image: typeof item.image === "string" ? item.image : name,
          name,
          ...slot,
        });
        continue;
      }

      if (typeof item.face === "string") {
        array.push({
          alias,
          face: item.face,
          group,
          name,
          ...slot,
        });
        continue;
      }

      if (typeof item.image === "string") {
        array.push({
          alias,
          group: -1,
          image: item.image,
          name,
          ...slot,
        });
      }
    }

    // Story refs are matched case-insensitively (both resolveCharacterName and
    // resolveCharacterSelection lowercase the ref before looking it up), but
    // character.json keeps each key's original casing and 27 of them carry
    // uppercase -- char_259_Jessica_1, avg_1029_Yato2_1, npc_2004_Alty,
    // avg_6D5_1, char_362_Saga and friends. Without folding the key those
    // characters never resolve: the portrait stays hidden and the asset is
    // never preloaded.
    //
    // Native is case-insensitive here, so folding the key is what actually
    // matches it. _LoadImage and ResourceRouter.GetCharacterPath do preserve
    // case, but Torappu.Resource.AB.ABResourceManager._PreprocessAssetPath
    // lowercases the whole path before hitting m_assetNameToBundleInfoMap,
    // and all 1779 avg/characters/*.ab entries are already lowercase.
    //
    // Only the map key is folded. `name`, `image` and `face` stay verbatim --
    // they are real asset paths and the renderer matches `entry.name` against
    // the original-cased expression.
    output[base.toLowerCase()] = {
      array,
      groups,
      pos: {
        x: toNumber(posRaw.x, 0),
        y: toNumber(posRaw.y, 0),
      },
      size: {
        x: toNumber(sizeRaw.x, 0),
        y: toNumber(sizeRaw.y, 0),
      },
    };
  }

  return output;
}

const cachedStoryAudioVariables: Record<string, unknown> = {};

function mergeStoryVariables(raw: unknown): void {
  const root = asObject(raw);
  if (!root) return;

  for (const [key, value] of Object.entries(root))
    cachedStoryAudioVariables[key.toLowerCase()] = value;
}

let loadingStoryVariables: Promise<void> | null = null;
let storyVariablesLoaded = false;

async function ensureStoryVariables(): Promise<Record<string, unknown>> {
  if (!storyVariablesLoaded) {
    if (!loadingStoryVariables) {
      loadingStoryVariables = (async () => {
        try {
          const response = await fetch(storyUrl("story_variables.json"));
          if (!response.ok) return;
          mergeStoryVariables(await response.json());
          storyVariablesLoaded = true;
        } catch {
          // Keep runtime resilient: script loading still works without variables.
        } finally {
          loadingStoryVariables = null;
        }
      })();
    }

    await loadingStoryVariables;
  }

  return { ...cachedStoryAudioVariables };
}

/**
 * 把调试入口拿到的用户输入解析成剧情 txt 的完整 URL：完整 http(s) 地址原样
 * 返回，其余按相对 `gamedata/latest/story` 的路径拼接。
 */
export function resolveStoryScriptUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return storyUrl(trimmed);
}

async function fetchStoryCharacterMap(): Promise<
  Record<string, StoryLinkNode>
> {
  const response = await fetch(assetUrl("avg/character.json"));
  if (!response.ok) throw new Error("failed to fetch avg/character.json");

  return normalizeCharacterMap(await response.json());
}

/**
 * Validates `avg/background.json` into key -> pixelsPerUnit. Keys are folded
 * lowercase (the pipeline emits the lowercase bundle container names, but the
 * fold keeps hand-edited or future variants honest); non-finite or
 * non-positive values are dropped.
 */
export function normalizeBackgroundPpuMap(
  raw: unknown,
): Record<string, number> {
  const root = asObject(raw);
  if (!root) return {};

  const output: Record<string, number> = {};
  for (const [key, value] of Object.entries(root)) {
    const ppu = toNumber(value, Number.NaN);
    if (Number.isFinite(ppu) && ppu > 0) output[key.toLowerCase()] = ppu;
  }

  return output;
}

async function fetchBackgroundPpuMap(): Promise<Record<string, number>> {
  try {
    const response = await fetch(assetUrl("avg/background.json"));
    if (!response.ok) return {};
    return normalizeBackgroundPpuMap(await response.json());
  } catch {
    // Missing sidecar is not fatal: the renderer falls back to texture-size
    // heuristics for the background rect.
    return {};
  }
}

/** Same exact-key, string-coercing read as the runtime `video` executor. */
function videoArg(args: StoryCommandArgs, key: "res" | "url"): string {
  const value = Object.prototype.hasOwnProperty.call(args, key)
    ? args[key]
    : undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

async function videoExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: "HEAD" });
    return response.status !== 404 && response.status !== 410;
  } catch {
    return true;
  }
}

/**
 * Native port: `AVGVideoPanel._PlayVideo` gates only the `res` branch on
 * `VideoManager.CheckVideoExist` (2.7.81 VA 0x183C810F0), i.e.
 * `RawResManager.CheckExist(TreatVideoPath(res))` where `TreatVideoPath`
 * swaps `.mp4` for `.usm`. Native answers synchronously from the local raw-res
 * manifest; the web has none, so each `res` the command loop can reach is
 * HEAD-probed once while the context loads (the CDN serves the mp4 transcode,
 * hence the unswapped URL) and the runtime only does a set lookup.
 *
 * Only a definitive 404/410 counts as missing. A probe that cannot decide
 * (network/CORS failure, any other status) leaves the URL to the `<video>`
 * error path. `url` takes priority and is never checked natively, and
 * VIDEO_ONLY stories never enter the command loop, so neither is probed.
 */
export async function findMissingVideoUrls(
  lines: readonly ParsedLine[],
  metadata: StoryMetadata,
): Promise<Set<string>> {
  if (metadata.isVideoOnly) return new Set();

  const urls = new Set<string>();
  for (const line of lines) {
    if (line.kind !== "command" || line.command !== "video") continue;
    if (videoArg(line.args, "url")) continue;
    const resolved = resolveStoryVideoByKey(videoArg(line.args, "res"));
    if (resolved) urls.add(resolved);
  }

  const results = await Promise.all(
    [...urls].map(async (url) => ({ exists: await videoExists(url), url })),
  );
  return new Set(results.filter((r) => !r.exists).map((r) => r.url));
}

export async function loadContextByScript(
  scriptText: string,
): Promise<Context> {
  const { lines, metadata } = parseStory(scriptText);
  const [audioVariables, linkMap, backgroundPpuMap, missingVideoUrls] =
    await Promise.all([
      ensureStoryVariables(),
      fetchStoryCharacterMap(),
      fetchBackgroundPpuMap(),
      findMissingVideoUrls(lines, metadata),
    ]);

  return {
    script: scriptText.replace(/\r\n?/g, "\n").split("\n"),
    scriptText,
    storyMetadata: metadata,
    audioVariables,
    linkMap,
    backgroundPpuMap,
    missingVideoUrls,
  };
}
