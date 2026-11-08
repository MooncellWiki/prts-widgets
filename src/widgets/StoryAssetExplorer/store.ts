import {
  computed,
  inject,
  onScopeDispose,
  reactive,
  shallowRef,
  watch,
  type InjectionKey,
} from "vue";

import { useTimeoutFn } from "@vueuse/core";

import { fetchExplore, type ExploreQuery } from "./explore";
import {
  ensureCharacterMap,
  isCharacterCategory,
  isResourceType,
  normalizeResourceQuery,
  type CharacterCategory,
  type CharacterLinkMap,
  type Entry,
  type ExploreResponse,
  type Resource,
  type StoryResourceType,
} from "./utils";

export type SortKey = "id" | "count";
export type ViewMode = "card" | "wall";

export interface Sort {
  key: SortKey;
  /** 1 升 / -1 降 */
  dir: 1 | -1;
}

interface ExplorerState {
  type: StoryResourceType;
  q: string;
  sort: Sort;
  view: ViewMode;
  cat: CharacterCategory | "";
  /** 角色按 base 合并成一格（同改版前每个角色只列第一张） */
  merge: boolean;
  page: number;
  step: number;
}

export const DEFAULT_SORT: Sort = { key: "id", dir: 1 };
export const PAGE_STEPS: Record<ViewMode, readonly number[]> = {
  card: [30, 60, 120],
  wall: [100, 200, 500],
};
const DEFAULT_STEP: Record<ViewMode, number> = { card: 60, wall: 200 };

/** 搜索框停手多久才发请求 */
const SEARCH_DEBOUNCE = 250;

/** 资源名远比这短。粘贴整段文字时截断，别拼出后端不收的超长请求 */
const MAX_SEARCH_LENGTH = 512;

const EMPTY_COUNTS = { character: 0, background: 0, image: 0, item: 0 };
const EMPTY_CATEGORIES = { operator: 0, npc: 0, other: 0 };

const WEBP_PROBE_SRC =
  "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

/** 缩略图要不要转 WebP：解码一张 1×1 的 WebP 看看（比列表接口快得多，首屏缩略图不会先 PNG 再 WebP 地取两遍） */
function probeWebp(): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    // 兜底：什么事件都不来（非浏览器环境）时别把列表一直卡在第一页
    const timer = setTimeout(() => resolve(false), 1000);
    const finish = (supported: boolean) => {
      clearTimeout(timer);
      resolve(supported);
    };
    image.addEventListener("load", () => finish(image.width > 0));
    image.addEventListener("error", () => finish(false));
    image.src = WEBP_PROBE_SRC;
  });
}

/** 一次加载要顺带做的事：focus 让后端定位资源，moveTo 是跨页切详情的目标位置 */
interface LoadIntent {
  focus?: string;
  moveTo?: number;
}

/** 结果里第 index 格（跨页连续编号，从 0 数）；不在这一页时是 undefined */
function entryAt(data: ExploreResponse, index: number): Entry | undefined {
  return data.entries[index - (data.page - 1) * data.pageSize];
}

/** 写进分享链接的状态（# 参数），见 readHash / buildHash */
export interface HashState {
  type?: StoryResourceType;
  q?: string;
  sort?: Sort;
  view?: ViewMode;
  cat?: CharacterCategory | "";
  merge?: boolean;
  /** 打开着的资源 */
  open?: string;
  /** 打开着的资源里选中的表情 */
  face?: string;
}

/**
 * 分享链接的 # 参数：type / q / sort（id-a、count-d …）/ view（card、wall）/ cat（operator、npc、other）/
 * merge（0 = 不按角色合并）/ open（打开详情的资源名）/ face（详情里选中的表情）。
 * 同干员 / 敌人一览：只在打开页面和地址栏的 # 变了时读，不往回写，分享走「复制链接」。
 */
