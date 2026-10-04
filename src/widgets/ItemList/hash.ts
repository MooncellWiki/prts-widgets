import {
  DEFAULT_SORT,
  SORT_KEYS,
  View,
  type Sort,
  type SortKey,
  type ViewMode,
} from "./consts";
import {
  DEFAULT_CATEGORY,
  FILTER_IDS,
  FILTERS,
  hasOption,
  type FilterId,
} from "./filters";
import { emptySelection, type Selection } from "./query";

/** 写进地址栏的状态（页码、每页条数不进） */
export interface HashState {
  selection: Selection;
  q: string;
  sort: Sort;
  view: ViewMode;
}

/**
 * 地址栏 # 参数，写法同干员一览：
 *   <行>=1-材料;信物   一行筛选（category / rarity / obtain），稀有度写 0–5
 *   _s 搜索 · _o 排序（order-d / rarity-a / rarity-d，仓库正序不写）· _d 显示方式（1 = 列表，图标不写）
 * 分类行进页面时默认选着「材料」：不写 = 默认，一项都不选写成 category=1-
 */
function parseSort(v: string): Sort | undefined {
  const m = /^(\w+)-([ad])$/.exec(v);
  if (!m || !SORT_KEYS.includes(m[1] as SortKey)) return undefined;
  return { key: m[1] as SortKey, dir: m[2] === "a" ? 1 : -1 };
}

const formatSort = (sort: Sort) => `${sort.key}-${sort.dir > 0 ? "a" : "d"}`;

/** 按 FILTERS 里的次序列出一行已选的选项 */
export const selectedIds = (id: FilterId, selection: Selection) =>
  FILTERS[id].options
    .filter((option) => selection[id].has(option.id))
    .map((option) => option.id);

const isDefaultCategory = (selection: Selection) =>
  selection.category.size === DEFAULT_CATEGORY.length &&
  DEFAULT_CATEGORY.every((id) => selection.category.has(id));

/** 地址栏 → 状态；hash 带不带开头的 # 都行 */
export function readHash(hash: string): HashState {
  const state: HashState = {
    selection: emptySelection(),
    q: "",
    sort: { ...DEFAULT_SORT },
    view: View.GRID,
  };
  state.selection.category = new Set(DEFAULT_CATEGORY);

  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (k === "_s") state.q = v;
    else if (k === "_o") state.sort = parseSort(v) ?? state.sort;
    else if (k === "_d") {
      if (v === "1") state.view = View.LIST;
    } else if (FILTER_IDS.includes(k as FilterId) && v.startsWith("1-")) {
      const id = k as FilterId;
      state.selection[id] = new Set(
        v
          .slice(2)
          .split(";")
          .filter((option) => hasOption(id, option)),
      );
    }
  }
  return state;
}

/** 状态 → # 后面的串（不含 #）；默认状态是空串 */
export function buildHash(state: HashState): string {
  const p = new URLSearchParams();
  for (const id of FILTER_IDS) {
    const ids = selectedIds(id, state.selection);
    if (id === "category" ? isDefaultCategory(state.selection) : !ids.length)
      continue;
    p.set(id, `1-${ids.join(";")}`);
  }
  if (state.q) p.set("_s", state.q);
  if (formatSort(state.sort) !== formatSort(DEFAULT_SORT))
    p.set("_o", formatSort(state.sort));
  if (state.view !== View.GRID) p.set("_d", String(state.view));
  return p.toString();
}
