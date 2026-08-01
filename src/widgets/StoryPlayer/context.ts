import { resolveAssetUrl } from "./engine/asset";
import { parseStory } from "./engine/parser";

import type { StoryLinkNode, StoryMetadata } from "./engine/types";

const RAW_ASSET_BASE = "https://torappu.prts.wiki/assets";
const STORY_BASE = "https://torappu.prts.wiki/gamedata/latest/story";

export interface Context {
  script: readonly string[];
  scriptText?: string;
  storyMetadata?: StoryMetadata;
  audioVariables?: Record<string, unknown>;
  charMap?: Record<string, string>; // Legacy fallback. New rendering path reads from linkMap(character.json).
  linkMap: Record<string, StoryLinkNode>;
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

function normalizeStoryScriptPath(storyPath: string): string {
  return storyPath
    .trim()
    .replace(/^\/?story\//, "")
    .replace(/^\/+/, "");
}

function normalizeCharacterMap(raw: unknown): Record<string, StoryLinkNode> {
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

      if (group === -1) {
        array.push({
          alias,
          group: -1,
          image: typeof item.image === "string" ? item.image : name,
          name,
        });
        continue;
      }

      if (typeof item.face === "string") {
        array.push({
          alias,
          face: item.face,
          group,
          name,
        });
        continue;
      }

      if (typeof item.image === "string") {
        array.push({
          alias,
          group: -1,
          image: item.image,
          name,
        });
      }
    }

    output[base] = {
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

export async function fetchStoryScriptByPath(
  storyPath: string,
): Promise<string> {
  const normalizedPath = normalizeStoryScriptPath(storyPath);
  const response = await fetch(storyUrl(`${normalizedPath}.txt`));
  if (!response.ok)
    throw new Error(`failed to fetch story script: ${storyPath}`);

  return response.text();
}

async function fetchStoryCharacterMap(): Promise<
  Record<string, StoryLinkNode>
> {
  const response = await fetch(assetUrl("avg/character.json"));
  if (!response.ok) throw new Error("failed to fetch avg/character.json");

  return normalizeCharacterMap(await response.json());
}

export async function loadContextByPath(storyPath: string): Promise<Context> {
  const [audioVariables, scriptText, linkMap] = await Promise.all([
    ensureStoryVariables(),
    fetchStoryScriptByPath(storyPath),
    fetchStoryCharacterMap(),
  ]);

  return {
    script: scriptText.replace(/\r\n?/g, "\n").split("\n"),
    scriptText,
    storyMetadata: parseStory(scriptText).metadata,
    audioVariables,
    linkMap,
  };
}
