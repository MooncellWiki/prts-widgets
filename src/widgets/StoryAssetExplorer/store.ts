import {
  computed,
  inject,
  onScopeDispose,
  reactive,
  shallowRef,
  watch,
  type InjectionKey,
} from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import {
  ensureCharacterMap,
  isCharacterCategory,
  isResourceType,
  normalizeResourceQuery,
  type CharacterCategory,
  type CharacterLinkMap,
  type StoryResourceSummary,
  type StoryResourceType,
} from "./utils";

export type SortKey = "id" | "count";
export type ViewMode = "card" | "wall";
export interface Sort {
  key: SortKey;
  dir: 1 | -1;
}
export interface Resource extends StoryResourceSummary {
  base: string | null;
  category: CharacterCategory | null;
}
export interface Entry {
  resource: Resource;
  members: readonly Resource[];
  merged: number;
  /** 后端按整个角色组去重后的剧本数 */
  count: number;
  face: string | null;
}
export interface ExploreResponse {
  entries: Entry[];
  selection: Entry | null;
  focusIndex: number | null;
  total: number;
  matchedTotal: number;
  counts: Record<StoryResourceType, number>;
  categoryCounts: Record<CharacterCategory, number>;
  page: number;
  pageSize: number;
  pageCount: number;
  updatedAt: string | null;
}
interface ExplorerState {
  type: StoryResourceType;
  q: string;
  sort: Sort;
  view: ViewMode;
  cat: CharacterCategory | "";
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
const EMPTY_COUNTS = { character: 0, background: 0, image: 0, item: 0 };
const EMPTY_CATEGORIES = { operator: 0, npc: 0, other: 0 };
const WEBP_PROBE_SRC =
  "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";
function probeWebp(): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
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
  const detail = reactive<{ id: string | null; face: string | null }>({
    id: null,
    face: null,
  });
  const result = shallowRef<ExploreResponse | null>(null);
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

  const query = computed(() => ({
    terms: normalizeResourceQuery(state.q).split(/\s+/u).filter(Boolean),
  }));
  const pageList = computed(() => result.value?.entries ?? []);
  const counts = computed(() => result.value?.counts ?? EMPTY_COUNTS);
  const categoryCounts = computed(
    () => result.value?.categoryCounts ?? EMPTY_CATEGORIES,
  );
  const total = computed(() => result.value?.total ?? 0);
  const matchedTotal = computed(() => result.value?.matchedTotal ?? 0);
  const page = computed(() => result.value?.page ?? state.page);
  const pageCount = computed(() => result.value?.pageCount ?? 1);
  const bases = computed(() => {
    const map = new Map<string, readonly Resource[]>();
    for (const entry of [
      ...pageList.value,
      ...(selection.value ? [selection.value] : []),
    ]) {
      if (entry.resource.type === state.type && entry.resource.base)
        map.set(entry.resource.base, entry.members);
    }
    return map;
  });
  function find(id: string): Resource | undefined {
    for (const entry of [
      ...pageList.value,
      ...(selection.value ? [selection.value] : []),
    ]) {
      if (entry.resource.type !== state.type) continue;
      const item = entry.members.find((member) => member.id === id);
      if (item) return item;
    }
    return undefined;
  }
  const detailIndex = computed(() => {
    const index = pageList.value.findIndex(
      (entry) =>
        entry.resource.id === detail.id ||
        (entry.merged > 1 &&
          entry.members.some((member) => member.id === detail.id)),
    );
    return index < 0 ? -1 : (page.value - 1) * state.step + index;
  });

  let started = false;
  let updating = false;
  let disposed = false;
  let request = 0;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let failedRequest:
    { focus?: string; moveTo?: number; opened: string | null } | undefined;

  function cancel(): void {
    clearTimeout(timer);
    controller?.abort();
    failedRequest = undefined;
    request++;
  }

