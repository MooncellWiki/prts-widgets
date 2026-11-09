import type { Plugin } from "vue";

import { PiniaColada, type UseQueryOptionsGlobal } from "@pinia/colada";
import { createPinia, type Pinia } from "pinia";

/**
 * 小部件取的数据（wiki 页面、cargo、torappu 的 gamedata）在页面打开期间不会变：取到就一直用，不过期、不回收。
 * 失败的条目没有结果，下次用到它时（重新挂载、点重试、切回浏览器标签页）重新取；Colada 不自动重试。
 */
export const QUERY_DEFAULTS = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: false,
} as const satisfies UseQueryOptionsGlobal;

/**
 * 装上 pinia 和 Pinia Colada（查询默认 QUERY_DEFAULTS）。不给 pinia 时新建一个，只给这个 app 用。
 * 这个文件在 vite.config.ts 里和 Colada 打进同一个 chunk，别放进 src/utils 的 common——不然所有小部件都要连带加载它们。
 */
export function createStores(
  options: { pinia?: Pinia; queryOptions?: UseQueryOptionsGlobal } = {},
): Plugin {
  const pinia = options.pinia ?? createPinia();
  return {
    install(app) {
      app.use(pinia).use(PiniaColada, {
        queryOptions: { ...QUERY_DEFAULTS, ...options.queryOptions },
      });
    },
  };
}

let shared: Pinia | undefined;

/**
 * 整页共用的 pinia：一页上挂多份的小部件（每份一个 app，如奖章展示、商店、剧情立绘）都装它，
 * Colada 的缓存跟着 pinia 走，同一份数据整页只取一次。几个入口打进同一个 chunk，跨小部件也共用。
 * 共用时别用 defineStore 放每份自己的状态，会串到别的份里去。
 */
export function pagePinia(): Pinia {
  shared ??= createPinia();
  return shared;
}
