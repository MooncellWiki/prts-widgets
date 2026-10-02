import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath, professionMap } from "@/utils/utils";

// 结果里同一位干员会在好几组里出现，md5 只算一次
const cache = new Map<string, string>();
export function avatar(zh: string) {
  const filename = `头像_${zh}.png`;
  let url = cache.get(filename);
  if (!url) cache.set(filename, (url = getImagePath(filename)));
  return url;
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
