import { media } from "@/utils/charImage";
import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { BRANCH_BY_NAME, PROFESSION_ICONS } from "./professions";

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

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
