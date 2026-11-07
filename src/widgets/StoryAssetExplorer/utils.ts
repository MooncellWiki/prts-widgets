import { normalizeCharacterMap } from "../StoryPlayer/context";
import {
  resolveStoryAssetByKey,
  resolveStoryCharacterAssetByKey,
} from "../StoryPlayer/engine/asset";

import type {
  StoryCharacterFaceAsset,
  StoryFaceRect,
} from "../StoryPlayer/engine/types";

export type StoryResourceType = "background" | "image" | "item" | "character";

/** 页签顺序：人物在前（同改版前的「人物 / 其他」） */
export const RESOURCE_TYPE_OPTIONS: {
  label: string;
  value: StoryResourceType;
  /** 结果栏「共 N …」的量词 + 名称 */
  unit: string;
}[] = [
  { label: "角色", value: "character", unit: "个角色" },
  { label: "背景", value: "background", unit: "张背景" },
  { label: "图像", value: "image", unit: "张图像" },
  { label: "道具", value: "item", unit: "个道具" },
];

export function isResourceType(value: unknown): value is StoryResourceType {
  return RESOURCE_TYPE_OPTIONS.some((option) => option.value === value);
}

export function resourceTypeLabel(type: string): string {
  return (
    RESOURCE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

export function resourceTypeUnit(type: StoryResourceType): string {
  return (
    RESOURCE_TYPE_OPTIONS.find((option) => option.value === type)?.unit ?? ""
  );
}

/**
 * 角色的分类，同改版前「人物」下的 NPC / Char 两段：后端按资源名的前缀分（story_resource_catalog）。
 * 干员 = char_<编号> / avg_<编号>（含 avgnew_、avg_char_ 这些早期写法）；
 * NPC = avg_npc_ / npc_ / avgnew_npc_；剩下的（博士 avg_doc、占位 char_empty 等）归其他。
 */
export type CharacterCategory = "operator" | "npc" | "other";

export const CHARACTER_CATEGORIES: {
  value: CharacterCategory;
  label: string;
}[] = [
  { value: "operator", label: "干员" },
  { value: "npc", label: "NPC" },
  { value: "other", label: "其他" },
];

export function isCharacterCategory(
  value: unknown,
): value is CharacterCategory {
  return CHARACTER_CATEGORIES.some((option) => option.value === value);
}

/**
 * 搜索框里的内容 → 小写的资源名关键字。除了直接输资源名，还认这几种贴进来的东西：
 * - 剧本里的命令：`[charslot(slot="m",name="avg_2026_yu_1#18$1")]`、`[Background(image="bg_x")]`，取引号里的名字；
 * - wiki 上的文件名：`文件:Avg avg 2026 yu 1-1$1.png`，去掉命名空间、`Avg_` 前缀和扩展名，空格换回下划线。
 * 文件名里的 `-` 是上传时把 `#` 换掉的（资源名里本来没有 `-`），一律换回 `#`。
 */
export function normalizeResourceQuery(raw: string): string {
  const quoted = /\b(?:name|image|key|res)\s*=\s*"([^"]+)"/iu.exec(raw);
  let text = (quoted ? quoted[1] : raw).trim();
  const fileName =
    /^(?:文件|file|image)\s*:/iu.test(text) ||
    /\.(?:png|jpe?g|webp)$/iu.test(text);
  if (fileName) {
    text = text
      .replace(/^(?:文件|file|image)\s*:\s*/iu, "")
      .replace(/\.(?:png|jpe?g|webp)$/iu, "")
      .replaceAll(" ", "_")
      .replace(/^avg_/iu, "");
  }
  return text.replaceAll("-", "#").toLowerCase();
}

/**
 * torappu 的 CDN（阿里云图片处理）缩图：`l_` 按最长边缩，`p_` 按百分比缩。
 * 只缩不放，原图比目标小时原样返回。
 */
export function cdnImageUrl(
  url: string,
  operation: string,
  webp: boolean,
): string {
  const operations = [operation];
  if (webp) operations.push("format,webp");
  return `${url}?image_process=${operations.join("/")}`;
}

/**
 * 以下响应类型对应 ak-asset-storage 的 `/api/v1/story-resources/explore` 与
 * `/api/v1/story-resource-usages`（见该仓库的 `app/common/schema.d.ts`）。
 * 跨仓库改字段没有编译期保护，动接口时两边都要过一遍。
 */
export interface Resource {
  type: StoryResourceType;
  id: string;
  scriptCount: number;
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
  /** 排序用的剧本数：合并时是整个角色去重后的剧本数 */
  count: number;
  /** 按 `base#表情` 搜到的：那个表情 */
  face: string | null;
}

