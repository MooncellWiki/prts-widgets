import { defineQueryOptions } from "@pinia/colada";

import { fetchUsages, wikiFileExists } from "./usages";
import { fetchCharacterMap, type StoryResourceType } from "./utils";

/**
 * 角色缩略图和详情要的几份数据，缓存交给 Pinia Colada。列表本身（/story-resources/explore）
 * 不走这里：后端会改页码、失败时要留着上一页、跨页切详情要续接，见 store.ts 的 loadPage。
 *
 * 这些数据在页面打开期间不会变：取到就一直用，不过期、不回收。失败的条目没有结果，
 * 下次用到它时（再打开那个资源、切回角色页签、点重试、切回浏览器标签页）重新取；Colada 不自动重试。
 */
const KEEP = { staleTime: Number.POSITIVE_INFINITY, gcTime: false } as const;

const KEY = "story-asset-explorer";

function warnOnError<T>(label: string, pending: Promise<T>): Promise<T> {
  return pending.catch((cause: unknown) => {
    console.warn(`[StoryAssetExplorer] ${label}`, cause);
    throw cause;
  });
}

/** avg/character.json：只在角色页签用到时取（enabled 由调用方给） */
export const characterMapQuery = defineQueryOptions({
  key: [KEY, "character-map"],
  query: ({ signal }) =>
    warnOnError("character.json", fetchCharacterMap(signal)),
  ...KEEP,
});

/** 用到这个资源的剧本（torappu 反查 + cargo 剧情页面） */
export const usagesQuery = defineQueryOptions(
  ({ type, id }: { type: StoryResourceType; id: string }) => ({
    key: [KEY, "usages", type, id],
    query: () => warnOnError("usages", fetchUsages(type, id)),
    ...KEEP,
  }),
);

/** wiki 上有没有这个文件页；出错当没有（wikiFileExists 不抛） */
export const wikiFileQuery = defineQueryOptions((title: string) => ({
  key: [KEY, "wiki-file", title],
  query: () => wikiFileExists(title),
  ...KEEP,
}));
