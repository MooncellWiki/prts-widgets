import { computed, inject, reactive, watch, type InjectionKey } from "vue";

import { PRTS_BASE_DOMAIN } from "@/utils/consts";

import {
  DEFAULT_SORT,
  DEFAULT_STEP,
  EMBED_STEP,
  firstDir,
  LIST_PAGE,
  OP_SORT_KEYS,
  type SortKey,
  View,
  type ViewMode,
} from "./consts";
import {
  buffPass,
  charPass,
  createFilters,
  emptyOptions,
  FILTER_IDS,
  hasOption,
  holderActive,
  normalizeNeedle,
  type FilterState,
  type Query,
} from "./filter";
import { buildHash, readHash, type HashState } from "./hash";
import { sortBuffs, sortChars } from "./sort";

import type { Room, Source } from "./data";

/** 设施页嵌着的那份：room 写设施的游戏 ID（MANUFACTURE）或名字（制造站），认不出来就当一览页 */
export function resolveRoom(source: Source, room = ""): Room | undefined {
  const key = room.trim();
  if (!key) return undefined;
  const found = source.rooms.find(
    (r) => r.id === key.toUpperCase() || r.name === key,
  );
  if (!found) console.warn("[BaseSkillList] 认不出的设施", key);
  return found;
}

/**
 * 后勤技能一览的全部状态：筛选 / 搜索 / 排序 / 显示方式 / 分页，结果都由它算出。
 * 根组件 createBaseSkillList 后 provide 下去，子组件 useBaseSkillList 取；不走 pinia——
 * 外壳预渲染（src/prerender/）不装插件，设施页上也可能有不止一份。
 * 指定了 room 是设施页里嵌着的那份：只看这个设施、没有设施那一行、不碰地址栏。
 */
export function createBaseSkillList(
  source: Source,
  options: { room?: string } = {},
) {
  const room = resolveRoom(source, options.room);
  const filters = createFilters(source);
  for (const id of FILTER_IDS) filters[id].selected = reactive(new Set());
  const rows = FILTER_IDS.map((id) => filters[id]);

  const state = reactive<HashState & { page: number; step: number }>({
    q: "",
    sort: { ...DEFAULT_SORT },
    view: View.SKILL,
    page: 1,
    step: room ? EMBED_STEP : DEFAULT_STEP,
  });
  /** 持有干员点开了「+N」的技能 */
  const expanded = reactive(new Set<number>());

  const buffs = room
    ? source.buffs.filter((b) => b.room === room)
    : source.buffs;
  const chars = room
    ? source.chars.filter((c) =>
        c.slots.some((chain) => chain.some((h) => h.buff.room === room)),
      )
    : source.chars;

  /* ── 筛选 → 排序 → 分页 ── */
  const query = computed<Query>(() => ({
    filters,
    needle: normalizeNeedle(state.q),
    room,
  }));
  const buffList = computed(() =>
    sortBuffs(
      buffs.filter((b) => buffPass(b, query.value)),
      state.sort,
    ),
  );
  const charList = computed(() =>
    state.view === View.OP
      ? sortChars(
          chars.filter((c) => charPass(c, query.value)),
          state.sort,
        )
      : [],
  );
  const empties = computed(() => emptyOptions(buffs, query.value));
  /** 持有者那三行有没有选着 */
  const holderFiltered = computed(() => holderActive(filters));

  const shown = computed(() =>
    state.view === View.OP ? charList.value.length : buffList.value.length,
  );
  const total = computed(() =>
    state.view === View.OP ? chars.length : buffs.length,
  );
  const pageCount = computed(() =>
    Math.max(1, Math.ceil(shown.value / state.step)),
  );
  const page = computed(() =>
    Math.min(Math.max(1, state.page), pageCount.value),
  );
  const slice = <T>(list: readonly T[]) =>
    list.slice((page.value - 1) * state.step, page.value * state.step);
  const pageBuffs = computed(() => slice(buffList.value));
  const pageChars = computed(() => slice(charList.value));
  watch([buffList, charList], () => {
    state.page = 1;
  });

  /** 按游戏顺序排时按设施分组（组头吸顶）；设施页里只有一个设施，不分 */
  const grouped = computed(() => !room && state.sort.key === "order");

  /** 作用对象行出哪几个设施的段：一览页上是选着的、带作用对象的设施；设施页上就是这个设施 */
  const targetRooms = computed(() =>
    room
      ? room.targets.length > 0
        ? [room]
        : []
      : source.rooms.filter(
          (r) => r.targets.length > 0 && filters.room.selected.has(r.id),
        ),
  );
  // 段藏起来了，这一段里选着的也清掉，不然结果栏里还挂着看不见的条件
  watch(targetRooms, (list) => {
    for (const id of [...filters.target.selected])
      if (!list.some((r) => r.targets.some((t) => t.id === id)))
        filters.target.selected.delete(id);
  });

  /* ── 地址栏 ── */
  const hash = computed(() => buildHash(filters, state));
  /** 「复制链接」：一览页就是当前地址；设施页给一览页的链接，带上这个设施 */
  function shareLink() {
    if (!room)
      return `${location.origin}${location.pathname}${location.search}${
        hash.value ? `#${hash.value}` : ""
      }`;
    const extra = hash.value ? `&${hash.value}` : "";
    return `${PRTS_BASE_DOMAIN}/w/${encodeURIComponent(LIST_PAGE)}#room=1-${room.id}${extra}`;
  }
  /** 按 # 参数重置筛选与其余状态（一览页打开时、地址栏的 # 变了时） */
  function load(h: string) {
    Object.assign(state, readHash(h, filters));
    if (state.view === View.OP && !OP_SORT_KEYS.includes(state.sort.key))
      state.sort = { ...DEFAULT_SORT };
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
  /** 清除全部条件：筛选与搜索清空；排序 / 显示方式不动 */
  function reset() {
    for (const f of rows) f.selected.clear();
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
  /** 干员视图里效率 / 持有人数没有意义，换回游戏顺序 */
  function setView(view: ViewMode) {
    state.view = view;
    if (view === View.OP && !OP_SORT_KEYS.includes(state.sort.key))
      state.sort = { ...DEFAULT_SORT };
  }
  function expand(index: number) {
    expanded.add(index);
  }

  return {
    source,
    room,
    filters,
    rows,
    state,
    expanded,
    buffs,
    chars,
    query,
    buffList,
    charList,
    empties,
    holderFiltered,
    shown,
    total,
    page,
    pageCount,
    pageBuffs,
    pageChars,
    grouped,
    targetRooms,
    hash,
    shareLink,
    load,
    toggle,
    clear,
    reset,
    setSortKey,
    flipSort,
    setStep,
    setPage,
    setView,
    expand,
  };
}

export type BaseSkillList = ReturnType<typeof createBaseSkillList>;
export const baseSkillListKey: InjectionKey<BaseSkillList> =
  Symbol("BaseSkillList");

export function useBaseSkillList() {
  const store = inject(baseSkillListKey);
  if (!store)
    throw new Error("useBaseSkillList() 要在后勤技能一览的根组件里面调用");
  return store;
}
