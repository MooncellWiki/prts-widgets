import { defineQueryOptions } from "@pinia/colada";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import type { SpecialOperatorTable } from "./types";

/** 特勤干员各精英阶段的升级经验表；不是特勤干员（表里没有）时是 null，整个小部件不出 */
export const soExpMapQuery = defineQueryOptions((charId: string) => ({
  key: ["so-exp-calc", charId],
  query: async (): Promise<number[][] | null> => {
    const response = await fetch(
      new URL(
        "/gamedata/latest/excel/special_operator_table.json",
        TORAPPU_ENDPOINT,
      ),
    );
    if (!response.ok) {
      const error = new Error(
        `special_operator_table ${response.status} ${response.statusText}`,
      );
      console.error("[SOExpCalc]", error);
      throw error;
    }
    const table: SpecialOperatorTable = await response.json();
    const expMap = table?.operatorDetailData?.[charId]?.specialOperatorExpMap;
    if (!expMap?.length || !expMap[0]?.length) {
      console.error("Failed to retrieve expMap for operator:", charId);
      return null;
    }
    return expMap;
  },
}));
