import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import { BRANCH_BY_NAME, PROFESSION_ICONS } from "./professions";

import type { Char } from "./utils";

// 一页几十上百行都要同一批图标，md5 只算一次
const cache = new Map<string, string>();
function media(filename: string) {
  let url = cache.get(filename);
  if (!url) cache.set(filename, (url = getImagePath(filename)));
  return url;
}

/** 头像角上的职业小图标（游戏头像同款，26px，自带深底） */
export const professionBadge = (profession: string) =>
  media(`图标_职业_${profession}.png`);
/**
 * 职业白线稿（透明底，42px，游戏筛选面板同款）：当 CSS 遮罩用，颜色跟文字走。
 * 从 torappu 取；表里没有的职业照旧按中文名走 media
 */
export const professionLine = (profession: string) => {
  const key = PROFESSION_ICONS.get(profession);
  return key
    ? `${TORAPPU_ENDPOINT}/assets/profession_icon/icon_profession_${key}.png`
    : media(`图标_职业_透明_${profession}.png`);
};
/** 分支白线稿（透明底），同上：先查表从 torappu 取，表里没有的走 media */
export const branchLine = (branch: string) => {
  const key = BRANCH_BY_NAME.get(branch)?.iconKey;
  return key
    ? `${TORAPPU_ENDPOINT}/assets/subprofession_icon/sub_${key}_icon.png`
    : media(`职业分支图标_${branch}.png`);
};

// 头像 / 半身像按游戏内 ID 从 torappu 取；模板没给 ID 的（旧缓存页面）照旧按中文名走 media。
// torappu 上缺图的（升变阿米娅只有 _2）加载失败后由 fallbackImage 换回 media 那张
const fallbacks = new Map<string, string>();
function torappu(path: string, filename: string) {
  const url = `${TORAPPU_ENDPOINT}/assets/${path}`;
  fallbacks.set(url, media(filename));
  return url;
}

type Portrayed = Pick<Char, "zh" | "charId">;
export const avatar = ({ zh, charId }: Portrayed) =>
  charId
    ? torappu(`char_avatar/${charId}.png`, `头像_${zh}.png`)
    : media(`头像_${zh}.png`);
export const halfPortrait = ({ zh, charId }: Portrayed) =>
  charId
    ? torappu(`char_portrait/${charId}_1.png`, `半身像_${zh}_1.png`)
    : media(`半身像_${zh}_1.png`);

/** 挂在图片的容器上（@error.capture，error 不冒泡）：torappu 取不到时换成 media 的同一张 */
export function fallbackImage(e: Event) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const url = fallbacks.get(img.src);
  if (url) img.src = url;
}

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
