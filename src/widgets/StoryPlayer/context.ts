import {
  getStoryVideoSource,
  resolveAssetUrl,
  resolveStoryVideoByKey,
} from "./engine/asset";
import { parseStory } from "./engine/parser";

import type {
  ParsedLine,
  StoryCharacterEntry,
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
  storyVariables?: Readonly<Record<string, unknown>>;
  charMap?: Record<string, string>; // Legacy fallback. New rendering path reads from linkMap(character.json).
  linkMap: Record<string, StoryLinkNode>;
  /**
   * AVG background key -> sprite pixelsPerUnit. The native background rect is
   * `texture size / ppu * 100` (Image.SetNativeSize), so the renderer needs
   * the ppu to reproduce it. Absent/empty falls back to texture-size
   * heuristics in the renderer.
   */
  backgroundPpuMap?: Record<string, number>;
  /** Foreground sprite pixelsPerUnit from `avg/metadata.json`. */
  imagePpuMap?: Record<string, number>;
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

/** `bodies` only counts as a list of non-negative integers; anything else is dropped. */
function bodySpriteCounts(
  node: Record<string, unknown>,
): Pick<StoryLinkNode, "bodies"> {
  const { bodies } = node;
  if (
    !Array.isArray(bodies) ||
    !bodies.every((count) => Number.isInteger(count) && count >= 0)
  )
    return {};
  return { bodies: bodies as number[] };
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
      ...bodySpriteCounts(node),
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

function variableMaps(storyVariables: Record<string, unknown>) {
  return {
    storyVariables,
    audioVariables: Object.fromEntries(
      Object.entries(storyVariables).map(([key, value]) => [
        key.toLowerCase(),
        value,
      ]),
    ),
  };
}

async function fetchOptionalJsonObject(
  url: string,
): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url);
    return response.ok ? asObject(await response.json()) : null;
  } catch {
    return null;
  }
}

let legacyStoryVariables: Promise<Record<string, unknown> | null> | undefined;

async function fetchLegacyStoryVariables(): Promise<Record<string, unknown>> {
  const pending = (legacyStoryVariables ??= fetchOptionalJsonObject(
    storyUrl("story_variables.json"),
  ));
  const variables = await pending;
  if (!variables && legacyStoryVariables === pending)
    legacyStoryVariables = undefined;
  return { ...variables };
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
 * Validates an AVG sprite sidecar into key -> pixelsPerUnit. Keys are folded
 * lowercase (the pipeline emits the lowercase bundle container names, but the
 * fold keeps hand-edited or future variants honest); non-finite or
 * non-positive values are dropped.
 */
export function normalizeSpritePpuMap(raw: unknown): Record<string, number> {
  const root = asObject(raw);
  if (!root) return {};

  const output: Record<string, number> = {};
  for (const [key, value] of Object.entries(root)) {
    const ppu = toNumber(value, Number.NaN);
    if (Number.isFinite(ppu) && ppu > 0) output[key.toLowerCase()] = ppu;
  }

  return output;
}

async function fetchStoryAssetMetadata() {
  const metadata = await fetchOptionalJsonObject(assetUrl("avg/metadata.json"));
  const variables = asObject(metadata?.storyVariables);
  const background = asObject(metadata?.backgroundPpuMap);
  const images = asObject(metadata?.imagePpuMap);
  if (variables && background && images) {
    return {
      ...variableMaps(variables),
      backgroundPpuMap: normalizeSpritePpuMap(background),
      imagePpuMap: normalizeSpritePpuMap(images),
    };
  }

  // Older Torappu deployments expose the variables and background PPU separately.
  const [legacyVariables, legacyBackground] = await Promise.all([
    fetchLegacyStoryVariables(),
    fetchOptionalJsonObject(assetUrl("avg/background.json")),
  ]);
  return {
    ...variableMaps(legacyVariables),
    backgroundPpuMap: normalizeSpritePpuMap(legacyBackground),
    imagePpuMap: {},
  };
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
 * `VideoManager.CheckVideoExist` (2791 @ 0x183E60170), i.e.
 * `RawResManager.CheckExist(TreatVideoPath(res))` where `TreatVideoPath`
 * swaps `.mp4` for `.usm`. Native answers synchronously from the local raw-res
 * manifest. The Web HEAD-probes each `res` once while the context loads
 * (the CDN serves the mp4 transcode) and VideoPanel does a set lookup.
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
    const source = getStoryVideoSource(line.args);
    if (source?.kind !== "res") continue;
    const resolved = resolveStoryVideoByKey(source.key);
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
  const [assetMetadata, linkMap, missingVideoUrls] = await Promise.all([
    fetchStoryAssetMetadata(),
    fetchStoryCharacterMap(),
    findMissingVideoUrls(lines, metadata),
  ]);

  return {
    script: scriptText.replace(/\r\n?/g, "\n").split("\n"),
    scriptText,
    storyMetadata: metadata,
    ...assetMetadata,
    linkMap,
    missingVideoUrls,
  };
}