export interface ExploreResponse {
  entries: Entry[];
  /** 请求带 focus 时的那一格，不受筛选和分页影响 */
  selection: Entry | null;
  focusIndex: number | null;
  /** 当前类型不带搜索和分类时的总数 */
  total: number;
  matchedTotal: number;
  /** 各类型的匹配数，不受当前页签影响 */
  counts: Record<StoryResourceType, number>;
  /** 角色各分类的匹配数，不受当前分类影响 */
  categoryCounts: Record<CharacterCategory, number>;
  page: number;
  pageSize: number;
  pageCount: number;
  updatedAt: string | null;
}

export interface StoryUsageItem {
  scriptPath: string;
  displayNames: string[];
  /** 该剧情用到的实际差分（`base#expression`），仅叠图角色（`base$N`）查询时返回 */
  faces?: string[] | null;
}

export interface StoryUsageResponse {
  usages: StoryUsageItem[];
  nextCursor?: string | null;
}

export interface CargoStoryRow {
  page: string;
  textPath: string;
  storyType: string;
  storyGroup: string;
}

/** torappu 接口单页上限 */
export const PAGE_LIMIT = 200;

/** 翻页保护：200/页 * 50 页 */
export const MAX_PAGES = 50;

/** cargo api.php 单次查询的 IN 列表上限（结果上限 500，留足余量） */
export const CARGO_IN_CHUNK = 100;

/**
 * cargo 单次查询的结果条数上限。必须大于 `CARGO_IN_CHUNK`：一个 textPath
 * 理论上可以落在多个剧情页面上，取等就会在那种情况下静默截断，把后面的
 * textPath 全变成「未收录」。
 */
export const CARGO_ROW_LIMIT = 500;

const TORAPPU_ASSET_BASE = "https://torappu.prts.wiki/assets";

export const CHARACTER_MAP_URL = `${TORAPPU_ASSET_BASE}/avg/character.json`;

/**
 * 背景与图像类资源的静态图 URL，路径规则与 StoryPlayer 的
 * `resolveStoryAssetByKey` 一致（key 小写，道具同样落在 avg/images 下）。
 * 角色需要脸部合成，走 character.json 解析，返回 null。
 */
export function storyResourceImageUrl(
  type: StoryResourceType,
  id: string,
): string | null {
  switch (type) {
    case "background": {
      return resolveStoryAssetByKey(id, "background");
    }
    case "image":
    case "item": {
      return resolveStoryAssetByKey(id, "image");
    }
    default: {
      return null;
    }
  }
}

export type CharacterPreview =
  | { kind: "single"; url: string }
  | {
      kind: "composite";
      baseUrl: string;
      faceUrl: string;
      faceRect: StoryFaceRect;
    };

interface CharacterOverlayGroup {
  base: string;
  faceRect: StoryFaceRect;
}

interface CharacterLinkItem {
  group: number;
  face?: string;
  image?: string;
}

interface CharacterLinkNode {
  /** face_overlay 组索引 → 身体底图与脸部区域 */
  overlays: Map<number, CharacterOverlayGroup>;
  /** 表情名（如 `1$1`、`10$1`）→ 差分条目，保持文件顺序 */
  items: Map<string, CharacterLinkItem>;
}

export type CharacterLinkMap = Map<string, CharacterLinkNode>;

/** 复用 StoryPlayer 的归一化结果，只转换成卡片预览所需的 Map 结构 */
export function parseCharacterMap(raw: unknown): CharacterLinkMap {
  const output: CharacterLinkMap = new Map();
  const normalized = normalizeCharacterMap(raw);

  for (const [base, node] of Object.entries(normalized)) {
    const overlays = new Map<number, CharacterOverlayGroup>();
    const items = new Map<string, CharacterLinkItem>();

    for (const [groupIndex, group] of node.groups.entries()) {
      if (group.mode !== "face_overlay") continue;
      overlays.set(groupIndex, {
        base: group.base,
        faceRect: group.faceRect,
      });
    }

    for (const item of node.array) {
      const entry: CharacterLinkItem = { group: item.group };
      if (item.face) entry.face = item.face;
      if (item.image) entry.image = item.image;
      if (!items.has(item.name)) items.set(item.name, entry);
    }

    output.set(base, { overlays, items });
  }
  return output;
}

const characterMapState: { cache: Promise<CharacterLinkMap> | null } = {
  cache: null,
};

/**
 * 拉取并缓存 `avg/character.json`（约 1.3MB，gzip 后约 130KB），只在用到角色时调用。
 * 失败后清掉缓存，下次调用重新拉。
 */
export function ensureCharacterMap(): Promise<CharacterLinkMap> {
  characterMapState.cache ??= fetch(CHARACTER_MAP_URL)
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`character.json ${response.status}`);
      }
      return parseCharacterMap(await response.json());
    })
    .catch((error: unknown) => {
      characterMapState.cache = null;
      throw error;
    });
  return characterMapState.cache;
}

