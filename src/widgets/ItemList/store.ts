import { computed, reactive, shallowRef, watch } from "vue";

import { defineStore } from "pinia";

import { DEFAULT_STEP, firstDir, type SortKey, type ViewMode } from "./consts";
import { FILTER_IDS, hasOption, type FilterId } from "./filters";
import { buildHash, readHash, type HashState } from "./hash";
import { emptyOptions, filterItems, normalizeNeedle, sortItems } from "./query";

import type { Item } from "./item";

/**
 * 道具一览的全部状态：筛选 / 搜索 / 排序 / 显示方式 / 分页，以及和地址栏 # 参数的同步。
 * 筛选项写在 filters.ts；道具数据来自模板输出的 DOM，index.vue 挂载时 init() 灌进来，各块组件直接取用。
 */
export const useItemListStore = defineStore("itemList", () => {
  const items = shallowRef<Item[]>([]);
  const state = reactive<HashState & { page: number; step: number }>({
    ...readHash(""),
    page: 1,
    step: DEFAULT_STEP,
  });

  /* ── 筛选 → 排序 → 分页 ── */
  const needle = computed(() => normalizeNeedle(state.q));
  const list = computed(() =>
    sortItems(
      filterItems(items.value, state.selection, needle.value),
      state.sort,
    ),
  );
  /** 各行里点了也不会多出道具的选项（芯片压淡） */
  const empties = computed(() =>
    emptyOptions(items.value, state.selection, needle.value),
  );
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

  /* ── 地址栏 ── */
  const hash = computed(() => buildHash(state));
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
    Object.assign(state, readHash(location.hash));
  }

  function init(source: Item[]) {
    items.value = source;
    syncFromHash();
  }

  /* ── 操作 ── */
  function toggle(id: FilterId, option: string) {
    if (!hasOption(id, option)) return;
    const selected = state.selection[id];
    if (selected.has(option)) selected.delete(option);
    else selected.add(option);
  }
  function clear(id: FilterId) {
    state.selection[id].clear();
  }
  /** 清除全部条件：筛选与搜索都清空（默认选着的「材料」也清掉）；排序 / 显示方式不动 */
  function reset() {
    for (const id of FILTER_IDS) state.selection[id].clear();
    state.q = "";
  }
  function setSortKey(key: SortKey) {
    state.sort = { key, dir: firstDir(key) };
  }
  function flipSort() {
    state.sort = { key: state.sort.key, dir: state.sort.dir > 0 ? -1 : 1 };
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
    items,
    state,
    list,
    empties,
    page,
    pageCount,
    pageList,
    init,
    syncFromHash,
    toggle,
    clear,
    reset,
    setSortKey,
    flipSort,
    setStep,
    setPage,
    setView,
  };
});
