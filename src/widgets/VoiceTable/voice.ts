import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { ILLUST_SHOW_TYPES, SkinVoiceType } from "./consts";

import type {
  OverrideVoiceBaseItem,
  VoiceBaseItem,
  VoiceDataItem,
} from "./types";
import type { VoiceLanguage } from "@mooncellwiki/prts-design-vue";

/**
 * 语音表格的数据整形：把 {{VoiceTable}} 吐出的数据揉成设计系统 AkVoiceList 要的形状。
 *
 * 「语言」与「语种」是两个东西，各自一排芯片：
 *   - 语言 = 台词文本差分（{{VoiceData/word|<kind>|…}}）：中文 / 日文 / 繁体中文 / 中文-方言 …，可多选同时显示
 *   - 语种 = 音频差分（|路径= 里的语种名）：日语 / 中文-普通话 / 中文-方言 …，单选，决定播放哪份音频
 * 两边叫法不一样（日文 / 日语、中文 / 中文-普通话），CharinfoV2 的 char_info.cv 又是第三套（日文 / 中文-普通话 / 法语），
 * 只在给语种配 CV 名时归一一下，三处都可能带「(残余)」「(猫形态)」这样的差分后缀。
 */

export interface ParsedLangName {
  /** 去掉 语/文 后缀、繁体前缀与差分后缀的基础名：日 / 中 / 英 / 中-方言 / 意大利 */
  base: string;
  /** 括号里的差分后缀，没有则为空串 */
  variant: string;
  /** 是否带「繁体」前缀（只有文本差分有） */
  traditional: boolean;
}

/** 基础名 → 语种代码 */
const LANG_CODE: Record<string, string> = {
  中: "cn",
  日: "jp",
  英: "en",
  韩: "kr",
  意大利: "it",
  俄: "ru",
  德: "de",
  法: "fr",
};

/** 游戏内仅限时显示的语音：和解锁条件一样作为灰标，显示在标题下面一行（原来是标题后的问号提示） */
export const DISPLAY_TIPS: Record<string, string> = {
  新年祝福: "游戏内仅在每年1月1日-1月4日显示",
  生日: "游戏内仅在每年博士生日显示",
  周年庆典: "游戏内仅在每年5月1日-5月4日显示",
};

export function parseLangName(name: string): ParsedLangName {
  let base = name.trim();
  let variant = "";
  const m = /^(.*?)\s*[（(]([^()（）]*)[)）]\s*$/.exec(base);
  if (m) {
    base = m[1];
    variant = m[2].trim();
  }
  const traditional = base.startsWith("繁体");
  if (traditional) base = base.slice(2);
  if (base === "中文-普通话") base = "中文";
  // 日语 / 日文 → 日；中文-方言 → 中-方言；意大利语 → 意大利
  base = base.replace(/^([^-]+?)[语文](?=-|$)/, "$1");
  return { base, variant, traditional };
}

/** 语种名 → 代码（不带差分）：日语 / 日文 → jp，中文-普通话 / 中文 → cn；认不出的原样返回 */
export function langCode(name: string): string {
  const { base } = parseLangName(name);
  return LANG_CODE[base] ?? base;
}

/** CharinfoV2 内联的 char_info.cv → 按语种代码取 CV 名 */
export function readCvNames(
  charInfo: { cv?: Record<string, { name?: string } | undefined> } | undefined,
): Record<string, string> {
  const names: Record<string, string> = {};
  for (const [name, entry] of Object.entries(charInfo?.cv ?? {})) {
    if (entry?.name) names[langCode(name)] = entry.name;
  }
  return names;
}

/** 语种芯片（AkVoiceList 的 languages）：按 |路径= 的顺序，value 就是语种名，配 CV 名 */
export function buildLanguages(
  voiceBase: readonly VoiceBaseItem[],
  cvNames: Record<string, string> = {},
): VoiceLanguage[] {
  const languages: VoiceLanguage[] = [];
  const seen = new Set<string>();
  for (const { lang, path } of voiceBase) {
    if (!lang || !path || seen.has(lang)) continue;
    seen.add(lang);
    languages.push({
      value: lang,
      label: lang,
      cv: cvNames[langCode(lang)],
    });
  }
  return languages;
}

