import { statNumber, type CharStats } from "./stats";

import type { Sort } from "./consts";
import type { Char } from "./utils";

/**
 * 排序 = 排序项 × 升降。
 * 现网六种 = 实装时间 / 名称 / 稀有度 × 升降；八项数值照游戏干员列表加（CharacterSortType 的 BY_HP / ATK / … 各有 UP / DOWN）。
 * 同值时的次序也照游戏（CharacterUtil._CompareByChain → COMPARE_PRIORITY）：
 * 稀有度高的在前 → 职业（筛选项里的顺序）→ 名称。
 */
export function sortChars(
  list: Char[],
  sort: Sort,
  profOrder: string[],
  statsOf: (char: Char) => CharStats,
): Char[] {
  const { key, dir } = sort;
  const out = list.slice();
  const byName = (a: Char, b: Char) => a.zh.localeCompare(b.zh, "zh");
  const byProf = (a: Char, b: Char) =>
    profOrder.indexOf(a.profession) - profOrder.indexOf(b.profession);

  if (key === "time") return out.sort((a, b) => (a.sortId - b.sortId) * dir);
  if (key === "name") return out.sort((a, b) => byName(a, b) * dir);
  if (key === "rarity")
    return out.sort(
      (a, b) => (a.rarity - b.rarity) * dir || byProf(a, b) || byName(a, b),
    );

  const value = new Map(out.map((c) => [c, statNumber(statsOf(c)[key])]));
  return out.sort((a, b) => {
    const x = value.get(a) ?? null;
    const y = value.get(b) ?? null;
    // 没有数值的不分升降都排最后
    const primary =
      x === null || y === null
        ? Number(x === null) - Number(y === null)
        : (x - y) * dir;
    return primary || b.rarity - a.rarity || byProf(a, b) || byName(a, b);
  });
}
