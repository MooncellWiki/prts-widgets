import { computed, inject, reactive, watch, type InjectionKey } from "vue";

import { isClient } from "@vueuse/core";

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
import { toEnemy, type EnemyData } from "./enemy";
import {
  createFilters,
  emptyOptions,
  failedFilters,
  hasOption,
  normalizeNeedle,
  QUICK_FILTERS,
  STAT_FILTERS,
  type FilterState,
} from "./filter";
import { buildHash, readHash, type HashState } from "./hash";
import { sortEnemies } from "./sort";

/** 属性筛选开没开，记在 localStorage */
const ADVANCED_KEY = "elFilterAdvanced";

function loadAdvanced() {
  try {
    return localStorage.getItem(ADVANCED_KEY) === "1";
  } catch {
    // 拿不到 localStorage（外壳预渲染、隐私模式）：按默认收起
    return false;
  }
}

/** 手机上（视口 < 640，同 index.vue 的窄排布）默认头像，其余默认表格；进页面时定下来，之后转屏 / 缩放窗口不跟着变 */
const initialView = (): ViewMode =>
  isClient && window.innerWidth < 640 ? View.GRID : View.TABLE;

/**
 * 敌人一览的全部状态：筛选 / 搜索 / 排序 / 显示方式 / 分页，结果都由它算出。
 * 根组件 createEnemyList 后 provide 下去，子组件 useEnemyList 取；不走 pinia——外壳预渲染（src/prerender/）不装插件。
 */
export function createEnemyList(source: readonly EnemyData[]) {
  const enemies = source.map(toEnemy);
  const filterById = reactive(createFilters());
  const filters = Object.values(filterById) as FilterState[];
  const quick = QUICK_FILTERS.map((def) => filterById[def.id]) as FilterState[];
  const stats = STAT_FILTERS.map((def) => filterById[def.id]) as FilterState[];
  const defaultView = initialView();
  const state = reactive<HashState & { page: number; step: number }>({
    ...readHash("", [], defaultView),
    page: 1,
    step: PAGE_STEPS[0],
  });
  const advanced = reactive({ open: loadAdvanced() });
  watch(advanced, () => {
    try {
      localStorage.setItem(ADVANCED_KEY, advanced.open ? "1" : "0");
    } catch {
      // 隐私模式等写不进去：只是下次不记得
    }
  });

  /* ── 筛选 → 排序 → 分页 ── */
  const failed = computed(() =>
    failedFilters(enemies, filters, normalizeNeedle(state.q)),
  );
  /** 各行里会筛出 0 条的选项（按字段名取） */
  const empties = computed(
    () => new Map(filters.map((f) => [f.id, emptyOptions(f, failed.value)])),
  );
  const list = computed(() => {
    const matched = [];
    for (const [enemy, fails] of failed.value)
      if (fails.length === 0) matched.push(enemy);
    return sortEnemies(matched, state.sort);
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

  /** 当前按哪项属性排序（不是按属性排则为 null）：表格给那一列铺底色，头像卡上带出等级 */
  const sortStat = computed<StatKey | null>(() =>
    isStatKey(state.sort.key) ? state.sort.key : null,
  );

  /* ── 分享链接 ── */
  /** 当前状态的 # 参数（不含 #），「复制链接」用 */
  const hash = computed(() => buildHash(filters, state, defaultView));
  /** 按 # 参数重置筛选与其余状态（打开页面时、hashchange 时） */
  function load(hash: string) {
    Object.assign(state, readHash(hash, filters, defaultView));
    // 链接里带着属性筛选：面板展开，不然那几个条件只在结果栏里看得到
    if (stats.some((f) => f.selected.size > 0)) advanced.open = true;
  }

  /* ── 操作 ── */
  function toggle(f: FilterState, id: string) {
    if (!hasOption(f, id)) return;
    if (f.selected.has(id)) f.selected.delete(id);
    else f.selected.add(id);
  }
  function clear(f: FilterState) {
    f.selected.clear();
  }
  /** 清除全部条件：筛选与搜索回默认；排序 / 显示方式不动 */
  function reset() {
    for (const f of filters) f.selected.clear();
    state.q = "";
  }
  function setSortKey(key: SortKey) {
    state.sort = { key, dir: firstDir(key) };
  }
  function flipSort() {
    state.sort = { key: state.sort.key, dir: state.sort.dir > 0 ? -1 : 1 };
  }
  /** 点表头：先排 → 反向 → 回到默认（图鉴顺序） */
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
    enemies,
    filters,
    quick,
    stats,
    filterById,
    state,
    advanced,
    empties,
    list,
    page,
    pageCount,
    pageList,
    sortStat,
    hash,
    load,
    toggle,
    clear,
    reset,
    setSortKey,
    flipSort,
    cycleSort,
    setStep,
    setPage,
    setView,
  };
}

export type EnemyList = ReturnType<typeof createEnemyList>;
export const enemyListKey: InjectionKey<EnemyList> = Symbol("EnemiesListV2");

export function useEnemyList() {
  const store = inject(enemyListKey);
  if (!store) throw new Error("useEnemyList() 要在敌人一览的根组件里面调用");
  return store;
}
