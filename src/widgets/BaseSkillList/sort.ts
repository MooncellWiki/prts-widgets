import type { Sort } from "./consts";
import type { Buff, Char } from "./data";

/**
 * 技能：结果始终按设施分组，先按设施次序（倒序也不倒设施），组内再排——
 * 游戏顺序 = sortId（进驻面板 CharSortType.BUFF_SORTID）；效率 = efficiency（CharSortType.EFFICIENCY）；
 * 持有人数；技能名。同值时按游戏顺序。
 */
export function sortBuffs(list: readonly Buff[], { key, dir }: Sort): Buff[] {
  const byIndex = (a: Buff, b: Buff) => a.index - b.index;
  const value =
    key === "order"
      ? (a: Buff, b: Buff) => byIndex(a, b)
      : key === "name"
        ? (a: Buff, b: Buff) => a.name.localeCompare(b.name, "zh")
        : key === "eff"
          ? (a: Buff, b: Buff) => a.eff - b.eff
          : (a: Buff, b: Buff) => a.holders.length - b.holders.length;
  return list
    .slice()
    .sort(
      (a, b) =>
        a.room.index - b.room.index || value(a, b) * dir || byIndex(a, b),
    );
}

/** 干员：游戏顺序 = 稀有度高的在前、同稀有度按 charId；名称 */
export function sortChars(list: readonly Char[], { key, dir }: Sort): Char[] {
  const out = list.slice();
  if (key === "name")
    return out.sort(
      (a, b) => a.name.localeCompare(b.name, "zh") * dir || a.index - b.index,
    );
  return out.sort((a, b) => (a.index - b.index) * dir);
}
