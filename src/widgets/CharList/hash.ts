import {
  DEFAULT_SORT,
  isStatKey,
  View,
  type Sort,
  type SortKey,
  type ViewMode,
} from "./consts";
import { hasOption, selectedOptions, setAnd, type FilterState } from "./filter";

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
 *   _fm 势力查询方式：1 = 作战（缺省 = 档案，按 nation / group / team 查）
 *   _fh 隐藏势力：1 = 作战模式下连 ingameFaction.hidden 一起查（档案模式下无效果）
 * 显示方式的默认值随设备（手机上是头像，见 store.ts），和默认值一样时不写 _d——手机上换回表格写的是 _d=0
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

/** 带「档案 / 作战」开关的那一行（势力） */
const combatFilter = (filters: FilterState[]) =>
  filters.find((f) => f.def.combat);

/** 按地址栏重置 filters 的选择，返回其余状态；hash 带不带开头的 # 都行 */
export function readHash(
  hash: string,
  filters: FilterState[],
  defaultView: ViewMode = View.TABLE,
): HashState {
  for (const f of filters) {
    f.selection.selected.clear();
    f.selection.and = false;
    f.selection.combat = false;
    f.selection.hidden = false;
  }
  const state: HashState = {
    q: "",
    sort: { ...DEFAULT_SORT },
    pot: false,
    trust: false,
    view: defaultView,
  };

  for (const [k, v] of new URLSearchParams(hash.replace(/^#/, ""))) {
    if (k === "_s") state.q = v;
    else if (k === "_o") state.sort = parseSort(v) ?? state.sort;
    else if (k === "_f") {
      state.pot = v.includes("p");
      state.trust = v.includes("t");
    } else if (k === "_d") {
      if (/^[0-2]$/.test(v)) state.view = Number(v) as ViewMode;
    } else if (k === "_fm" || k === "_fh") {
      const force = combatFilter(filters);
      if (!force) continue;
      if (k === "_fm") force.selection.combat = v === "1";
      else force.selection.hidden = v === "1";
    } else {
      const f = filters.find((f) => f.id === k);
      if (!f || !/^[01]-/.test(v)) continue;
      setAnd(f, v[0] === "0");
      for (const id of v.slice(2).split(";")) {
        if (hasOption(f, id)) f.selection.selected.add(id);
      }
    }
  }
  return state;
}

/** 当前状态 → # 后面的串（不含 #）；默认状态是空串 */
export function buildHash(
  filters: FilterState[],
  state: HashState,
  defaultView: ViewMode = View.TABLE,
): string {
  const p = new URLSearchParams();
  for (const f of filters) {
    if (f.selection.selected.size === 0) continue;
    const ids = selectedOptions(f).map((option) => option.id);
    p.set(f.id, (f.selection.and ? "0-" : "1-") + ids.join(";"));
  }
  const force = combatFilter(filters);
  if (force?.selection.combat) p.set("_fm", "1");
  if (force?.selection.hidden) p.set("_fh", "1");
  if (state.q) p.set("_s", state.q);
  const sort = formatSort(state.sort);
  if (sort !== formatSort(DEFAULT_SORT)) p.set("_o", sort);
  if (state.pot || state.trust)
    p.set("_f", (state.pot ? "p" : "") + (state.trust ? "t" : ""));
  if (state.view !== defaultView) p.set("_d", String(state.view));
  return p.toString();
}
