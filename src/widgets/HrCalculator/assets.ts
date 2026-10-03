import { media } from "@/utils/charImage";
import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { professionMap } from "@/utils/utils";

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

/** 头像左下角的职业小图标（游戏头像同款，26px，自带深底），同首页的干员卡、干员一览 */
export const professionBadge = (profession: string) =>
  media(`图标_职业_${profession}.png`);
/** 头像左上角的黄色星级原图（游戏同款，25px 高），同首页的干员卡 */
export const rarityStars = (star: number) => media(`稀有度_黄_${star - 1}.png`);

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
