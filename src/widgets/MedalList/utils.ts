import { defineQueryOptions } from "@pinia/colada";

import type { MedalMetaData } from "./types";

async function getMedalMetaData(): Promise<MedalMetaData> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: import.meta.env.PROD ? "光荣之路/data" : "光荣之路/devdata",
      action: "raw",
    })}`,
  );
  if (!resp.ok) throw new Error(`光荣之路/data ${resp.status}`);
  return await resp.json();
}

/** 没取到时当没有奖章 */
export const EMPTY_MEDAL_META: MedalMetaData = {
  medal: {},
  medalGroup: {},
  category: {},
  groupDeprecateType: {},
};

/** 光荣之路/data。一页上的几个奖章展示共用整页的 pinia（见 entries/MedalShowcase.ts），只取一次 */
export const medalMetaQuery = defineQueryOptions({
  key: ["medal-meta"],
  query: () =>
    getMedalMetaData().catch((error: unknown) => {
      console.error("[MedalList]", error);
      throw error;
    }),
});
