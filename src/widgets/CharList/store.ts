import { computed, reactive, shallowRef, watch } from "vue";

import { defineStore } from "pinia";

import {
  DEFAULT_SORT,
  firstDir,
  isStatKey,
  PAGE_STEPS,
  type SortKey,
  type StatKey,
  View,
  type ViewMode,
} from "./consts";
import {
  createFilters,
  dropOrphanBranches,
  emptyOptions,
  failedFilters,
  normalizeNeedle,
  type FilterState,
} from "./filter";
import { ADVANCED_TABS } from "./filters";
import { buildHash, readHash, type HashState } from "./hash";
import { PROFESSION_ORDER, PROFESSIONS } from "./professions";
import { sortChars } from "./sort";
import { charStats, type CharStats } from "./stats";

import type { Char } from "./utils";

/** 高级筛选开没开、停在哪个页签，记在 localStorage */
const ADVANCED_KEY = "olFilterAdvanced";

function loadAdvanced() {
  const adv = { open: false, tab: ADVANCED_TABS[0].id };
  try {
    const saved = JSON.parse(localStorage.getItem(ADVANCED_KEY) ?? "null");
    if (saved && ADVANCED_TABS.some((t) => t.id === saved.tab)) {
      adv.open = !!saved.open;
      adv.tab = saved.tab;
    }
  } catch {
    // 存的东西坏了 / 拿不到 localStorage：按默认
  }
  return adv;
}

/** 手机上（视口 < 640，同 index.vue 的窄排布）默认头像，其余默认表格；进页面时定下来，之后转屏 / 缩放窗口不跟着变 */
const initialView = (): ViewMode =>
  window.innerWidth < 640 ? View.AVATAR : View.TABLE;

/**
 * 干员一览的全部状态：筛选 / 搜索 / 排序 / 数值加算 / 显示方式 / 分页，以及和地址栏 # 参数的同步。
 * 筛选规则写在 filters.ts，职业与分支定义写在 professions.ts；干员数据来自模板输出的 DOM，index.vue 挂载时 init() 灌进来，各块组件直接取用。
 */
export const useCharListStore = defineStore("charList", () => {
  const chars = shallowRef<Char[]>([]);
  const filterById = reactive(createFilters());
  const filters = computed(() => Object.values(filterById));
  const defaultView = initialView();
  const state = reactive<HashState & { page: number; step: number }>({
    ...readHash("", [], defaultView),
    page: 1,
    step: PAGE_STEPS[0],
  });
  const advanced = reactive(loadAdvanced());
  watch(advanced, () => {
    try {
      localStorage.setItem(ADVANCED_KEY, JSON.stringify(advanced));
    } catch {
      // 隐私模式等写不进去：只是下次不记得
    }
  });

  const { profession, subProfession: branch } = filterById;
  const normalize = () => dropOrphanBranches(profession, branch);
  const branchGroups = computed(() =>
    PROFESSIONS.filter(
      (p) =>
        profession.selection.selected.size === 0 ||
        profession.selection.selected.has(p.name),
    ),
  );
  const tabs = ADVANCED_TABS.map((tab) => ({
    ...tab,
    filters: tab.fields.map((id) => filterById[id]),
  }));

  /* ── 筛选 → 排序 → 分页 ── */
  const failed = computed(() =>
    failedFilters(chars.value, filters.value, normalizeNeedle(state.q)),
  );
  /** 各行里会筛出 0 条的选项（按字段名取） */
  const empties = computed(
    () =>
      new Map(filters.value.map((f) => [f.id, emptyOptions(f, failed.value)])),
  );
  const statsCache = computed(() => {
    const { pot, trust } = state;
    const cache = new Map<Char, CharStats>();
    return (char: Char) => {
      let stats = cache.get(char);
      if (!stats) cache.set(char, (stats = charStats(char, pot, trust)));
      return stats;
    };
  });
  /** 按当前的满潜能 / 满信赖开关加算后的数值 */
  const statsOf = (char: Char) => statsCache.value(char);

  const list = computed(() => {
    const matched: Char[] = [];
    for (const [char, fails] of failed.value)
      if (fails.length === 0) matched.push(char);
    // 只有按数值排才依赖加算开关：别的排序下切开关不重排、不翻回第一页
    const stats = isStatKey(state.sort.key)
      ? statsCache.value
      : (char: Char) => charStats(char, false, false);
    return sortChars(matched, state.sort, PROFESSION_ORDER, stats);
  });
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(list.value.length / state.step)),
  );
  const page = computed(() =>
    Math.min(Math.max(1, state.page), pageCount.value),
  );
  const pageList = computed(() =>
    list.value.slice((page.value - 1) * state.step, page.value * state.step),
  );
  watch(list, () => {
    state.page = 1;
  });

  /** 当前按哪项数值排序（不是按数值排则为 null）：表格给那一列铺底色，半身像 / 头像卡上带出数值 */
  const sortStat = computed<StatKey | null>(() =>
    isStatKey(state.sort.key) ? state.sort.key : null,
  );

  /* ── 地址栏 ── */
  const hash = computed(() => buildHash(filters.value, state, defaultView));
  watch(hash, (h) => {
    if (h === location.hash.slice(1)) return;
    history.replaceState(
      null,
      "",
      h ? `#${h}` : location.pathname + location.search,
    );
  });
  /** 按地址栏重置筛选与其余状态（挂载时、hashchange 时） */
  function syncFromHash() {
    Object.assign(state, readHash(location.hash, filters.value, defaultView));
    normalize();
  }

  function init(source: Char[]) {
    chars.value = source;
    syncFromHash();
  }

  /* ── 操作 ── */
  function toggle(f: FilterState, id: string) {
    if (f.selection.selected.has(id)) f.selection.selected.delete(id);
    else f.selection.selected.add(id);
    normalize();
  }
  function clear(f: FilterState) {
    f.selection.selected.clear();
  }
  function setAnd(f: FilterState, and: boolean) {
    f.selection.and = !!f.def.canAnd && and;
  }
  function reset() {
    for (const f of filters.value) {
      f.selection.selected.clear();
      f.selection.and = false;
    }
    state.q = "";
  }
  function setSortKey(key: SortKey) {
    state.sort = { key, dir: firstDir(key) };
  }
  function flipSort() {
    state.sort = { key: state.sort.key, dir: state.sort.dir > 0 ? -1 : 1 };
  }
  /** 点表头：先排 → 反向 → 回到默认（实装倒序） */
  function cycleSort(key: SortKey) {
    if (state.sort.key !== key) setSortKey(key);
    else if (state.sort.dir === firstDir(key)) flipSort();
    else state.sort = { ...DEFAULT_SORT };
  }
  /** 换每页条数：停在原来第一条所在的页 */
  function setStep(step: number) {
    const first = (page.value - 1) * state.step;
    state.step = step;
    state.page = Math.floor(first / step) + 1;
  }
  function setPage(n: number) {
    state.page = n;
  }
  function setView(view: ViewMode) {
    state.view = view;
  }

  return {
    chars,
    filters,
    state,
    advanced,
    profession,
    branch,
    filterById,
    branchGroups,
    tabs,
    empties,
    list,
    page,
    pageCount,
    pageList,
    sortStat,
    statsOf,
    init,
    syncFromHash,
    toggle,
    clear,
    setAnd,
    reset,
    setSortKey,
    flipSort,
    cycleSort,
    setStep,
    setPage,
    setView,
  };
});