/** 台词 HTML → 纯文本：AkVoice 只收字符串；<br> 折成空格，其余标签只留文字 */
export function htmlToText(html: string): string {
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n");
  let text: string;
  if (typeof document === "undefined") {
    text = withBreaks.replace(/<[^>]+>/g, "");
  } else {
    const tpl = document.createElement("template");
    tpl.innerHTML = withBreaks;
    text = tpl.content.textContent ?? "";
  }
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/** 各文本语种的台词（键 = 文本差分名，AkVoiceList 按选中的几种取）；空台词不进对象，繁体差分常缺节日语音 */
export function buildTexts(
  item: VoiceDataItem,
  kinds: readonly string[],
): Record<string, string> {
  const texts: Record<string, string> = {};
  for (const kind of kinds) {
    const text = htmlToText(item.detail[kind] ?? "");
    if (text) texts[kind] = text;
  }
  return texts;
}

/**
 * 罗小黑兼容：精一（猫形态）战斗中是人形态语音、战斗外是猫形态语音；
 * 精二（人形态）ILLUST_SHOW_TYPES 里的语音覆盖精一，战斗内外均为人形态语音。
 */
export function resolveVoicePath(
  audio: VoiceBaseItem,
  overrideVoiceBase: readonly OverrideVoiceBaseItem[],
  placeType?: string,
): string {
  const override = overrideVoiceBase.find((o) => o.lang === audio.lang);
  if (
    override &&
    placeType &&
    !ILLUST_SHOW_TYPES.has(placeType) &&
    override.mode === SkinVoiceType.ILLUST
  )
    return override.path;
  return audio.path;
}

export function voiceUrl(path: string, fileName: string): string {
  const file = fileName.replace(/\s/g, "_").replace(/\.wav$/i, ".mp3");
  return `${TORAPPU_ENDPOINT}/assets/audio/${path}/${file}`;
}

/** 下载给 wav 原文件；?filename= 是原版 VoiceTable 的约定，服务端据此写 Content-Disposition */
export function downloadUrl(
  path: string,
  fileName: string,
  title: string,
): string {
  const file = fileName.replace(/\s/g, "_");
  return `${TORAPPU_ENDPOINT}/assets/audio/${path}/${file}?filename=${encodeURIComponent(title)}.wav`;
}

/** 每条按语种的音频地址（键 = 语种名）：直链优先，其次 torappu 的 mp3；没有音频的语种不进对象 */
export function buildSources(
  item: VoiceDataItem,
  voiceBase: readonly VoiceBaseItem[],
  overrideVoiceBase: readonly OverrideVoiceBaseItem[] = [],
): Record<string, string> {
  const sources: Record<string, string> = {};
  for (const audio of voiceBase) {
    if (!audio.lang || !audio.path || audio.lang in sources) continue;
    const direct = item.directLinks[audio.lang];
    if (direct) sources[audio.lang] = direct;
    else if (item.fileName)
      sources[audio.lang] = voiceUrl(
        resolveVoicePath(audio, overrideVoiceBase, item.placeType),
        item.fileName,
      );
  }
  return sources;
}

/** 每条按语种的下载地址（同 buildSources 的键）：直链原样，其次 torappu 的 wav */
export function buildDownloads(
  item: VoiceDataItem,
  voiceBase: readonly VoiceBaseItem[],
  overrideVoiceBase: readonly OverrideVoiceBaseItem[] = [],
): Record<string, string> {
  const downloads: Record<string, string> = {};
  for (const audio of voiceBase) {
    if (!audio.lang || !audio.path || audio.lang in downloads) continue;
    const direct = item.directLinks[audio.lang];
    if (direct) downloads[audio.lang] = direct;
    else if (item.fileName)
      downloads[audio.lang] = downloadUrl(
        resolveVoicePath(audio, overrideVoiceBase, item.placeType),
        item.fileName,
        item.title ?? item.fileName,
      );
  }
  return downloads;
}

/** 标题下面一行的灰标：游戏内解锁条件，或限时显示说明 */
export function unlockText(item: VoiceDataItem): string | undefined {
  return item.cond || (item.title ? DISPLAY_TIPS[item.title] : undefined);
}
