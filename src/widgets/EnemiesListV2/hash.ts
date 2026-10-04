import {
  DEFAULT_SORT,
  isStatKey,
  View,
  type Sort,
  type SortKey,
  type ViewMode,
} from "./consts";
import { hasOption, selectedOptions, type FilterState } from "./filter";

/** 写进分享链接的那部分状态（页码、每页条数不进） */
export interface HashState {
  q: string;
  sort: Sort;
  view: ViewMode;
}

/**
 * 分享链接的 # 参数，写法照干员一览：
 *   <字段>=精英;领袖   一行筛选，字段名同「敌人一览/数据」
 *   _s 搜索 · _d 显示方式 0 表格 / 1 头像 · _o 排序：index-d / name-a / endure-d（排序项-升降）
 * 显示方式的默认值随设备（手机上是头像，见 store.ts），和默认值一样时不写 _d。
 * 只在打开页面（和地址栏的 # 变了）时读，不往回写——改版前没有地址栏参数，刷新页面就是清空；分享走结果栏的「复制链接」。
 */
const isSortKey = (key: string): key is SortKey =>
  key === "index" || key === "name" || isStatKey(key);

function parseSort(v: string): Sort | undefined {
  const m = /^(\w+)-([ad])$/.exec(v);
  if (!m || !isSortKey(m[1])) return undefined;
  return { key: m[1], dir: m[2] === "a" ? 1 : -1 };
}

const formatSort = (sort: Sort) => `${sort.key}-${sort.dir > 0 ? "a" : "d"}`;

/** 按 # 参数重置 filters 的选择，返回其余状态；hash 带不带开头的 # 都行 */
export function readHash(
  hash: string,
  filters: readonly FilterState[],
  defaultView: ViewMode = View.TABLE,
): HashState {
  for (const f of filters) f.selected.clear();
  const state: HashState = {
    q: "",
    sort: { ...DEFAULT_SORT },
    view: defaultView,
  };

  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (k === "_s") state.q = v;
    else if (k === "_o") state.sort = parseSort(v) ?? state.sort;
    else if (k === "_d") {
      if (/^[01]$/.test(v)) state.view = Number(v) as ViewMode;
    } else {
      const f = filters.find((f) => f.id === k);
      if (!f) continue;
      for (const id of v.split(";")) if (hasOption(f, id)) f.selected.add(id);
    }
  }
  return state;
}

/** 当前状态 → # 后面的串（不含 #）；默认状态是空串 */
export function buildHash(
  filters: readonly FilterState[],
  state: HashState,
  defaultView: ViewMode = View.TABLE,
): string {
  const p = new URLSearchParams();
  for (const f of filters) {
    if (f.selected.size === 0) continue;
    p.set(
      f.id,
      selectedOptions(f)
        .map((option) => option.id)
        .join(";"),
    );
  }
  if (state.q) p.set("_s", state.q);
  const sort = formatSort(state.sort);
  if (sort !== formatSort(DEFAULT_SORT)) p.set("_o", sort);
  if (state.view !== defaultView) p.set("_d", String(state.view));
  return p.toString();
}
