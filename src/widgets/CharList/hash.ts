import {
  DEFAULT_SORT,
  isStatKey,
  View,
  type Sort,
  type SortKey,
  type ViewMode,
} from "./consts";

import type { FilterState } from "./filter";

/** 写进地址栏的那部分状态（页码、每页条数不进） */
export interface HashState {
  q: string;
  sort: Sort;
  pot: boolean;
  trust: boolean;
  view: ViewMode;
}

/**
 * 地址栏 # 参数，写法沿用旧版（旧的短链接照样能用）：
 *   <字段>=1-近卫;狙击   一行筛选；0- 开头 = 同时满足；稀有度只写数字
 *   _s 搜索 · _f 数值加算（p 满潜能 / t 满信赖）· _d 显示方式 0 表格 / 1 半身像 / 2 头像
 *   _o 排序：0 实装顺序 / 1 倒序 · 2 名称升 / 3 降 · 4 稀有度升 / 5 降；数值列是新加的，写成 hp-d / atk-a
 */
const LEGACY_SORT: SortKey[] = ["time", "name", "rarity"];

function parseSort(v: string): Sort | undefined {
  const stat = /^(\w+)-([ad])$/.exec(v);
  if (stat) {
    return isStatKey(stat[1])
      ? { key: stat[1], dir: stat[2] === "a" ? 1 : -1 }
      : undefined;
  }
  if (!/^[0-5]$/.test(v)) return undefined;
  const n = Number(v);
  // 实装时间的 0 / 1 是顺序 / 倒序，和另外两种一样「偶数升、奇数降」
  return { key: LEGACY_SORT[n >> 1], dir: n & 1 ? -1 : 1 };
}

function formatSort(sort: Sort): string {
  const legacy = LEGACY_SORT.indexOf(sort.key);
  return legacy === -1
    ? `${sort.key}-${sort.dir > 0 ? "a" : "d"}`
    : String(legacy * 2 + (sort.dir < 0 ? 1 : 0));
}

/** 按地址栏重置 filters 的选择，返回其余状态；hash 带不带开头的 # 都行 */
export function readHash(hash: string, filters: FilterState[]): HashState {
  for (const f of filters) {
    f.sel.clear();
    f.and = false;
  }
  const state: HashState = {
    q: "",
    sort: { ...DEFAULT_SORT },
    pot: false,
    trust: false,
    view: View.TABLE,
  };

  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (k === "_s") state.q = v;
    else if (k === "_o") state.sort = parseSort(v) ?? state.sort;
    else if (k === "_f") {
      state.pot = v.includes("p");
      state.trust = v.includes("t");
    } else if (k === "_d") {
      const view = Number(v);
      if (view === View.HALF || view === View.AVATAR) state.view = view;
    } else {
      const f = filters.find((f) => f.field === k);
      if (!f) continue;
      f.and = f.canAnd && v[0] === "0";
      for (let label of v.slice(2).split(";")) {
        if (k === "rarity") label = `★${label}`;
        if (f.values.has(label)) f.sel.add(label);
      }
    }
  }
  return state;
}

/** 当前状态 → # 后面的串（不含 #）；默认状态是空串 */
export function buildHash(filters: FilterState[], state: HashState): string {
  const p = new URLSearchParams();
  for (const f of filters) {
    if (f.sel.size === 0) continue;
    const labels = f.labels
      .filter((l) => f.sel.has(l))
      .map((l) => l.replace("★", ""));
    p.set(f.field, (f.and ? "0-" : "1-") + labels.join(";"));
  }
  if (state.q) p.set("_s", state.q);
  const sort = formatSort(state.sort);
  if (sort !== formatSort(DEFAULT_SORT)) p.set("_o", sort);
  if (state.pot || state.trust)
    p.set("_f", (state.pot ? "p" : "") + (state.trust ? "t" : ""));
  if (state.view) p.set("_d", String(state.view));
  return p.toString();
}
