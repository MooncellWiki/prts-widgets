import {
  computed,
  inject,
  markRaw,
  reactive,
  shallowRef,
  watch,
  type InjectionKey,
} from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import {
  RESOURCE_TYPE_OPTIONS,
  characterBaseOfListingId,
  characterCategory,
  compareResourceId,
  ensureCharacterMap,
  isCharacterCategory,
  isResourceType,
  normalizeResourceQuery,
  resolveFaceAlias,
  PAGE_LIMIT,
  type CharacterCategory,
  type CharacterLinkMap,
  type StoryResourceListResponse,
  type StoryResourceSummary,
  type StoryResourceType,
} from "./utils";

export type SortKey = "id" | "count";
export type ViewMode = "card" | "wall";

export interface Sort {
  key: SortKey;
  /** 1 升 / -1 降 */
  dir: 1 | -1;
}

/** 列表里的一条资源，带上前端算好的字段 */
export interface Resource extends StoryResourceSummary {
  /** 小写的资源名，搜索用 */
  lower: string;
  /** 角色：character.json 的 base，同一角色的各张立绘归到一起；其他类型为 null */
  base: string | null;
  category: CharacterCategory | null;
}

/** 结果里的一格 */
export interface Entry {
  resource: Resource;
  /** 同一角色的全部条目（自然顺序，含自己）；不是角色时只有自己 */
  members: readonly Resource[];
  /** 「按角色合并」时这一格代表几张立绘；不合并时为 1 */
  merged: number;
  /** 排序用的剧本数：合并时取各张立绘里最多的那个 */
  count: number;
  /** 按 `base#表情` 搜到的：那个表情 */
  face: string | null;
}

interface TypeIndex {
  items: Resource[];
  status: "idle" | "loading" | "done" | "error";
  error: string;
  /** 出错时停在哪一页，重试从这里接着取 */
  cursor: string | null;
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

/** 翻页保护：200 / 页 × 100 页，现在全部资源加起来约 6000 条 */
const INDEX_MAX_PAGES = 100;

const WEBP_PROBE_SRC =
  "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=";

/** 缩略图要不要转 WebP：解码一张 1×1 的 WebP 看看（比列表接口快得多，首屏缩略图不会先 PNG 再 WebP 地取两遍） */
function probeWebp(): Promise<boolean> {
  if (typeof Image === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image.width > 0));
    image.addEventListener("error", () => resolve(false));
    // 兜底：什么事件都不来（非浏览器环境）时别把列表一直卡在第一页
    setTimeout(() => resolve(false), 1000);
    image.src = WEBP_PROBE_SRC;
  });
}

async function fetchResourcePage(
  type: StoryResourceType,
  cursor: string | null,
): Promise<StoryResourceListResponse> {
  const params = new URLSearchParams({ type, limit: String(PAGE_LIMIT) });
  if (cursor) params.set("cursor", cursor);
  const resp = await fetch(
    `${TORAPPU_ENDPOINT}/api/v1/story-resources?${params}`,
  );
  if (!resp.ok) throw new Error(`story-resources ${resp.status}`);
  return (await resp.json()) as StoryResourceListResponse;
}

