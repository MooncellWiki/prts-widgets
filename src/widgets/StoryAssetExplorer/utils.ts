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
  /** 该剧情用到的脸部差分（`base#face$body`），仅角色 body 查询时返回 */
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

function encodePathSegments(path: string): string {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

/**
 * 背景与图像类资源的静态图 URL，路径规则与 StoryPlayer 的
 * `resolveStoryAssetByKey` 一致（key 小写，道具同样落在 avg/images 下）。
 * 角色需要脸部合成，走 character.json 解析，返回 null。
 */
export function storyResourceImageUrl(
  type: StoryResourceType,
  id: string,
): string | null {
  const key = id.trim().toLowerCase();
  if (!key) return null;
  switch (type) {
    case "background": {
      return `${TORAPPU_ASSET_BASE}/avg/background/${encodePathSegments(key)}.png`;
    }
    case "image":
    case "item": {
      return `${TORAPPU_ASSET_BASE}/avg/images/${encodePathSegments(key)}.png`;
    }
    default: {
      return null;
    }
  }
}

export interface StoryFaceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type CharacterPreview =
  | { kind: "single"; url: string }
  | {
      kind: "composite";
      baseUrl: string;
      faceUrl: string;
      faceRect: StoryFaceRect;
    };

interface CharacterLinkNode {
  faceOverlay?: { base: string; faceRect: StoryFaceRect };
  /** 表情名（`face$body`，如 `1$1`）→ 脸部差分资源 key，保持文件顺序 */
  faces: Map<string, string>;
  singleImage?: string;
}

export type CharacterLinkMap = Map<string, CharacterLinkNode>;

function toFiniteInt(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? Math.round(num) : 0;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** 归一化 `avg/character.json`，只保留卡片预览需要的字段 */
export function parseCharacterMap(raw: unknown): CharacterLinkMap {
  const output: CharacterLinkMap = new Map();
  const root = asObject(raw);
  if (!root) return output;

  for (const [base, rawNode] of Object.entries(root)) {
    const node = asObject(rawNode);
    if (!node) continue;

    const groupsRaw = Array.isArray(node.groups) ? node.groups : [];
    const arrayRaw = Array.isArray(node.array) ? node.array : [];
    const faces = new Map<string, string>();
    let faceOverlay: CharacterLinkNode["faceOverlay"];
    let singleImage: string | undefined;

    for (const [groupIndex, rawGroup] of groupsRaw.entries()) {
      const group = asObject(rawGroup);
      if (!group) continue;
      if (group.mode === "face_overlay" && typeof group.base === "string") {
        const rectRaw = asObject(group.faceRect) ?? {};
        faceOverlay = {
          base: group.base,
          faceRect: {
            x: toFiniteInt(rectRaw.x),
            y: toFiniteInt(rectRaw.y),
            w: toFiniteInt(rectRaw.w),
            h: toFiniteInt(rectRaw.h),
          },
        };
        for (const rawItem of arrayRaw) {
          const item = asObject(rawItem);
          if (
            item?.group === groupIndex &&
            typeof item.name === "string" &&
            typeof item.face === "string"
          ) {
            faces.set(item.name, item.face);
          }
        }
      }
    }

    for (const rawItem of arrayRaw) {
      const item = asObject(rawItem);
      if (
        !singleImage &&
        item?.group === -1 &&
        typeof item.image === "string"
      ) {
        singleImage = item.image;
      }
    }

    output.set(base, { faceOverlay, faces, singleImage });
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

/**
 * 列表接口的角色 id 是 `base$body` 形态（表情后缀已剥掉），
 * 这里再去掉 `$body` 后缀得到 character.json 的 base 键。
 */
export function characterBaseOfListingId(id: string): string {
  const dollar = id.lastIndexOf("$");
  if (dollar === -1) return id;
  return /^\d+$/u.test(id.slice(dollar + 1)) ? id.slice(0, dollar) : id;
}

function characterAssetUrl(key: string): string {
  return `${TORAPPU_ASSET_BASE}/avg/characters/${encodePathSegments(key)}.png`;
}

/** 由 character.json 解析角色卡片预览；查不到 base 时返回 null */
export function resolveCharacterPreview(
  id: string,
  links: CharacterLinkMap,
): CharacterPreview | null {
  const node = links.get(characterBaseOfListingId(id));
  if (!node) return null;

  const overlay = node.faceOverlay;
  const firstFace = node.faces.values().next().value;
  if (overlay && firstFace) {
    return {
      kind: "composite",
      baseUrl: characterAssetUrl(overlay.base),
      faceUrl: characterAssetUrl(firstFace),
      faceRect: overlay.faceRect,
    };
  }

  if (node.singleImage) {
    return {
      kind: "single",
      url: characterAssetUrl(node.singleImage),
    };
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
 * （`usedFaceIds` 是接口返回的 `base#face$body` 列表）。
 * 角色无 face_overlay（单图角色）或查不到 base 时返回 null。
 */
export function buildFaceGallery(
  bodyId: string,
  usedFaceIds: readonly string[],
  links: CharacterLinkMap,
): FaceGalleryItem[] | null {
  const node = links.get(characterBaseOfListingId(bodyId));
  const overlay = node?.faceOverlay;
  if (!node || !overlay) return null;

  const used = new Set(
    usedFaceIds.map((id) => id.slice(id.lastIndexOf("#") + 1)),
  );
  const items: FaceGalleryItem[] = [];
  for (const [name, faceKey] of node.faces) {
    items.push({
      expression: name,
      baseUrl: characterAssetUrl(overlay.base),
      faceUrl: characterAssetUrl(faceKey),
      faceRect: overlay.faceRect,
      used: used.has(name),
    });
  }
  return items;
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
