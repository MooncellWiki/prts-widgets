import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath, professionMap } from "@/utils/utils";

import type { Op } from "./recruit";

// 结果里同一位干员会在好几组里出现，md5 只算一次
const cache = new Map<string, string>();
function media(filename: string) {
  let url = cache.get(filename);
  if (!url) cache.set(filename, (url = getImagePath(filename)));
  return url;
}

// 头像按游戏内 ID 从 torappu 取（同干员一览）；cargo 里没填 ID 的照旧按中文名走 media。
// torappu 上缺图的（新干员资源还没进来）加载失败后由 fallbackImage 换回 media 那张
const fallbacks = new Map<string, string>();
export function avatar({ zh, charId }: Pick<Op, "zh" | "charId">) {
  const filename = `头像_${zh}.png`;
  if (!charId) return media(filename);
  const url = `${TORAPPU_ENDPOINT}/assets/char_avatar/${charId}.png`;
  if (!fallbacks.has(url)) fallbacks.set(url, media(filename));
  return url;
}

/** 挂在 <img> 上：torappu 取不到时换成 media 的同一张 */
export function fallbackImage(e: Event) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const url = fallbacks.get(img.src);
  if (url) img.src = url;
}

// torappu 的职业图标按游戏内 key 寻址：先锋 → pioneer …
const PROFESSION_KEYS = new Map(
  Object.entries(professionMap).map(([key, zh]) => [zh, key.toLowerCase()]),
);
/** 职业白线稿（透明底，游戏筛选面板同款，同干员一览）：当 CSS 遮罩用，颜色跟文字走；不是职业返回 undefined */
export function professionLine(tag: string) {
  const key = PROFESSION_KEYS.get(tag);
  return key
    ? `${TORAPPU_ENDPOINT}/assets/profession_icon/icon_profession_${key}.png`
    : undefined;
}

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