  /** One page and all its facets. Never follow cursors or preload other types. */
  async function loadPage(focus?: string, moveTo?: number): Promise<void> {
    cancel();
    if (disposed) return;
    const token = request;
    const opened = detail.id;
    controller = new AbortController();
    status.value = "loading";
    error.value = "";
    result.value = null;
    const params = new URLSearchParams({
      type: state.type,
      q: state.q,
      groupBy: state.merge ? "base" : "resource",
      sort: state.sort.key === "count" ? "scriptCount" : "id",
      order: state.sort.dir < 0 ? "desc" : "asc",
      page: String(state.page),
      pageSize: String(state.step),
    });
    if (state.cat) params.set("category", state.cat);
    if (focus) params.set("focus", focus);
    try {
      const [resp] = await Promise.all([
        fetch(`${TORAPPU_ENDPOINT}/api/v1/story-resources/explore?${params}`, {
          signal: controller.signal,
        }),
        webpReady,
      ]);
      if (!resp.ok) throw new Error(`story-resources/explore ${resp.status}`);
      const data = (await resp.json()) as ExploreResponse;
      if (token !== request || disposed) return;
      updating = true;
      state.page = data.page;
      updating = false;
      result.value = data;
      if (focus && detail.id === opened) selection.value = data.selection;
      status.value = "done";
      if (moveTo !== undefined && detail.id === opened && opened) {
        const entry = data.entries[moveTo - (data.page - 1) * data.pageSize];
        if (entry) open(entry.resource.id, entry.face);
      }
    } catch (cause) {
      if (token !== request || disposed) return;
      console.warn("[StoryAssetExplorer]", cause);
      failedRequest = { focus, moveTo, opened };
      status.value = "error";
      error.value = cause instanceof Error ? cause.message : String(cause);
    }
  }

  function reload(): Promise<void> {
    // 重试保留原来的定位 / 跨页目标；换筛选或打开别的详情后不再续接旧跳转。
    if (failedRequest && failedRequest.opened === detail.id)
      return loadPage(failedRequest.focus, failedRequest.moveTo);
    return loadPage(detail.id && detailIndex.value < 0 ? detail.id : undefined);
  }
  function start(): Promise<void> {
    if (started) return Promise.resolve();
    started = true;
    if (state.type === "character") loadLinks();
    return loadPage(detail.id ?? undefined);
  }

  watch(
    () => [
      state.type,
      state.q,
      state.cat,
      state.merge,
      state.sort.key,
      state.sort.dir,
      state.page,
      state.step,
    ],
    (next, previous) => {
      if (updating || !started) return;
      const filtersChanged = next
        .slice(0, 6)
        .some((value, index) => value !== previous[index]);
      updating = true;
      if (filtersChanged) state.page = 1;
      updating = false;
      cancel();
      result.value = null;
      status.value = "loading";
      error.value = "";
      if (state.type === "character") loadLinks();
      timer = setTimeout(
        () => {
          reload();
        },
        next[1] !== previous[1] ? 250 : 0,
      );
    },
    { flush: "sync" },
  );
  onScopeDispose(() => {
    disposed = true;
    cancel();
  });

  function setType(type: StoryResourceType): void {
    if (state.type !== type) close();
    state.type = type;
  }
  function setSortKey(key: SortKey): void {
    state.sort = { key, dir: key === "count" ? -1 : 1 };
  }
  function flipSort(): void {
    state.sort = { ...state.sort, dir: state.sort.dir > 0 ? -1 : 1 };
  }
  function setView(view: ViewMode): void {
    if (view === state.view) return;
    state.view = view;
    setStep(DEFAULT_STEP[view]);
  }
  function setStep(step: number): void {
    const first = (page.value - 1) * state.step;
    updating = true;
    state.page = Math.floor(first / step) + 1;
    updating = false;
    state.step = step;
  }
  function setPage(n: number): void {
    state.page = Math.min(Math.max(1, n), pageCount.value);
  }
  function reset(): void {
    state.q = "";
    state.cat = "";
  }

  function open(id: string, face: string | null = null): void {
    detail.id = id;
    detail.face = face;
    const entry = pageList.value.find((item) =>
      item.members.some((member) => member.id === id),
    );
    if (entry) selection.value = entry;
    // members 含其他页的同角色立绘，缓存命中不代表它在当前结果页。
    if (started && detailIndex.value < 0) loadPage(id);
  }
  function close(): void {
    detail.id = null;
    detail.face = null;
    selection.value = null;
  }
  async function move(delta: number): Promise<void> {
    const index = detailIndex.value;
    const target = index + delta;
    if (
      status.value === "loading" ||
      index < 0 ||
      target < 0 ||
      target >= matchedTotal.value
    )
      return;
    const nextPage = Math.floor(target / state.step) + 1;
    if (nextPage === page.value) {
      const entry = pageList.value[target % state.step];
      if (entry) open(entry.resource.id, entry.face);
    } else {
      updating = true;
      state.page = nextPage;
      updating = false;
      await loadPage(undefined, target);
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
