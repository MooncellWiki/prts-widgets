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

export interface StoryUsageItem {
  scriptPath: string;
  displayNames: string[];
}

export interface StoryUsageResponse {
  resource: { type: string; id: string };
  items: StoryUsageItem[];
  nextCursor?: string | null;
}

export interface CargoStoryRow {
  page: string;
  textPath: string;
  storyType: string;
  storyGroup: string;
}

/** cargo api.php 单次查询的 IN 列表上限（默认上限 500，留足余量） */
export const CARGO_IN_CHUNK = 100;

/** .NET Int32.TryParse 语义：允许前后空白与正负号 */
function parseIntLikeDotnet(suffix: string): number | null {
  const trimmed = suffix.trim();
  if (!/^[+-]?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/**
 * 与 ak-asset-storage 的 normalize_character_id 对齐：
 * 依次截取最后一个 `$`(差分) 与 `#`(表情) 后缀，缺省为 1。
 * `avg_npc_009` → `avg_npc_009#1$1`
 */
export function normalizeCharacterId(id: string): string {
  if (id.trim() === "") return "";
  let value = id;
  let face = 1;
  let body = 1;
  const dollar = value.lastIndexOf("$");
  if (dollar !== -1) {
    const parsed = parseIntLikeDotnet(value.slice(dollar + 1));
    if (parsed !== null) {
      body = parsed;
      value = value.slice(0, dollar);
    }
  }
  const hash = value.lastIndexOf("#");
  if (hash !== -1) {
    const parsed = parseIntLikeDotnet(value.slice(hash + 1));
    if (parsed !== null) {
      face = parsed;
      value = value.slice(0, hash);
    }
  }
  return `${value}#${face}$${body}`;
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
