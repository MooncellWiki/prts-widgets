import { normalizeCharacterMap } from "../StoryPlayer/context";
import {
  resolveStoryAssetByKey,
  resolveStoryCharacterAssetByKey,
} from "../StoryPlayer/engine/asset";

import type { StoryFaceRect } from "../StoryPlayer/engine/types";

export type StoryResourceType = "background" | "image" | "item" | "character";

export const RESOURCE_TYPE_OPTIONS: {
  label: string;
  value: StoryResourceType;
}[] = [
  { label: "背景", value: "background" },
  { label: "图像", value: "image" },
  { label: "道具", value: "item" },
  { label: "角色", value: "character" },
];

export function resourceTypeLabel(type: string): string {
  return (
    RESOURCE_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type
  );
}

export interface StoryResourceSummary {
  type: StoryResourceType;
  id: string;
  scriptCount: number;
}

export interface StoryResourceListResponse {
  resources: StoryResourceSummary[];
  nextCursor?: string | null;
}

export interface StoryUsageItem {
  scriptPath: string;
  displayNames: string[];
  /** 该剧情用到的实际差分（`base#expression`），仅角色 body 查询时返回 */
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

/** cargo api.php 单次查询的 IN 列表上限（默认上限 500，留足余量） */
export const CARGO_IN_CHUNK = 100;

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
      return resolveStoryAssetByKey(id, true);
    }
    case "image":
    case "item": {
      return resolveStoryAssetByKey(id, false);
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
  /** 表情名（`face$body`，如 `1$1`、`10$1`）→ 差分条目，保持文件顺序 */
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

/** 拉取并缓存 `avg/character.json`（约 1.3MB），仅在出现角色卡片时调用 */
export function ensureCharacterMap(): Promise<CharacterLinkMap> {
  characterMapState.cache ??= fetch(CHARACTER_MAP_URL).then(
    async (response) => {
      if (!response.ok) {
        throw new Error(`character.json ${response.status}`);
      }
      return parseCharacterMap(await response.json());
    },
  );
  return characterMapState.cache;
}

interface ParsedCharacterListingId {
  /** character.json 的 base 键（`#表情` 与 `$body` 后缀都已剥掉） */
  base: string;
  /** `#` 后的差分名（`face$body`，如 `10$1`），无 `#` 时为 null */
  faceName: string | null;
  /** body 序号（如 `1`），无数字 `$` 后缀时为 null */
  body: string | null;
}

function parseCharacterListingId(id: string): ParsedCharacterListingId {
  const hash = id.indexOf("#");
  const head = hash === -1 ? id : id.slice(0, hash);
  const faceName = hash === -1 ? null : id.slice(hash + 1);
  const dollar = head.lastIndexOf("$");
  const bodySuffix =
    dollar !== -1 && /^\d+$/u.test(head.slice(dollar + 1))
      ? head.slice(dollar + 1)
      : null;
  return {
    base: bodySuffix === null ? head : head.slice(0, dollar),
    faceName,
    body: bodySuffix,
  };
}

/**
 * 列表接口的角色 id 有两种形态：叠图角色归并为 `base$body`，
 * 独立全身图差分保留完整 `base#expression`，这里统一剥成 base 键。
 */
export function characterBaseOfListingId(id: string): string {
  return parseCharacterListingId(id).base;
}

/** 取 `name` 的数字 body 后缀（`10$1` → `1`），没有则为 null */
function bodySuffixOf(name: string): string | null {
  const dollar = name.lastIndexOf("$");
  if (dollar === -1) return null;
  const suffix = name.slice(dollar + 1);
  return /^\d+$/u.test(suffix) ? suffix : null;
}

function characterAssetUrl(key: string): string {
  const url = resolveStoryCharacterAssetByKey(key);
  if (!url) throw new Error("character asset key is empty");
  return url;
}

/** 选中 body 对应的叠图组（底图键以 `$body` 结尾），找不到时退回第一个组 */
function pickOverlayGroup(
  node: CharacterLinkNode,
  body: string | null,
): [index: number, group: CharacterOverlayGroup] | null {
  const first = node.overlays.entries().next();
  if (first.done) return null;
  if (body === null) return first.value;

  for (const entry of node.overlays.entries()) {
    if (bodySuffixOf(entry[1].base) === body) return entry;
  }
  return first.value;
}

/** 由 character.json 解析角色卡片预览；查不到 base 时返回 null */
export function resolveCharacterPreview(
  id: string,
  links: CharacterLinkMap,
): CharacterPreview | null {
  const { base, faceName, body } = parseCharacterListingId(id);
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

  // `base$body` 形态：取该 body 叠图组与组内第一个表情
  const overlayEntry = pickOverlayGroup(node, body);
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

export interface FaceGalleryItem {
  expression: string;
  baseUrl: string;
  faceUrl: string;
  faceRect: StoryFaceRect;
  used: boolean;
}

/**
 * 组装表情浏览数据：列出该 body 的全部差分并标记本条剧情用到的
 * （`usedFaceIds` 是接口返回的 `base#expression` 列表）。
 * 角色无 face_overlay（单图角色）或查不到 base 时返回 null。
 */
export function buildFaceGallery(
  bodyId: string,
  usedFaceIds: readonly string[],
  links: CharacterLinkMap,
): FaceGalleryItem[] | null {
  const { base, body } = parseCharacterListingId(bodyId);
  const node = links.get(base);
  if (!node || node.overlays.size === 0) return null;

  const used = new Set(
    usedFaceIds.map((id) => id.slice(id.lastIndexOf("#") + 1)),
  );
  const collect = (matchBody: string | null): FaceGalleryItem[] => {
    const items: FaceGalleryItem[] = [];
    for (const [name, item] of node.items) {
      const overlay = item.face ? node.overlays.get(item.group) : undefined;
      if (!item.face || !overlay) continue;
      if (matchBody !== null && bodySuffixOf(name) !== matchBody) continue;
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

  // body 过滤结果为空（如差分名不带 `$body`）时退回全部差分
  const items = body === null ? [] : collect(body);
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
