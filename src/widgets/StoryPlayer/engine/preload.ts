import { Assets } from "pixi.js";

import {
  DIALOG_FRAME_URL,
  INTERLUDE_ASSETS,
  SHOWITEM_PHOTO_FRAME_URL,
  SLIDE_MASK_TEXTURE_URL,
  STAMP_ASSETS,
} from "../assets";

import {
  cutinPortraitResourceKey,
  nativeBundleKey,
  resolveAssetUrl,
  resolveStoryAssetByKey,
  resolveStoryAudioByKey,
  resolveStoryCharacterAssetByKey,
  type StoryAssetFamily,
} from "./asset";
import { resolveAvgDisplayStyle } from "./avgDisplay";
import { describeCharacterPortrait } from "./characterPortrait";
import { resolveCharacterRef, resolveNativeCharacterRef } from "./characterRef";
import { boxedParamString, toString, tryConvertToInt32 } from "./commandParams";
import {
  ANIMTEXT_MAIN_FONT,
  DIALOG_FONT,
  loadFont,
  SAMI_FONTS,
  type FontSpec,
} from "./font";
import { parseScript } from "./parser";

import type { Context } from "../context";
import type { ParsedLine, StoryCharacterFaceAsset } from "./types";

export type { StoryCharacterFaceAsset } from "./types";

export interface ContextAssetManifest {
  faceAssets: StoryCharacterFaceAsset[];
  urls: string[];
}

function argAsString(raw: unknown): string {
  return typeof raw === "string" ? raw.trim() : "";
}