interface ParsedCharacterListingId {
  /** character.json 的 base 键（`#差分` 与 `$N` 后缀都已剥掉） */
  base: string;
  /** `#` 后的差分名（如 `10$1`），无 `#` 时为 null */
  faceName: string | null;
  /**
   * `$N` 反解出的表情组下标 N-1，没有 `$N`（或 N 不是正整数）时为 null。
   * `$N` 是存储端按 `entry.group + 1` 拼的（ak-asset-storage 的
   * `resolved_id`），指 character.json 去重后的表情组，不是 prefab body，
   * 按组下标反解是精确的。不能按条目名后缀 `$N` 猜：`avg_npc_1898_1` 的表情名
   * 带尾点（`2$1.`～`7$1.`），后缀匹配不上会把它们全部漏掉（同 StoryPlayer #441）。
   */
  group: number | null;
}

function parseCharacterListingId(id: string): ParsedCharacterListingId {
  const hash = id.indexOf("#");
  const head = hash === -1 ? id : id.slice(0, hash);
  const faceName = hash === -1 ? null : id.slice(hash + 1);
  const dollar = head.lastIndexOf("$");
  const suffix = dollar === -1 ? "" : head.slice(dollar + 1);
  if (!/^\d+$/u.test(suffix)) return { base: head, faceName, group: null };
  const group = Number(suffix) - 1;
  return {
    base: head.slice(0, dollar),
    faceName,
    group: Number.isInteger(group) && group >= 0 ? group : null,
  };
}

function characterAssetUrl(key: string): string {
  const url = resolveStoryCharacterAssetByKey(key);
  if (!url) throw new Error("character asset key is empty");
  return url;
}

/** 取 listing `$N` 对应的叠图组（组下标 N-1），没有时退回第一个组 */
function pickOverlayGroup(
  node: CharacterLinkNode,
  groupIndex: number | null,
): [index: number, group: CharacterOverlayGroup] | null {
  const first = node.overlays.entries().next();
  if (first.done) return null;
  if (groupIndex === null) return first.value;

  const group = node.overlays.get(groupIndex);
  return group ? [groupIndex, group] : first.value;
}

/** 由 character.json 解析角色卡片预览；查不到 base 时返回 null */
export function resolveCharacterPreview(
  id: string,
  links: CharacterLinkMap,
): CharacterPreview | null {
  const { base, faceName, group } = parseCharacterListingId(id);
  const node = links.get(base);
  if (!node) return null;

  // 带 `#差分` 的 id 精确解析：独立全身图直接用该图，叠图差分取所属组合成
  if (faceName !== null) {
    const item = node.items.get(faceName);
    if (item?.image) {
      return { kind: "single", url: characterAssetUrl(item.image) };
    }
    const overlay = item?.face ? node.overlays.get(item.group) : undefined;
    if (item?.face && overlay) {
      return {
        kind: "composite",
        baseUrl: characterAssetUrl(overlay.base),
        faceUrl: characterAssetUrl(item.face),
        faceRect: overlay.faceRect,
      };
    }
  }

  // `base$N` 形态：取该组叠图底图与组内第一个表情
  const overlayEntry = pickOverlayGroup(node, group);
  if (overlayEntry) {
    const [groupIndex, overlay] = overlayEntry;
    for (const item of node.items.values()) {
      if (item.group !== groupIndex || !item.face) continue;
      return {
        kind: "composite",
        baseUrl: characterAssetUrl(overlay.base),
        faceUrl: characterAssetUrl(item.face),
        faceRect: overlay.faceRect,
      };
    }
  }

  for (const item of node.items.values()) {
    if (item.image) {
      return { kind: "single", url: characterAssetUrl(item.image) };
    }
  }
  return null;
}

/**
 * 组装表情浏览数据：列出该表情组的全部差分并标记本条剧情用到的
 * （`usedFaceIds` 是接口返回的 `base#expression` 列表）。
 * 角色无 face_overlay（单图角色）或查不到 base 时返回 null。
 */
