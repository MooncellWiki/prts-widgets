import { makeJsonDecoder, makeJsonEncoder } from "@urlpack/json";

import { LIVE_GROUPS, LONGEST, type DurIndex } from "./consts";

/**
 * ?filter= 的写法同旧版（现网的分享链接照样能用）：@urlpack/json 编码的 { profession, position, rarity, tag } 四个位图，
 * 组内第 i 项是从高位数的第 i 位。面板上怎么归类不影响编码。
 */
export function encodeFilter(sel: ReadonlySet<string>): string {
  const payload: Record<string, number> = {};
  for (const [key, list] of Object.entries(LIVE_GROUPS))
    payload[key] = list.reduce(
      (v, tag, i) => (sel.has(tag) ? v + 2 ** (list.length - 1 - i) : v),
      0,
    );
  return makeJsonEncoder().encode(payload);
}

/** 解不开的链接当作没选；旧版不限个数，超过 5 个的照收（面板上只是不能再加） */
export function decodeFilter(encoded: string): Set<string> {
  const sel = new Set<string>();
  let payload: unknown;
  try {
    payload = makeJsonDecoder().decode(encoded);
  } catch {
    return sel;
  }
  if (!payload || typeof payload !== "object") return sel;
  for (const [key, list] of Object.entries(LIVE_GROUPS)) {
    const v = (payload as Record<string, unknown>)[key];
    if (typeof v !== "number") continue;
    list.forEach((tag, i) => {
      if (Math.floor(v / 2 ** (list.length - 1 - i)) % 2) sel.add(tag);
    });
  }
  return sel;
}

/** 时限是新加的，另用 ?t=0|1（默认最长一档不写）——塞进 filter 里旧版会把它当位图读坏 */
export function readQuery(search: string): {
  sel: Set<string>;
  dur: DurIndex;
} {
  const q = new URLSearchParams(search);
  const filter = q.get("filter");
  const t = q.get("t");
  return {
    sel: filter ? decodeFilter(filter) : new Set(),
    dur: t === "0" || t === "1" ? (Number(t) as DurIndex) : LONGEST,
  };
}

/** 在现有的查询串上改写 filter / t，其余参数（index.php 的 title 等）原样保留 */
export function writeQuery(
  search: string,
  sel: ReadonlySet<string>,
  dur: DurIndex,
): string {
  const q = new URLSearchParams(search);
  if (sel.size) q.set("filter", encodeFilter(sel));
  else q.delete("filter");
  if (dur === LONGEST) q.delete("t");
  else q.set("t", String(dur));
  const s = q.toString();
  return s ? `?${s}` : "";
}