function toResource(summary: StoryResourceSummary): Resource {
  const character = summary.type === "character";
  return {
    ...summary,
    lower: summary.id.toLowerCase(),
    base: character ? characterBaseOfListingId(summary.id).toLowerCase() : null,
    category: character ? characterCategory(summary.id) : null,
  };
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
  const emptyIndex = (): TypeIndex => ({
    items: markRaw([]),
    status: "idle",
    error: "",
    cursor: null,
  });
  const indexes = reactive<Record<StoryResourceType, TypeIndex>>({
    character: emptyIndex(),
    background: emptyIndex(),
    image: emptyIndex(),
    item: emptyIndex(),
  });

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
      .catch((error: unknown) => {
        console.warn("[StoryAssetExplorer] character.json", error);
        linksError.value = true;
      });
  }

  async function loadIndex(type: StoryResourceType): Promise<void> {
    const index = indexes[type];
    if (index.status === "loading" || index.status === "done") return;
    index.status = "loading";
    index.error = "";
    try {
      // 第一页和 WebP 探测一起等：缩略图第一次渲染时格式就定了
      let first = true;
      for (let page = 0; page < INDEX_MAX_PAGES; page++) {
        const [data] = await Promise.all([
          fetchResourcePage(type, index.cursor),
          first ? webpReady : undefined,
        ]);
        first = false;
        // 接口按字节序给，这里换成自然顺序（avg_npc_9 在 avg_npc_10 前）；每页到了就重排一次，边取边显示
        const items = [...index.items, ...data.resources.map(toResource)];
        items.sort((a, b) => compareResourceId(a.id, b.id));
        index.items = markRaw(items);
        index.cursor = data.nextCursor ?? null;
        if (!index.cursor) {
          index.status = "done";
          return;
        }
      }
      // 翻页保护兜底：还有 cursor 说明没取完，按出错处理，让人看得见
      throw new Error(`超过 ${INDEX_MAX_PAGES} 页`);
    } catch (error) {
      console.warn("[StoryAssetExplorer]", error);
      index.status = "error";
      index.error = error instanceof Error ? error.message : String(error);
    }
  }

  function loadAll(): void {
    if (needLinks()) loadLinks();
    // 当前页签先取，其余随后（各自串行翻页，四条链并行）
    loadIndex(state.type);
    for (const { value } of RESOURCE_TYPE_OPTIONS)
      if (value !== state.type) loadIndex(value);
  }

  /** 每个 base 的全部条目（自然顺序）：详情里的「同一角色」与合并后的一格都从这里取 */
  const bases = computed(() => {
    const map = new Map<string, Resource[]>();
    for (const item of indexes.character.items) {
      if (!item.base) continue;
      let list = map.get(item.base);
      if (!list) {
        list = [];
        map.set(item.base, list);
      }
      list.push(item);
    }
    return map;
  });

  const query = computed(() => {
    const text = normalizeResourceQuery(state.q);
    const terms = text.split(/\s+/u).filter(Boolean);
    // 只有一个词、带 # 的才可能是表情名
    const alias =
      terms.length === 1 ? resolveFaceAlias(terms[0], links.value) : null;
    return { terms, alias };
  });

  // 搜表情名要 character.json；当前是角色页签也要（缩略图）。第一次检查放在 loadAll 里：
  // 那时地址栏的 # 已经读过，直接打开别的页签就不用先取这 1.3MB
  const needLinks = () =>
    state.type === "character" ||
    query.value.terms.some((term) => term.includes("#"));
  watch(needLinks, (need) => {
    if (need) loadLinks();
  });

  function matches(item: Resource): string | null | false {
    const { terms, alias } = query.value;
    if (alias && item.lower === alias.id) return alias.face;
    return terms.every((term) => item.lower.includes(term)) ? null : false;
  }

  /** 某个类型筛出来的格子（未排序）。页签上的数字和结果是同一个口径 */
  function entriesOf(type: StoryResourceType): Entry[] {
    const character = type === "character";
    const entries: Entry[] = [];
    const seen = new Map<string, Entry>();
    for (const item of indexes[type].items) {
      if (character && state.cat && item.category !== state.cat) continue;
      const face = matches(item);
      if (face === false) continue;
      const members = (item.base && bases.value.get(item.base)) || [item];
      if (character && state.merge && item.base) {
        // 合并：一个 base 一格，代表图是第一张搜到的（不搜时就是第一张）
        if (seen.has(item.base)) continue;
        const entry: Entry = {
          resource: item,
          members,
          merged: members.length,
          count: Math.max(...members.map((member) => member.scriptCount)),
          face,
        };
        seen.set(item.base, entry);
        entries.push(entry);
        continue;
      }
      entries.push({
        resource: item,
        members,
        merged: 1,
        count: item.scriptCount,
        face,
      });
    }
    return entries;
  }

  const counts = computed(
    () =>
      Object.fromEntries(
        RESOURCE_TYPE_OPTIONS.map(({ value }) => [
          value,
          entriesOf(value).length,
        ]),
      ) as Record<StoryResourceType, number>,
  );

  /** 角色各分类的条数（分类芯片上的数字），不受分类本身影响 */
  const categoryCounts = computed(() => {
    const result: Record<CharacterCategory, number> = {
      operator: 0,
      npc: 0,
      other: 0,
    };
    const seen = new Set<string>();
    for (const item of indexes.character.items) {
      if (matches(item) === false || !item.category) continue;
      if (state.merge && item.base) {
        if (seen.has(item.base)) continue;
        seen.add(item.base);
      }
      result[item.category] += 1;
    }
    return result;
  });

  const total = computed(() => {
    const items = indexes[state.type].items;
    if (state.type !== "character" || !state.merge) return items.length;
    return bases.value.size;
  });

  const list = computed(() => {
    const entries = entriesOf(state.type);
    const { key, dir } = state.sort;
    // 索引已经是自然顺序：按资源名排只需看方向；按剧本数排用稳定排序，同数的保持自然顺序
    if (key === "count") entries.sort((a, b) => (a.count - b.count) * dir);
    else if (dir < 0) entries.reverse();
    return entries;
  });

  const pageCount = computed(() =>
    Math.max(1, Math.ceil(list.value.length / state.step)),
  );
  const page = computed(() => Math.min(state.page, pageCount.value));
  const pageList = computed(() =>
    list.value.slice((page.value - 1) * state.step, page.value * state.step),
  );

  watch(
    () => [
      state.type,
      state.q,
      state.cat,
      state.merge,
      state.sort.key,
      state.sort.dir,
    ],
    () => {
      state.page = 1;
    },
  );

  function setType(type: StoryResourceType): void {
    state.type = type;
    loadIndex(type);
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
    const first = (page.value - 1) * state.step;
    state.view = view;
    state.step = DEFAULT_STEP[view];
    state.page = Math.floor(first / state.step) + 1;
  }

  function setStep(step: number): void {
    const first = (page.value - 1) * state.step;
    state.step = step;
    state.page = Math.floor(first / step) + 1;
  }

  function setPage(n: number): void {
    state.page = Math.min(Math.max(1, n), pageCount.value);
  }

  function reset(): void {
    state.q = "";
    state.cat = "";
  }

  /** 当前类型里按资源名找 */
  function find(id: string): Resource | undefined {
    return indexes[state.type].items.find((item) => item.id === id);
  }

  /** 打开详情；face 是要选中的表情（按表情名搜到时） */
  function open(id: string, face: string | null = null): void {
    detail.id = id;
    detail.face = face;
  }

  function close(): void {
    detail.id = null;
    detail.face = null;
  }

  /** 详情里打开的资源在结果里的位置（合并时按它所在的那一格算） */
  const detailIndex = computed(() => {
    const id = detail.id;
    if (!id) return -1;
    return list.value.findIndex(
      (entry) =>
        entry.resource.id === id ||
        (entry.merged > 1 && entry.members.some((member) => member.id === id)),
    );
  });

  /** 详情里上一个 / 下一个：沿着当前结果走，结果翻到它所在的那页，关掉详情时停在那里 */
  function move(delta: number): void {
    const index = detailIndex.value;
    const next = list.value[index + delta];
    if (index < 0 || !next) return;
    open(next.resource.id, next.face);
    state.page = Math.floor((index + delta) / state.step) + 1;
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
    indexes,
    state,
    detail,
    webp,
    links,
    linksError,
    bases,
    query,
    counts,
    categoryCounts,
    total,
    list,
    page,
    pageCount,
    pageList,
    detailIndex,
    shareLink,
    loadAll,
    loadIndex,
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