function addImageUrl(
  urls: Set<string>,
  rawKey: string,
  family: StoryAssetFamily,
  useBundlePath = family === "cutin",
): void {
  const rawUrl = resolveStoryAssetByKey(rawKey, family, useBundlePath);
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
function addScriptImageUrls(
  urls: Set<string>,
  lines: ParsedLine[],
  preload: boolean,
): void {
  for (const line of lines) {
    if (line.kind !== "command") continue;

    const image = argAsString(line.args.image);
    if (line.command === "background") {
      addImageUrl(urls, image, "background");
      continue;
    }
    if (line.command === "charactercutin") {
      // AVGCharacterCutinPanel.InternalResRefCollector (2791 @ 0x1841B53A0).
      addImageUrl(
        urls,
        boxedParamString(line.args.background),
        "background",
        true,
      );
      continue;
    }
    if (line.command === "avgdisplay") {
      // Unquoted `style=5` parses to a number; resolve it like the runtime.
      const style = resolveAvgDisplayStyle(String(line.args.style ?? ""));
      const name = argAsString(line.args.name);
      if (style === "bg")
        addImageUrl(urls, toString(line.args.name), "background");
      else if (style === "character") addCharacterUrl(urls, name);
      continue;
    }
    if (line.command === "cgitem" && line.args.style === "blocker") continue;
    if (line.command === "showitem" || line.command === "cgitem") {
      addImageUrl(urls, toString(line.args.image), "image");
      continue;
    }
    if (line.command === "image" || line.command === "blocker") {
      addImageUrl(urls, image, "image");
      continue;
    }
    if (line.command === "interlude") {
      // GatherResRefs (2791 @ 0x1841B53A0) converts the boxed value to Int32.
      // Only the Web preload also warms the aliases recognized by _GenCutinType.
      const numericType = tryConvertToInt32(line.args.type);
      const name = boxedParamString(line.args.name);
      if (numericType === 2 || (preload && line.args.type === "bg"))
        addImageUrl(urls, name, "background", true);
      else if (numericType === 1 || (preload && line.args.type === "uichar"))
        addImageUrl(urls, cutinPortraitResourceKey(name), "cutin");
      continue;
    }

    if (
      line.command === "gridbg" ||
      line.command === "verticalbg" ||
      line.command === "largebg"
    ) {
      // LargeBackgroundPanel.GatherResRefs (2791 @ 0x1841D7A40) collects
      // both groups even though playback selects imagegroup first.
      for (const key of toString(line.args.imagegroup).split("/"))
        addImageUrl(urls, key, "background");
      for (const key of toString(line.args.cggroup).split("/"))
        addImageUrl(urls, key, "image");
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
function addScriptAudioUrls(
  urls: Set<string>,
  context: Context,
  lines: ParsedLine[],
): void {
  for (const line of lines) {
    if (line.kind !== "command") continue;

    if (line.command !== "playmusic" && line.command !== "playsound") continue;

    // Match the executor's GetString conversion so every requested clip is warm.
    addAudioUrl(urls, context, boxedParamString(line.args.key));
    if (line.command === "playmusic")
      addAudioUrl(urls, context, boxedParamString(line.args.intro));
  }
}

function addCharacterUrls(
  urls: Set<string>,
  context: Context,
  lines: ParsedLine[],
  preload: boolean,
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

  for (const line of lines) {
    if (line.kind !== "command") continue;

    const refs: string[] = [];
    if (line.command === "charactercutin")
      refs.push(boxedParamString(line.args.name));
    else if (line.command === "charslot")
      refs.push(argAsString(line.args.name));
    else if (line.command === "character")
      refs.push(argAsString(line.args.name), argAsString(line.args.name2));
    else if (
      line.command === "interlude" &&
      (tryConvertToInt32(line.args.type) === 3 ||
        (preload && line.args.type === "char"))
    )
      refs.push(boxedParamString(line.args.name));
    else continue;

    for (const nameRef of refs) {
      if (!nameRef) continue;

      const resolve =
        line.command === "charactercutin" || line.command === "interlude"
          ? resolveNativeCharacterRef
          : resolveCharacterRef;
      const ref = resolve(context.linkMap, nameRef);
      if (ref.kind !== "found") continue;
      const resolved = ref.selection;

      const link = context.linkMap[resolved.base];
      if (!link) continue;

      const portrait = describeCharacterPortrait(link, resolved.expression);
      if (!portrait) continue;

      if (portrait.face) {
        const faceUrl = addCharacterUrl(urls, portrait.face.image);
        const bodyUrl = addCharacterUrl(urls, portrait.body);
        if (faceUrl && bodyUrl)
          addFaceGroup(link, portrait.face.group, bodyUrl, resolved.expression);
      } else {
        const bodyUrl = addCharacterUrl(urls, portrait.body);
        if (bodyUrl) {
          for (const [groupIndex, group] of link.groups.entries()) {
            if (
              group.mode === "face_overlay" &&
              resolveCharacterUrl(group.base) === bodyUrl
            )
              addFaceGroup(link, groupIndex, bodyUrl);
          }
        }
      }
    }
  }

  return [...faceAssets.values()];
}

function parseContextScript(context: Context): ParsedLine[] {
  return parseScript(context.scriptText ?? context.script);
}

function buildContextAssetManifest(
  context: Context,
  lines: ParsedLine[],
  preload = false,
): ContextAssetManifest {
  const urls = new Set<string>();
  if (context.charMap) {
    for (const rawUrl of Object.values(context.charMap))
      urls.add(resolveAssetUrl(rawUrl));
  }

  const faceAssets = addCharacterUrls(urls, context, lines, preload);

  addScriptAudioUrls(urls, context, lines);
  addScriptImageUrls(urls, lines, preload);

  return { faceAssets, urls: [...urls] };
}

export function collectContextAssetManifest(
  context: Context,
): ContextAssetManifest {
  return buildContextAssetManifest(context, parseContextScript(context));
}

export function collectContextAssetUrls(context: Context): string[] {
  return collectContextAssetManifest(context).urls;
}

function collectPreloadAssetUrls(
  context: Context,
  lines: ParsedLine[],
): string[] {
  const urls = new Set(buildContextAssetManifest(context, lines, true).urls);

  // 固定 UI 资源（对话框渐变纹理），随每次 preload 一起预热进 pixi Assets 缓存，
  // DialogView、cutin 道具和角色入场共用这张缓存纹理。它属于播放器内置资源，
  // 不应出现在面向用户的剧情资源列表中。
  urls.add(DIALOG_FRAME_URL);

  // animtext `group_location_stamp` 的 7 张内置贴片同理。native 侧
  // AVGDisplayableExecutor.InternalResRefCollector.GatherResRefs 对 ANIMATE_TEXT
  // 落入空分支、不登记任何资源引用（native LoadAsset 同步，印章当帧出现）；
  // Web 在剧本用到 animtext 时预热，播放时同步读取缓存，保证印章当帧出现。
  if (usesCommand(lines, "animtext")) {
    for (const url of Object.values(STAMP_ASSETS)) urls.add(url);
  }

  // showitem photo slot 的九宫格相框同理：native 是场景内置贴图，web 首次
  // Assets.load 走网络，会把第一次 showitem 的淡入整体推迟，故剧本用到
  // showitem 时一并预热。属 web 适配。
  if (usesCommand(lines, "showitem")) urls.add(SHOWITEM_PHOTO_FRAME_URL);

  // AVGBlockerPanel._SetMaterial (2791 @ 0x1841854F0) loads slide_mask
  // synchronously. Prewarm its bundled texture for the Web wipe filter.
  if (
    lines.some(
      (line) =>
        line.kind === "command" &&
        line.command === "blocker" &&
        (line.args.style === "slider" || line.args.style === "verticalslider"),
    )
  )
    urls.add(SLIDE_MASK_TEXTURE_URL);

  // The native cut-in controller loads its template synchronously. Prewarm
  // the bundled textures for the same path through Pixi's cache.
  if (usesCommand(lines, "interlude")) {
    for (const url of Object.values(INTERLUDE_ASSETS)) urls.add(url);
  }

  return [...urls];
}

function usesCommand(lines: ParsedLine[], command: string): boolean {
  return lines.some(
    (line) => line.kind === "command" && line.command === command,
  );
}

/**
 * 判定与 runtime 的 `spellsticker` 分支一致：`style` 缺省为 sami（不区分大小
 * 写），`action=hide` 只隐藏不显示。
 */
function showsSamiSpellSticker(lines: ParsedLine[]): boolean {
  return lines.some((line) => {
    if (line.kind !== "command" || line.command !== "spellsticker")
      return false;
    const { action = "show", style = "sami" } = line.args;
    return (
      String(action).toLowerCase() !== "hide" &&
      String(style).toLowerCase() === "sami"
    );
  });
}

/**
 * 剧本要用的字体：对话字体恒需要，其他字体按命令需要预热。
 * native 字体随 story.unity 常驻，按需加载属 web 适配。
 */
function collectPreloadFonts(lines: ParsedLine[]): FontSpec[] {
  const fonts = [DIALOG_FONT];
  const hasSquareInterlude = lines.some(
    (line) =>
      line.kind === "command" &&
      line.command === "interlude" &&
      nativeBundleKey(boxedParamString(line.args.maskid)) ===
        "group_interclude_square_common",
  );
  if (usesCommand(lines, "animtext") || hasSquareInterlude)
    fonts.push(ANIMTEXT_MAIN_FONT);
  if (showsSamiSpellSticker(lines)) fonts.push(...SAMI_FONTS);
  return fonts;
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
  const lines = parseContextScript(context);
  const urls = collectPreloadAssetUrls(context, lines);
  const fonts = collectPreloadFonts(lines);

  // 进度按条数计：Assets.load 按已完成的资源条数回报，字体每款也算一条，
  // 全部完成才到 1。字体与图片/音频并行下载，loadFont 不会 reject。
  let assetsLoaded = 0;
  let fontsLoaded = 0;
  const reportProgress = () =>
    onProgress?.((assetsLoaded + fontsLoaded) / (urls.length + fonts.length));
  const fontsReady = Promise.all(
    fonts.map(async (font) => {
      await loadFont(font);
      fontsLoaded += 1;
      reportProgress();
    }),
  );

  debugLog(`[preload] ${urls.length} unique asset URL(s) collected`);
  if (urls.length === 0) {
    console.warn(
      "[preload] no assets resolved — script may have no collectable commands or resolvers returned empty",
    );
    await fontsReady;
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
      assetsLoaded = progress * urls.length;
      reportProgress();
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
  await fontsReady;
  debugLog(`[preload] done: ${urls.length} asset(s) resolved`);
}
