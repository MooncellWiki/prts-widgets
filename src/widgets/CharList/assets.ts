import { getImagePath } from "@/utils/utils";

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
/** 职业白图标（透明底，26px）：当 CSS 遮罩用，颜色跟文字走 */
export const professionLine = (profession: string) =>
  media(`图标_职业_透明_${profession}.png`);
/** 分支白线稿（透明底），同上 */
export const branchLine = (branch: string) =>
  media(`职业分支图标_${branch}.png`);

export const avatar = (zh: string) => media(`头像_${zh}.png`);
export const halfPortrait = (zh: string) => media(`半身像_${zh}_1.png`);

export const wikiLink = (zh: string) => `/w/${encodeURIComponent(zh)}`;
