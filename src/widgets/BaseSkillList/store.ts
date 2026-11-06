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
 * 后勤技能一览的全部状态：筛选 / 搜索 / 排序 / 显示方式 / 分页（干员视图）/ 设施分组的开合，结果都由它算出。
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

  /* ── 筛选 → 排序 → 分页（技能视图不分页，按设施折叠） ── */
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
    state.view === View.OP
      ? Math.max(1, Math.ceil(shown.value / state.step))
      : 1,
  );
  const page = computed(() =>
    Math.min(Math.max(1, state.page), pageCount.value),
  );
  const slice = <T>(list: readonly T[]) =>
    list.slice((page.value - 1) * state.step, page.value * state.step);
  const pageChars = computed(() => slice(charList.value));
  watch([buffList, charList], () => {
    state.page = 1;
  });

  /** 技能视图始终按设施分组（组头吸顶，排序只在组内排）；设施页里只有一个设施，不分 */
  const grouped = !room;

  /*
   * 设施分组的开合：同现网（每个设施一张默认折叠的表）默认都折叠，组头上写着条数；
   * 有了筛选 / 搜索就默认都展开，不然命中的技能还得一组组点开找。
   * 点组头翻转这一组（flipped 记和默认不一样的那些），有没有筛选一变就都回到默认。
   */
  const narrowed = computed(
    () => query.value.needle !== "" || rows.some((f) => f.selected.size > 0),
  );
  const flipped = reactive(new Set<string>());
  watch(narrowed, () => flipped.clear());
  const isOpen = (r: Room) => narrowed.value !== flipped.has(r.id);
  /** 结果里出现的设施（有组头的那些） */
  const shownRooms = computed(() => [
    ...new Set(buffList.value.map((b) => b.room)),
  ]);
  const allOpen = computed(() => shownRooms.value.every(isOpen));

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
  function toggleRoom(r: Room) {
    if (!flipped.delete(r.id)) flipped.add(r.id);
  }
  /** 全部展开 / 全部折叠 */
  function setAllOpen(open: boolean) {
    flipped.clear();
    if (open !== narrowed.value)
      for (const r of source.rooms) flipped.add(r.id);
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
    pageChars,
    grouped,
    isOpen,
    allOpen,
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
    toggleRoom,
    setAllOpen,
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
