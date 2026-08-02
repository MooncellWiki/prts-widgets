import { Assets } from "pixi.js";

import {
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryAudioByKey,
  resolveStoryCharacterAssetByKey,
} from "./asset";
import { parseScript } from "./parser";
import { DIALOG_FRAME_URL } from "./renderer";

import type { Context } from "../context";

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

function addCharacterUrl(urls: Set<string>, rawKey: string): void {
  const key = rawKey.trim();
  if (!key) return;

  const rawUrl = resolveStoryCharacterAssetByKey(key);
  if (!rawUrl) return;
  urls.add(resolveAssetUrl(rawUrl));
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
      const style =
        ({ 5: "bg", 7: "character" } as Record<string, string>)[rawStyle] ??
        rawStyle;
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

/**
 * Native provenance: `Torappu.AVG.AVGCharacterslotPanel` character-reference
 * resolution and `Torappu.ResourceRouter.GetCharacterPath`.
 *
 * Ports the story-facing name forms needed to identify character assets. The
 * `character.json` link-map representation and face-overlay reconstruction are
 * web asset-pipeline adaptations, not a direct native data structure.
 *
 */
function resolveCharacterSelection(
  context: Context,
  rawRef: string,
): { base: string; expression: string } | null {
  const cleaned = rawRef.trim();
  if (!cleaned) return null;
  const normalized = cleaned.toLowerCase();

  const directLink = context.linkMap[normalized];
  if (directLink?.array[0]?.name) {
    return {
      base: normalized,
      expression: directLink.array[0].name,
    };
  }

  for (const [base, link] of Object.entries(context.linkMap)) {
    const prefix = `${base}-`;
    if (!normalized.startsWith(prefix)) continue;

    const expression = normalized.slice(prefix.length);
    if (!expression) continue;

    const found = link.array.find(
      (item) => item.name.toLowerCase() === expression,
    );
    if (!found) continue;

    return { base, expression: found.name };
  }

  const match = normalized.match(
    /^([^@#$]+)(?:#(\d+)(?:\$(\d+))?|@([\w-]+)|\$(\d+))?$/,
  );
  if (!match) return null;

  const base = match[1];
  const link = context.linkMap[base];
  if (!link) return null;

  const hashIndex = match[2] ? Number.parseInt(match[2], 10) : undefined;
  const hashGroup = match[3] ? Number.parseInt(match[3], 10) : undefined;
  const alias = match[4];
  const dollarGroup = match[5] ? Number.parseInt(match[5], 10) : undefined;

  const pickInGroup = (group: number, index = 1): string | null => {
    const grouped = link.array.filter((entry) =>
      entry.name.endsWith(`$${group}`),
    );
    if (grouped.length === 0) return null;
    return grouped[Math.max(0, index - 1)]?.name ?? grouped[0].name;
  };

  if (alias) {
    const found = link.array.find(
      (item) => String(item.alias).toLowerCase() === alias,
    );
    const expression = found?.name ?? link.array[0]?.name ?? null;
    if (!expression) return null;
    return { base, expression };
  }

  if (hashGroup) {
    const expression = pickInGroup(hashGroup, hashIndex || 1);
    if (!expression) return null;
    return { base, expression };
  }

  if (dollarGroup) {
    const expression = pickInGroup(dollarGroup, 1);
    if (!expression) return null;
    return { base, expression };
  }

  if (hashIndex) {
    const found = link.array[Math.max(0, hashIndex - 1)] ?? link.array[0];
    if (!found?.name) return null;
    return { base, expression: found.name };
  }

  if (!link.array[0]?.name) return null;
  return { base, expression: link.array[0].name };
}

function addCharacterUrls(urls: Set<string>, context: Context): void {
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

      const resolved = resolveCharacterSelection(context, nameRef);
      if (!resolved) continue;

      const link = context.linkMap[resolved.base];
      if (!link) continue;

      const item = link.array.find(
        (entry) => entry.name === resolved.expression,
      );
      if (!item) continue;

      if (item.group === -1 && "image" in item && item.image) {
        addCharacterUrl(urls, item.image);
        continue;
      }

      if (!("face" in item) || !item.face || item.group < 0) continue;

      addCharacterUrl(urls, item.face);

      const group = link.groups[item.group];
      if (group?.mode === "face_overlay") addCharacterUrl(urls, group.base);
    }
  }
}

function uniqueResolvedUrls(context: Context): string[] {
  const urls = new Set<string>();
  if (context.charMap) {
    for (const rawUrl of Object.values(context.charMap))
      urls.add(resolveAssetUrl(rawUrl));
  }

  addCharacterUrls(urls, context);

  addScriptAudioUrls(urls, context);
  addScriptImageUrls(urls, context);

  // 固定 UI 资源（对话框上下黑条纹理），随每次 preload 一起预热进 pixi Assets 缓存，
  // renderer 在 createUi 时再 Assets.load 即可命中缓存。
  urls.add(DIALOG_FRAME_URL);

  return [...urls];
}

export async function preloadContextAssets(
  context: Context,
  onProgress?: (progress: number) => void,
): Promise<void> {
  const urls = uniqueResolvedUrls(context);
  console.log(`[preload] ${urls.length} unique asset URL(s) collected`);
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
    console.log(`[preload]   [${index}] ${url}`);

  let lastReported = -1;
  await Assets.load(urls, {
    onProgress: (progress) => {
      const percent = Math.round(progress * 100);
      // 只在整百分比变化时打印,避免 100 条资源刷屏。
      if (percent !== lastReported) {
        lastReported = percent;
        console.log(
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
  console.log(`[preload] done: ${urls.length} asset(s) resolved`);
}
