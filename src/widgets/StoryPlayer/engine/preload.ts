import { Assets } from "pixi.js";

import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryAudioByKey,
  resolveStoryCharacterAssetByKey,
} from "./asset";
import { resolveCharacterSelection } from "./characterRef";
import { parseScript } from "./parser";
import { DIALOG_FRAME_URL } from "./renderer";

import type { Context } from "../context";
import type { StoryFaceRect } from "./types";

export interface StoryCharacterFaceAsset {
  baseUrl: string;
  expression: string;
  faceRect: StoryFaceRect;
  faceUrl: string;
  used: boolean;
}

export interface ContextAssetManifest {
  faceAssets: StoryCharacterFaceAsset[];
  urls: string[];
}

function argAsString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function resolveGroupedImageSelection(
  imageGroup: string,
  cgGroup: string,
  isBackgroundCommand: boolean,
): { asBackground: boolean; group: string } | null {
  if (imageGroup)
    return { asBackground: isBackgroundCommand, group: imageGroup };
  if (cgGroup) return { asBackground: false, group: cgGroup };
  return null;
}

function addImageUrl(
  urls: Set<string>,
  rawKey: string,
  asBackground: boolean,
): void {
  const key = rawKey.trim();
  if (!key) return;

  const rawUrl = resolveStoryAssetByKey(key, asBackground);
  if (!rawUrl) return;
  urls.add(resolveAssetUrl(rawUrl));
}

function addAudioUrl(
  urls: Set<string>,
  context: Context,
  rawKey: string,
): void {
  const key = rawKey.trim();
  if (!key) return;

  const rawUrl = resolveStoryAudioByKey(key, context.audioVariables);
  if (!rawUrl) return;
  urls.add(rawUrl);
}

function resolveCharacterUrl(rawKey: string): string | null {
  const key = rawKey.trim();
  if (!key) return null;

  const rawUrl = resolveStoryCharacterAssetByKey(key);
  if (!rawUrl) return null;
  return resolveAssetUrl(rawUrl);
}

function addCharacterUrl(urls: Set<string>, rawKey: string): string | null {
  const url = resolveCharacterUrl(rawKey);
  if (!url) return null;
  urls.add(url);
  return url;
}

/**
 * Native provenance: the active panels' `IContainsResRefs` collectors,
 * including `AVGShowItemPanel.InternalResRefCollector.GatherResRefs`,
 * `AVGCgItemPanel.InternalResRefCollector.GatherResRefs`, and the image /
 * background / character panel collectors.
 *
 * Ports which script commands declare image dependencies. A single eager PIXI
 * batch substitutes for native asset-reference collection and loading.
 *
 */
function addScriptImageUrls(urls: Set<string>, context: Context): void {
  for (const line of parseScript(context.scriptText ?? context.script)) {
    if (line.kind !== "command") continue;

    const image = argAsString(line.args.image);
    if (line.command === "background") {
      addImageUrl(urls, image, true);
      continue;
    }
    if (line.command === "avgdisplay") {
      const rawStyle = argAsString(line.args.style);
      const styleMap: Record<string, string> = { 5: "bg", 7: "character" };
      const style = styleMap[rawStyle] ?? rawStyle;
      const name = argAsString(line.args.name);
      if (style === "bg") addImageUrl(urls, name, true);
      else if (style === "character") addCharacterUrl(urls, name);
      continue;
    }
    if (
      line.command === "image" ||
      line.command === "showitem" ||
      line.command === "cgitem" ||
      line.command === "blocker"
    ) {
      addImageUrl(urls, image, false);
      continue;
    }
    if (line.command === "interlude") {
      const type = argAsString(line.args.type);
      const numericType =
        typeof line.args.type === "number" ? line.args.type : Number(type);
      const name = argAsString(line.args.name);
      if (type === "bg" || numericType === 2) addImageUrl(urls, name, true);
      else if (type === "uichar" || numericType === 1)
        addImageUrl(urls, name, false);
      continue;
    }

    if (
      line.command === "gridbg" ||
      line.command === "verticalbg" ||
      line.command === "largebg" ||
      line.command === "largeimg"
    ) {
      const imageGroup = argAsString(line.args.imagegroup);
      const cgGroup = argAsString(line.args.cggroup);
      const groupSelection = resolveGroupedImageSelection(
        imageGroup,
        cgGroup,
        line.command.endsWith("bg"),
      );
      if (!groupSelection) continue;
      for (const key of groupSelection.group.split("/"))
        addImageUrl(urls, key, groupSelection.asBackground);
    }
  }
}

/**
 * Native provenance: `Torappu.AVG.InternalMusicRefCollector` and
 * `Torappu.AVG.InternalSoundRefCollector.GatherResRefs`.
 *
 * Ports music key/intro and sound key discovery; browser preload timing and
 * progress reporting are web-only behavior.
 *
 */
function addScriptAudioUrls(urls: Set<string>, context: Context): void {
  for (const line of parseScript(context.scriptText ?? context.script)) {
    if (line.kind !== "command") continue;

    if (line.command !== "playmusic" && line.command !== "playsound") continue;

    addAudioUrl(urls, context, argAsString(line.args.key));
    if (line.command === "playmusic")
      addAudioUrl(urls, context, argAsString(line.args.intro));
  }
}

