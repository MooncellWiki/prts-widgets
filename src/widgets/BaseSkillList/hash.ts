import {
  DEFAULT_SORT,
  SORT_KEYS,
  View,
  type Sort,
  type SortKey,
  type ViewMode,
} from "./consts";
import {
  FILTER_IDS,
  hasOption,
  selectedOptions,
  type FilterId,
  type Filters,
} from "./filter";

/** 写进地址栏的那部分状态（页码、每页条数不进） */
export interface HashState {
  q: string;
  sort: Sort;
  view: ViewMode;
}

/**
 * 地址栏 # 参数，写法同干员一览 / 道具一览：
 *   <行>=1-CONTROL;MANUFACTURE   一行筛选（room / target / phase / rarity / prof）；解锁阶段写 e0 / e0l30 / e2，稀有度写星数
 *   _s 搜索 · _o 排序（order-d / eff-d / holders-d / name-a，游戏正序不写）· _d 显示方式（1 = 干员，技能不写）
 */
function parseSort(v: string): Sort | undefined {
  const m = /^(\w+)-([ad])$/.exec(v);
  if (!m || !SORT_KEYS.includes(m[1] as SortKey)) return undefined;
  return { key: m[1] as SortKey, dir: m[2] === "a" ? 1 : -1 };
}

const formatSort = (sort: Sort) => `${sort.key}-${sort.dir > 0 ? "a" : "d"}`;

/** 按 # 参数重置 filters 的选择，返回其余状态；hash 带不带开头的 # 都行 */
export function readHash(hash: string, filters: Filters): HashState {
  for (const id of FILTER_IDS) filters[id].selected.clear();
  const state: HashState = {
    q: "",
    sort: { ...DEFAULT_SORT },
    view: View.SKILL,
  };

  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (k === "_s") state.q = v;
    else if (k === "_o") state.sort = parseSort(v) ?? state.sort;
    else if (k === "_d") {
      if (v === "1") state.view = View.OP;
    } else if (FILTER_IDS.includes(k as FilterId) && v.startsWith("1-")) {
      const f = filters[k as FilterId];
      for (const id of v.slice(2).split(";"))
        if (hasOption(f, id)) f.selected.add(id);
    }
  }
  return state;
}

/** 当前状态 → # 后面的串（不含 #）；默认状态是空串 */
export function buildHash(filters: Filters, state: HashState): string {
  const p = new URLSearchParams();
  for (const id of FILTER_IDS) {
    const ids = selectedOptions(filters[id]).map((o) => o.id);
    if (ids.length > 0) p.set(id, `1-${ids.join(";")}`);
  }
  if (state.q) p.set("_s", state.q);
  if (formatSort(state.sort) !== formatSort(DEFAULT_SORT))
    p.set("_o", formatSort(state.sort));
  if (state.view !== View.SKILL) p.set("_d", String(state.view));
  return p.toString();
}