export function buildFaceGallery(
  listingId: string,
  usedFaceIds: readonly string[],
  links: CharacterLinkMap,
): StoryCharacterFaceAsset[] | null {
  const { base, group } = parseCharacterListingId(listingId);
  const node = links.get(base);
  if (!node || node.overlays.size === 0) return null;

  const used = new Set(
    usedFaceIds.map((id) => id.slice(id.lastIndexOf("#") + 1)),
  );
  const collect = (matchGroup: number | null): StoryCharacterFaceAsset[] => {
    const items: StoryCharacterFaceAsset[] = [];
    for (const [name, item] of node.items) {
      const overlay = item.face ? node.overlays.get(item.group) : undefined;
      if (!item.face || !overlay) continue;
      if (matchGroup !== null && item.group !== matchGroup) continue;
      items.push({
        expression: name,
        baseUrl: characterAssetUrl(overlay.base),
        faceUrl: characterAssetUrl(item.face),
        faceRect: overlay.faceRect,
        used: used.has(name),
      });
    }
    return items;
  };

  // 组过滤结果为空（列表 id 与本地 character.json 版本错位等）时退回全部差分
  const items = group === null ? [] : collect(group);
  return items.length > 0 ? items : collect(null);
}

export function chunk<T>(list: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < list.length; i += size) {
    result.push(list.slice(i, i + size));
  }
  return result;
}

/** 生成 cargo where 片段 `textPath IN ("a","b")`，转义反斜杠与双引号 */
export function cargoTextPathIn(paths: string[]): string {
  const quoted = paths.map(
    (path) => `"${path.replace(/["\\]/gu, String.raw`\$&`)}"`,
  );
  return `textPath IN (${quoted.join(",")})`;
}

/** 使用详情的一行：接口给的剧本 + cargo 查到的剧情页面（查不到时没有 story） */
export interface UsageRow extends StoryUsageItem {
  story?: CargoStoryRow;
}

export interface UsageGroup {
  /** 分组键：cargo 的 storyGroup；没收录到剧情页面的是空串 */
  key: string;
  rows: UsageRow[];
  /** 组内出现过的剧情分类（主线 / 支线 / 剧情 / 干员密录），按出现顺序 */
  types: string[];
}

/**
 * 按剧情页面所属的活动 / 章节（cargo 的 storyGroup）分组：组按第一次出现的顺序，
 * 组内保持接口顺序（剧本路径）。没收录到剧情页面的剧本放在最后一组。
 */
export function groupUsages(rows: readonly UsageRow[]): UsageGroup[] {
  const groups = new Map<string, UsageGroup>();
  const orphan: UsageGroup = { key: "", rows: [], types: [] };
  for (const row of rows) {
    const key = row.story?.storyGroup ?? "";
    let group = key ? groups.get(key) : orphan;
    if (!group) {
      group = { key, rows: [], types: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
    const type = row.story?.storyType;
    if (type && !group.types.includes(type)) group.types.push(type);
  }
  const list = [...groups.values()];
  if (orphan.rows.length > 0) list.push(orphan);
  return list;
}

/** 接口给的 `base#表情` → 表情名 */
export function faceNameOf(faceId: string): string {
  return faceId.slice(faceId.lastIndexOf("#") + 1);
}

/** 每个表情被几个剧本用到 */
export function faceUsageCounts(
  rows: readonly UsageRow[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const face of row.faces ?? []) {
      const name = faceNameOf(face);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return counts;
}

/** 文件名里不能出现的字符换成下划线 */
export function safeFilename(raw: string): string {
  return raw.replace(/[<>:"/\\|?*]/gu, "_");
}

/**
 * 一条资源的预览图：角色按 character.json 解析（叠图 / 单图），其余直接是静态图。
 * 角色在 character.json 还没到时返回 undefined（先空着），取失败了就当没有预览。
 */
export function resourcePreview(
  type: StoryResourceType,
  id: string,
  links: CharacterLinkMap | null,
  linksFailed = false,
): CharacterPreview | null | undefined {
  if (type === "character") {
    if (links) return resolveCharacterPreview(id, links);
    return linksFailed ? null : undefined;
  }
  const url = storyResourceImageUrl(type, id);
  return url ? { kind: "single", url } : null;
}

/** 缩略图的最长边：背景 / 图像是横图，格子宽；角色 / 道具是方图，格子窄 */
export function thumbEdge(type: StoryResourceType): number {
  return type === "background" || type === "image" ? 640 : 320;
}

/** 把 text 里命中 terms（不分大小写）的部分切出来，给结果里的资源名高亮 */
export function highlightParts(
  text: string,
  terms: readonly string[],
): { text: string; hit: boolean }[] {
  const lower = text.toLowerCase();
  const marks: boolean[] = Array.from({ length: text.length }, () => false);
  for (const term of terms) {
    if (!term) continue;
    let from = lower.indexOf(term);
    while (from !== -1) {
      for (let i = from; i < from + term.length; i++) marks[i] = true;
      from = lower.indexOf(term, from + term.length);
    }
  }
  const parts: { text: string; hit: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = parts.at(-1);
    if (last && last.hit === marks[i]) last.text += text[i];
    else parts.push({ text: text[i], hit: marks[i] });
  }
  return parts;
}
