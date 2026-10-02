import { TORAPPU_ENDPOINT } from "./consts";
import { getImagePath } from "./utils";

// 一页几十上百处要同一批图，md5 只算一次
const cache = new Map<string, string>();
export function media(filename: string) {
  let url = cache.get(filename);
  if (!url) cache.set(filename, (url = getImagePath(filename)));
  return url;
}

// 头像 / 半身像按游戏内 ID 从 torappu 取；没有 ID 的（旧缓存页面、cargo 里没填）照旧按中文名走 media。
// torappu 上缺图的（新干员资源还没进来、升变阿米娅只有 _2）加载失败后由 onImageError 换回 media 那张
const fallbacks = new Map<string, string>();
function torappu(path: string, filename: string) {
  const url = `${TORAPPU_ENDPOINT}/assets/${path}`;
  fallbacks.set(url, media(filename));
  return url;
}

interface Portrayed {
  zh: string;
  charId?: string;
}
export const avatar = ({ zh, charId }: Portrayed) =>
  charId
    ? torappu(`char_avatar/${charId}.png`, `头像_${zh}.png`)
    : media(`头像_${zh}.png`);
export const halfPortrait = ({ zh, charId }: Portrayed) =>
  charId
    ? torappu(`char_portrait/${charId}_1.png`, `半身像_${zh}_1.png`)
    : media(`半身像_${zh}_1.png`);

/**
 * 挂在 <img> 上，或挂在图片的容器上（@error.capture，error 不冒泡）；同一张图只挂一处，
 * 不然外层先跑会把换过去的那张也当成没得换。
 * torappu 取不到时换成 media 的同一张；没得换（media 也还没上传）就藏掉破图，留下底框
 */
export function onImageError(e: Event) {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const url = fallbacks.get(img.src);
  if (url) img.src = url;
  else img.style.visibility = "hidden";
}
