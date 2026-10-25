import type { Sort } from "./consts";
import type { Buff, Char } from "./data";

/**
 * 技能：游戏顺序 = 设施次序 + sortId（进驻面板 CharSortType.BUFF_SORTID）；
 * 效率 = efficiency（CharSortType.EFFICIENCY）；持有人数；技能名。同值时按游戏顺序。
 */
export function sortBuffs(list: readonly Buff[], { key, dir }: Sort): Buff[] {
  const byIndex = (a: Buff, b: Buff) => a.index - b.index;
  const out = list.slice();
  if (key === "order") return out.sort((a, b) => byIndex(a, b) * dir);
  if (key === "name")
    return out.sort(
      (a, b) => a.name.localeCompare(b.name, "zh") * dir || byIndex(a, b),
    );
  const value = (b: Buff) => (key === "eff" ? b.eff : b.holders.length);
  return out.sort((a, b) => (value(a) - value(b)) * dir || byIndex(a, b));
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
