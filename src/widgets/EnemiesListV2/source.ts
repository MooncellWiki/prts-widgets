import { defineQueryOptions } from "@pinia/colada";

import type { EnemyData } from "./enemy";

/** 机器人按游戏数据维护的那份 JSON：每个敌人一条 */
async function fetchSource(): Promise<EnemyData[]> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "敌人一览/数据",
      action: "raw",
      ctype: "application/json",
    })}`,
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (!Array.isArray(json)) throw new Error("「敌人一览/数据」不是数组");
  return json;
}

/** 「敌人一览/数据」。入口挂载前就先发出去（prefetch），和皮肤样式一起取 */
export const enemySourceQuery = defineQueryOptions({
  key: ["enemies-list", "source"],
  query: () =>
    fetchSource().catch((error: unknown) => {
      console.error("[EnemiesListV2] 敌人数据读取失败", error);
      throw error;
    }),
});
