import { TORAPPU_ENDPOINT } from "@/utils/consts";

import {
  CARGO_IN_CHUNK,
  CARGO_ROW_LIMIT,
  MAX_PAGES,
  PAGE_LIMIT,
  cargoTextPathIn,
  chunk,
  type CargoStoryRow,
  type StoryResourceType,
  type StoryUsageItem,
  type StoryUsageResponse,
  type UsageRow,
} from "./utils";

export interface UsageResult {
  rows: UsageRow[];
  /** 列表不全的原因（使用记录超过翻页保护 / cargo 取满了上限），全了是空串 */
  truncated: string;
}

async function fetchUsageItems(
  type: StoryResourceType,
  id: string,
): Promise<{ items: StoryUsageItem[]; truncated: boolean }> {
  const items: StoryUsageItem[] = [];
  let cursor: string | null | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      type,
      id,
      limit: String(PAGE_LIMIT),
    });
    if (cursor) params.set("cursor", cursor);
    const resp = await fetch(
      `${TORAPPU_ENDPOINT}/api/v1/story-resource-usages?${params}`,
    );
    if (!resp.ok) {
      throw new Error(`story-resource-usages ${resp.status}`);
    }
    const data = (await resp.json()) as StoryUsageResponse;
    items.push(...data.usages);
    cursor = data.nextCursor;
    if (!cursor) return { items, truncated: false };
  }
  // 翻页保护兜底：还有 cursor 说明结果被截断，得让用户知道列表不全。
  return { items, truncated: true };
}

async function fetchCargoStories(
  paths: string[],
): Promise<{ map: Map<string, CargoStoryRow>; truncated: boolean }> {
  const map = new Map<string, CargoStoryRow>();
  let truncated = false;
  for (const group of chunk(paths, CARGO_IN_CHUNK)) {
    const params = new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "story",
      fields: "_pageName=page,textPath,storyType,storyGroup",
      where: cargoTextPathIn(group),
      limit: String(CARGO_ROW_LIMIT),
    });
    const resp = await fetch(`/api.php?${params}`);
    if (!resp.ok) {
      throw new Error(`cargoquery ${resp.status}`);
    }
    // MediaWiki 出错时照样回 200，错误放在 error 字段里；不查的话整表会静默
    // 变成「未收录」。
    const json = (await resp.json()) as {
      cargoquery?: { title: CargoStoryRow }[];
      error?: { code?: string; info?: string };
    };
    if (json.error) {
      throw new Error(
        `cargoquery ${json.error.code ?? "error"}: ${json.error.info ?? ""}`,
      );
    }
    const rows = json.cargoquery ?? [];
    // 取满上限说明这一批可能还有没返回的行。
    if (rows.length >= CARGO_ROW_LIMIT) truncated = true;
    for (const { title } of rows) {
      if (!map.has(title.textPath)) {
        map.set(title.textPath, title);
      }
    }
  }
  return { map, truncated };
}

/** 两处静默截断都得让用户看见，否则「就这么多」和「被截断了」长得一样。 */
function truncationNotice(usagesTruncated: boolean, cargoTruncated: boolean) {
  if (usagesTruncated)
    return `使用记录超过 ${MAX_PAGES * PAGE_LIMIT} 条，列表已截断`;
  if (cargoTruncated) return "cargo 查询取满了结果上限，剧情页面关联可能不全";
  return "";
}

const cache = new Map<string, Promise<UsageResult>>();

/**
 * 哪些剧本用了这个资源（torappu 的反查接口，分页取完），再按剧本路径到 cargo 的 story 表查剧情页面。
 * 结果按资源缓存：详情里来回翻不重复请求；失败的不缓存，重试会重新取。
 */
export function loadUsages(
  type: StoryResourceType,
  id: string,
): Promise<UsageResult> {
  const key = `${type}:${id}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = (async () => {
      const usages = await fetchUsageItems(type, id);
      const stories = await fetchCargoStories(
        usages.items.map((item) => item.scriptPath),
      );
      return {
        rows: usages.items.map((item) => ({
          ...item,
          story: stories.map.get(item.scriptPath),
        })),
        truncated: truncationNotice(usages.truncated, stories.truncated),
      };
    })();
    cache.set(key, pending);
    pending.catch(() => cache.delete(key));
  }
  return pending;
}

/** torappu 资源库里这个剧本的原文 */
export function scriptSourceUrl(scriptPath: string): string {
  return `${TORAPPU_ENDPOINT}/asset?${new URLSearchParams({
    path: `gamedata/latest/story/${scriptPath}.txt`,
  })}`;
}

/** torappu 资源库的剧情资源页 */
export function assetStorageUrl(type: StoryResourceType, id: string): string {
  return `${TORAPPU_ENDPOINT}/story?${new URLSearchParams({ type, id })}`;
}

const fileCache = new Map<string, Promise<boolean>>();

/** wiki 上有没有这个文件（改版前每张图都链到文件页）；查不到或出错都当没有 */
export function wikiFileExists(title: string): Promise<boolean> {
  let pending = fileCache.get(title);
  if (!pending) {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      titles: `File:${title}`,
    });
    pending = fetch(`/api.php?${params}`)
      .then((resp) => (resp.ok ? resp.json() : null))
      .then(
        (json: { query?: { pages?: { missing?: boolean }[] } } | null) =>
          Boolean(json?.query?.pages?.[0]) && !json?.query?.pages?.[0]?.missing,
      )
      .catch(() => false);
    fileCache.set(title, pending);
  }
  return pending;
}
