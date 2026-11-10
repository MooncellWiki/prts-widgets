import type { App } from "vue";

import { useQueryCache, type EntryKey } from "@pinia/colada";
import { createPinia, type Pinia } from "pinia";
import { vi } from "vitest";

import { createStores } from "../../src/utils/pinia";

/**
 * 装上 pinia + Pinia Colada（同入口），并摆好一个查询的状态：
 * - 数据：直接放进缓存，挂载后不再去取
 * - "pending"：同外壳预渲染，查询不发，一直读取中
 * - "failed"：fetch 一律 500，挂载后取失败（等几轮任务队列才落定，见 settleQueries）
 */
export function installQuery(
  app: App,
  key: EntryKey,
  state: { data: unknown } | "pending" | "failed",
): Pinia {
  const pinia = createPinia();
  app.use(
    createStores({
      pinia,
      queryOptions: state === "pending" ? { enabled: false } : undefined,
    }),
  );
  if (state === "failed") {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 500 })),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
  } else if (typeof state === "object") {
    useQueryCache(pinia).setQueryData(key, state.data);
  }
  return pinia;
}

/** 等进行中的查询落定（fetch → json → 状态更新 → 渲染） */
export async function settleQueries(): Promise<void> {
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) => setTimeout(resolve, 0));
}