export function readHash(hash: string): HashState {
  const state: HashState = {};
  for (const [key, value] of new URLSearchParams(hash.replace(/^#/u, ""))) {
    switch (key) {
      case "type": {
        if (isResourceType(value)) state.type = value;
        break;
      }
      case "q": {
        state.q = value;
        break;
      }
      case "sort": {
        const match = /^(id|count)-([ad])$/u.exec(value);
        if (match)
          state.sort = {
            key: match[1] as SortKey,
            dir: match[2] === "a" ? 1 : -1,
          };
        break;
      }
      case "view": {
        if (value === "card" || value === "wall") state.view = value;
        break;
      }
      case "cat": {
        if (isCharacterCategory(value)) state.cat = value;
        break;
      }
      case "merge": {
        state.merge = value !== "0";
        break;
      }
      case "open": {
        state.open = value;
        break;
      }
      case "face": {
        state.face = value;
        break;
      }
    }
  }
  return state;
}

export function buildHash(
  state: Required<Omit<HashState, "open" | "face">> &
    Pick<HashState, "open" | "face">,
): string {
  const params = new URLSearchParams();
  params.set("type", state.type);
  if (state.q) params.set("q", state.q);
  if (
    state.sort.key !== DEFAULT_SORT.key ||
    state.sort.dir !== DEFAULT_SORT.dir
  )
    params.set("sort", `${state.sort.key}-${state.sort.dir > 0 ? "a" : "d"}`);
  if (state.view !== "card") params.set("view", state.view);
  if (state.type === "character") {
    if (state.cat) params.set("cat", state.cat);
    if (!state.merge) params.set("merge", "0");
  }
  if (state.open) params.set("open", state.open);
  if (state.open && state.face) params.set("face", state.face);
  return params.toString();
}

export function createExplorer(initial: { type?: string; id?: string }) {
  const state = reactive<ExplorerState>({
    type: isResourceType(initial.type) ? initial.type : "character",
    q: initial.id ?? "",
    sort: { ...DEFAULT_SORT },
    view: "card",
    cat: "",
    merge: true,
    page: 1,
    step: DEFAULT_STEP.card,
  });

  /** 详情：打开着的资源（当前类型里的资源名）与选中的表情 */
  const detail = reactive<{ id: string | null; face: string | null }>({
    id: null,
    face: null,
  });

  /**
   * 最近一次成功的响应和它所属的类型。新响应到之前一直留着，
   * 翻页、搜索、请求失败时结果和分页都不用先消失一次。
   */
  const result = shallowRef<
    (ExploreResponse & { type: StoryResourceType }) | null
  >(null);
  /** 详情打开的那一格：可能不在当前页，也可能不符合当前筛选 */
  const selection = shallowRef<Entry | null>(null);
  const status = shallowRef<"idle" | "loading" | "done" | "error">("idle");
  const error = shallowRef("");

  const webp = shallowRef(false);
  const webpReady = probeWebp().then((supported) => {
    webp.value = supported;
  });

  const links = shallowRef<CharacterLinkMap | null>(null);
  const linksError = shallowRef(false);

  function loadLinks(): void {
    if (links.value) return;
    linksError.value = false;
    ensureCharacterMap()
      .then((map) => {
        links.value = map;
      })
      .catch((cause: unknown) => {
        console.warn("[StoryAssetExplorer] character.json", cause);
        linksError.value = true;
      });
  }

  // 角色页签的缩略图要 character.json。只在切到角色页签时取，失败了也别跟着每次按键重取
  watch(
    () => state.type === "character",
    (need) => {
      if (need) loadLinks();
    },
  );

  const query = computed(() => ({
    terms: normalizeResourceQuery(state.q).split(/\s+/u).filter(Boolean),
  }));
  /** 发给后端的搜索词：它没变（比如只多打了个空格）就不用重新请求 */
  const search = computed(() =>
    query.value.terms.join(" ").slice(0, MAX_SEARCH_LENGTH),
  );

  /** 当前页签的结果。刚换页签时旧结果不属于它，但类型和分类的计数对哪个页签都成立 */
  const current = computed(() =>
    result.value?.type === state.type ? result.value : null,
  );
  /** 拿到过数据没有：没有时计数空着，不显示 0 */
  const loaded = computed(() => result.value !== null);
  const pageList = computed(() => current.value?.entries ?? []);
  const counts = computed(() => result.value?.counts ?? EMPTY_COUNTS);
  const categoryCounts = computed(
    () => result.value?.categoryCounts ?? EMPTY_CATEGORIES,
  );
  const matchedTotal = computed(
    () => current.value?.matchedTotal ?? counts.value[state.type],
  );
  const total = computed(() => current.value?.total ?? matchedTotal.value);
  /** 分页跟着目标页走，响应没到时就高亮刚点的那页 */
  const page = computed(() => state.page);
  const pageCount = computed(
    () =>
      current.value?.pageCount ??
      Math.max(1, Math.ceil(matchedTotal.value / state.step)),
  );

  /** 当前页加上详情那一格：详情里的资源可能不在当前页 */
  const knownEntries = computed(() =>
    selection.value ? [...pageList.value, selection.value] : pageList.value,
  );

  /** 已知各 base 的全部条目（自然顺序）：详情里的「同一角色」从这里取 */
  const bases = computed(() => {
    const map = new Map<string, readonly Resource[]>();
    for (const entry of knownEntries.value) {
      if (entry.resource.type === state.type && entry.resource.base)
        map.set(entry.resource.base, entry.members);
    }
    return map;
  });

  /** 当前类型里按资源名找 */
  function find(id: string): Resource | undefined {
    for (const entry of knownEntries.value) {
      if (entry.resource.type !== state.type) continue;
      const item = entry.members.find((member) => member.id === id);
      if (item) return item;
    }
    return undefined;
  }

  /** 详情里打开的资源在结果里的位置（合并时按它所在的那一格算） */
  const detailIndex = computed(() => {
    const data = current.value;
    if (!data) return -1;
    const index = data.entries.findIndex(
      (entry) =>
        entry.resource.id === detail.id ||
        (entry.merged > 1 &&
          entry.members.some((member) => member.id === detail.id)),
    );
    return index < 0 ? -1 : (data.page - 1) * data.pageSize + index;
  });

  /** idle：还没 start，筛选变了也不取；disposed：卸载了，什么都不再取 */
  let phase: "idle" | "running" | "disposed" = "idle";
  /** 最近一次加载的 controller。被顶掉或卸载时 abort，响应回来时 signal.aborted 就说明它过期了 */
  let controller: AbortController | undefined;
  /** 最近一次失败的加载，连同当时打开着的详情：reload 照原样重试 */
  let failed: { intent: LoadIntent; opened: string | null } | undefined;
  /** 筛选变了以后排队的加载：搜索等停手，别的等同一轮里改完 */
  let queueDelay = 0;
  const queued = useTimeoutFn(reload, () => queueDelay, { immediate: false });

  /** 作废进行中和排队中的加载（之前失败的也不再续接），进入 loading */
  function supersede(): void {
    controller?.abort();
    queued.stop();
    failed = undefined;
    status.value = "loading";
    error.value = "";
  }

  /** 发给后端的查询：当前筛选、排序和分页 */
  function exploreQuery(focus?: string): ExploreQuery {
    return {
      type: state.type,
      q: search.value,
      groupBy: state.merge ? "base" : "resource",
      sort: state.sort.key === "count" ? "scriptCount" : "id",
      order: state.sort.dir < 0 ? "desc" : "asc",
      page: state.page,
      pageSize: state.step,
      category: state.cat || undefined,
      focus,
    };
  }

  /**
   * 取当前这一页和它的全部统计，不翻 cursor，也不预取别的类型；会顶掉进行中的加载。
   * start 之前和卸载以后什么都不做。
   */
  async function load(intent: LoadIntent = {}): Promise<void> {
    if (phase !== "running") return;
    supersede();
    controller = new AbortController();
    const { signal } = controller;
    const opened = detail.id;
    const type = state.type;
    try {
      // 第一页和 WebP 探测一起等：缩略图第一次渲染时格式就定了
      const [data] = await Promise.all([
        fetchExplore(exploreQuery(intent.focus), signal),
        webpReady,
      ]);
      if (signal.aborted) return;
      // 后端可能把超出末页的页码夹回来，或者按 focus 换到资源所在的页
      state.page = data.page;
      result.value = { ...data, type };
      // 等响应的时候详情换了或关了，就别再动它
      const stillOpen = detail.id === opened;
      if (intent.focus && stillOpen) selection.value = data.selection;
      status.value = "done";
      if (intent.moveTo !== undefined && stillOpen && opened) {
        const entry = entryAt(data, intent.moveTo);
        if (entry) open(entry.resource.id, entry.face);
      }
    } catch (cause) {
      if (signal.aborted) return;
      console.warn("[StoryAssetExplorer]", cause);
      failed = { intent, opened };
      status.value = "error";
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function reload(): Promise<void> {
    // 重试保留原来的定位 / 跨页目标；换筛选或打开别的详情后不再续接旧跳转。
    if (failed && failed.opened === detail.id) return load(failed.intent);
    return load({ focus: detail.id ?? undefined });
  }

  function start(): Promise<void> {
    if (phase !== "idle") return Promise.resolve();
    phase = "running";
    if (state.type === "character") loadLinks();
    return load({ focus: detail.id ?? undefined });
  }

  /** 筛选变了：回到第一页，等 delay 再取。watch 用 sync，同一轮里连改几项时先作废旧请求、只排一次 */
  function refilter(delay: number): void {
    if (phase !== "running") return;
    state.page = 1;
    supersede();
    queueDelay = delay;
    queued.start();
  }

  watch(search, () => refilter(SEARCH_DEBOUNCE), { flush: "sync" });
  watch(
    [
      () => state.type,
      () => state.cat,
      () => state.merge,
      () => state.sort.key,
      () => state.sort.dir,
    ],
    () => refilter(0),
    { flush: "sync" },
  );

  // 排队的加载 useTimeoutFn 会自己停
  onScopeDispose(() => {
    phase = "disposed";
    controller?.abort();
  });

  function setType(type: StoryResourceType): void {
    if (state.type !== type) close();
    state.type = type;
  }

  function setSortKey(key: SortKey): void {
    // 按资源名默认升序，按剧本数默认降序（用得多的在前）
    state.sort = { key, dir: key === "count" ? -1 : 1 };
  }

  function flipSort(): void {
    state.sort = { key: state.sort.key, dir: state.sort.dir > 0 ? -1 : 1 };
  }

  /** 换显示方式：每页条数换成那种方式的默认值，停在原来第一格所在的那页 */
  function setView(view: ViewMode): void {
    if (view === state.view) return;
    state.view = view;
    setStep(DEFAULT_STEP[view]);
  }

  function setStep(step: number): void {
    if (step === state.step) return;
    const first = (state.page - 1) * state.step;
    state.step = step;
    state.page = Math.floor(first / step) + 1;
    load();
  }

  function setPage(n: number): void {
    const next = Math.min(Math.max(1, n), pageCount.value);
    if (next === state.page) return;
    state.page = next;
    load();
  }

  function reset(): void {
    state.q = "";
    state.cat = "";
  }

  /** 打开详情；face 是要选中的表情（按表情名搜到时） */
  function open(id: string, face: string | null = null): void {
    detail.id = id;
    detail.face = face;
    const entry = pageList.value.find((item) =>
      item.members.some((member) => member.id === id),
    );
    if (entry) selection.value = entry;
    // members 含其他页的同角色立绘，缓存命中不代表它在当前结果页；眼前的结果过时了也要让后端定位
    if (status.value !== "done" || detailIndex.value < 0) load({ focus: id });
  }

  function close(): void {
    detail.id = null;
    detail.face = null;
    selection.value = null;
  }

  /** 详情里上一个 / 下一个：沿着当前结果走，跨页时只取相邻那一页，关掉详情时停在那里 */
  async function move(delta: number): Promise<void> {
    const data = current.value;
    const index = detailIndex.value;
    const target = index + delta;
    if (
      !data ||
      status.value === "loading" ||
      index < 0 ||
      target < 0 ||
      target >= data.matchedTotal
    )
      return;
    // 跨页失败时 state.page 已经是目标页，眼前的 entries 还是旧页：这里只认实际加载的那页
    const nextPage = Math.floor(target / data.pageSize) + 1;
    if (nextPage === data.page) {
      const entry = entryAt(data, target);
      if (entry) open(entry.resource.id, entry.face);
    } else {
      state.page = nextPage;
      await load({ moveTo: target });
    }
  }

  function applyHash(hash: HashState): void {
    if (hash.type) setType(hash.type);
    if (hash.q !== undefined) state.q = hash.q;
    if (hash.sort) state.sort = hash.sort;
    if (hash.view) setView(hash.view);
    if (hash.cat !== undefined) state.cat = hash.cat;
    if (hash.merge !== undefined) state.merge = hash.merge;
    if (hash.open) open(hash.open, hash.face ?? null);
  }

  /** 分享链接：当前的页签 / 搜索 / 排序 / 显示方式 / 分类；withDetail 时带上打开着的资源和表情 */
  function shareLink(withDetail = false): string {
    const hash = buildHash({
      type: state.type,
      q: state.q,
      sort: state.sort,
      view: state.view,
      cat: state.cat,
      merge: state.merge,
      open: withDetail ? (detail.id ?? undefined) : undefined,
      face: withDetail ? (detail.face ?? undefined) : undefined,
    });
    return `${location.origin}${location.pathname}${location.search}#${hash}`;
  }

  return {
    state,
    detail,
    status,
    error,
    loaded,
    webp,
    links,
    linksError,
    bases,
    query,
    counts,
    categoryCounts,
    total,
    matchedTotal,
    page,
    pageCount,
    pageList,
    detailIndex,
    shareLink,
    start,
    reload,
    loadLinks,
    setType,
    setSortKey,
    flipSort,
    setView,
    setStep,
    setPage,
    reset,
    find,
    open,
    close,
    move,
    applyHash,
  };
}

export type Explorer = ReturnType<typeof createExplorer>;

export const explorerKey: InjectionKey<Explorer> = Symbol("StoryAssetExplorer");

export function useExplorer(): Explorer {
  const explorer = inject(explorerKey);
  if (!explorer) throw new Error("useExplorer() 要在 StoryAssetExplorer 里用");
  return explorer;
}
