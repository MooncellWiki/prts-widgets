import { FILTER_IDS, FILTERS, type FilterId } from "./filters";

import type { Sort } from "./consts";
import type { Item } from "./item";

/** 各行已选的选项 */
export type Selection = Record<FilterId, Set<string>>;

export const emptySelection = (): Selection => ({
  category: new Set(),
  rarity: new Set(),
  obtain: new Set(),
});

/** 搜索词：去掉首尾空白、不分大小写 */
export const normalizeNeedle = (q: string) => q.trim().toLowerCase();

/** 一行：没选 = 不筛；选了几项 = 命中其中任意一项 */
function matchRow(item: Item, id: FilterId, selection: Selection) {
  const selected = selection[id];
  if (selected.size === 0) return true;
  for (const option of item.options[id]) if (selected.has(option)) return true;
  return false;
}

const matchText = (item: Item, needle: string) =>
  !needle || item.haystack.includes(needle);

/** 搜索 + 各行筛选都过的道具；skip 那一行不算（算「再点这一项会怎样」时用） */
export function filterItems(
  items: readonly Item[],
  selection: Selection,
  needle: string,
  skip?: FilterId,
): Item[] {
  return items.filter(
    (item) =>
      matchText(item, needle) &&
      FILTER_IDS.every((id) => id === skip || matchRow(item, id, selection)),
  );
}

/** 各行里会筛出 0 条的选项：其余条件不变，这一行只留它一项时没有道具 */
export function emptyOptions(
  items: readonly Item[],
  selection: Selection,
  needle: string,
): Record<FilterId, Set<string>> {
  const out = emptySelection();
  for (const id of FILTER_IDS) {
    const reachable = new Set<string>();
    for (const item of filterItems(items, selection, needle, id))
      for (const option of item.options[id]) reachable.add(option);
    for (const { id: option } of FILTERS[id].options)
      if (!reachable.has(option)) out[id].add(option);
  }
  return out;
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 仓库顺序：同游戏仓库的排法（ItemRepoUtil.GetCurrentItemList：sortId 升序，相同再比 itemId）。
 * sortId 是负数的在仓库里没有位置（活动代币、家具收藏包一类），不管正序倒序都排在最后。
 */
function compareOrder(a: Item, b: Item, dir: number) {
  const aOut = a.sortId < 0;
  if (aOut !== b.sortId < 0) return aOut ? 1 : -1;
  return (
    (a.sortId - b.sortId || compareText(a.itemId, b.itemId)) * dir ||
    a.index - b.index
  );
}

/** 按稀有度排时，同稀有度的照仓库顺序 */
export function sortItems(items: readonly Item[], sort: Sort): Item[] {
  return [...items].sort((a, b) =>
    sort.key === "rarity"
      ? (a.rarity - b.rarity) * sort.dir || compareOrder(a, b, 1)
      : compareOrder(a, b, sort.dir),
  );
}