function addCharacterUrls(
  urls: Set<string>,
  context: Context,
): StoryCharacterFaceAsset[] {
  const faceAssets = new Map<string, StoryCharacterFaceAsset>();
  const addFaceGroup = (
    link: Context["linkMap"][string],
    groupIndex: number,
    baseUrl: string,
    usedExpression?: string,
  ): void => {
    const group = link.groups[groupIndex];
    if (group?.mode !== "face_overlay") return;

    for (const candidate of link.array) {
      if (
        candidate.group !== groupIndex ||
        !("face" in candidate) ||
        !candidate.face
      )
        continue;

      const faceUrl = resolveCharacterUrl(candidate.face);
      if (!faceUrl) continue;

      const key = `${baseUrl}\0${faceUrl}\0${group.faceRect.x},${group.faceRect.y},${group.faceRect.w},${group.faceRect.h}`;
      const previous = faceAssets.get(key);
      faceAssets.set(key, {
        baseUrl,
        expression: previous?.expression ?? candidate.name,
        faceRect: group.faceRect,
        faceUrl,
        used: Boolean(previous?.used || candidate.name === usedExpression),
      });
    }
  };

  for (const line of parseScript(context.scriptText ?? context.script)) {
    if (line.kind !== "command") continue;

    const refs: string[] = [];
    if (line.command === "charslot") refs.push(argAsString(line.args.name));
    else if (line.command === "character")
      refs.push(argAsString(line.args.name), argAsString(line.args.name2));
    else if (
      line.command === "interlude" &&
      (line.args.type === 3 || argAsString(line.args.type) === "char")
    )
      refs.push(argAsString(line.args.name));
    else continue;

    for (const nameRef of refs) {
      if (!nameRef) continue;

      const resolved = resolveCharacterSelection(context.linkMap, nameRef);
      if (!resolved) continue;

      const link = context.linkMap[resolved.base];
      if (!link) continue;

      const item = link.array.find(
        (entry) => entry.name === resolved.expression,
      );
      if (!item) continue;

      if (item.group === -1 && "image" in item && item.image) {
        const imageUrl = addCharacterUrl(urls, item.image);
        if (imageUrl) {
          for (const [groupIndex, group] of link.groups.entries()) {
            if (
              group.mode === "face_overlay" &&
              resolveCharacterUrl(group.base) === imageUrl
            )
              addFaceGroup(link, groupIndex, imageUrl);
          }
        }
        continue;
      }

      if (!("face" in item) || !item.face || item.group < 0) continue;

      const group = link.groups[item.group];
      if (group?.mode !== "face_overlay") continue;

      const usedFaceUrl = addCharacterUrl(urls, item.face);
      const baseUrl = addCharacterUrl(urls, group.base);
      if (!usedFaceUrl || !baseUrl) continue;
      addFaceGroup(link, item.group, baseUrl, item.name);
    }
  }

  return [...faceAssets.values()];
}

export function collectContextAssetManifest(
  context: Context,
): ContextAssetManifest {
  const urls = new Set<string>();
  if (context.charMap) {
    for (const rawUrl of Object.values(context.charMap))
      urls.add(resolveAssetUrl(rawUrl));
  }

  const faceAssets = addCharacterUrls(urls, context);

  addScriptAudioUrls(urls, context);
  addScriptImageUrls(urls, context);

  return { faceAssets, urls: [...urls] };
}

export function collectContextAssetUrls(context: Context): string[] {
  return collectContextAssetManifest(context).urls;
}

function collectPreloadAssetUrls(context: Context): string[] {
  const urls = new Set(collectContextAssetUrls(context));

  // 固定 UI 资源（对话框上下黑条纹理），随每次 preload 一起预热进 pixi Assets 缓存，
  // renderer 在 createUi 时再 Assets.load 即可命中缓存。它属于播放器内置资源，
  // 不应出现在面向用户的剧情资源列表中。
  urls.add(DIALOG_FRAME_URL);

  return [...urls];
}

// 路径前缀/大小写核对属于开发期诊断,线上每次播放刷几十条日志只是噪音。
// 资源加载失败仍然照常 warn,那是用户可见问题的线索。
const debugLog: (...args: unknown[]) => void = import.meta.env.DEV
  ? (...args) => console.log(...args)
  : () => {};

export async function preloadContextAssets(
  context: Context,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const urls = collectPreloadAssetUrls(context);
  debugLog(`[preload] ${urls.length} unique asset URL(s) collected`);
  if (urls.length === 0) {
    console.warn(
      "[preload] no assets resolved — script may have no collectable commands or resolvers returned empty",
    );
    onProgress?.(1);
    return;
  }

  // 打印前若干条 URL 便于核对路径前缀和大小写,过长则只展示首尾各几条。
  const preview =
    urls.length <= 8
      ? urls
      : [
          ...urls.slice(0, 5),
          `... (${urls.length - 7} more)`,
          ...urls.slice(-2),
        ];
  for (const [index, url] of preview.entries())
    debugLog(`[preload]   [${index}] ${url}`);

  let lastReported = -1;
  await Assets.load(urls, {
    onProgress: (progress) => {
      const percent = Math.round(progress * 100);
      // 只在整百分比变化时打印,避免 100 条资源刷屏。
      if (percent !== lastReported) {
        lastReported = percent;
        debugLog(
          `[preload] progress ${percent}% (${Math.round(progress * urls.length)}/${urls.length})`,
        );
      }
      onProgress?.(progress);
    },
    onError: (error, url) => {
      const urlStr =
        typeof url === "string"
          ? url
          : ((url as { src?: string })?.src ?? String(url));
      console.warn(
        `[preload] asset failed: ${urlStr}`,
        error?.message ?? error,
      );
    },
  });
  debugLog(`[preload] done: ${urls.length} asset(s) resolved`);
}
