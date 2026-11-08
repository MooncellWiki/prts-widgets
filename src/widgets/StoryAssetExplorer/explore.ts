import { TORAPPU_ENDPOINT } from "@/utils/consts";

import type {
  CharacterCategory,
  ExploreResponse,
  StoryResourceType,
} from "./utils";

/** explore 接口的查询参数，键名同后端。undefined 的不发 */
export interface ExploreQuery {
  type: StoryResourceType;
  q: string;
  groupBy: "base" | "resource";
  sort: "id" | "scriptCount";
  order: "asc" | "desc";
  page: number;
  pageSize: number;
  category?: CharacterCategory;
  /** 让后端定位这个资源：换到它所在的页，并在 selection 里带上它那一格 */
  focus?: string;
}

/** 取一页结果，连同不受分页影响的各类型 / 分类计数 */
export async function fetchExplore(
  query: ExploreQuery,
  signal?: AbortSignal,
): Promise<ExploreResponse> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined) params.set(key, String(value));
  const resp = await fetch(
    `${TORAPPU_ENDPOINT}/api/v1/story-resources/explore?${params}`,
    { signal },
  );
  if (!resp.ok) throw new Error(`story-resources/explore ${resp.status}`);
  return (await resp.json()) as ExploreResponse;
}
