import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import SOExpCalc from "@/widgets/SOExpCalc/SOExpCalc.vue";
import type {
  SpecialOperatorDetailData,
  SpecialOperatorTable,
} from "@/widgets/SOExpCalc/types";

import "virtual:uno.css";

async function getSOExpMapByCharId(
  charId: string,
): Promise<SpecialOperatorDetailData["specialOperatorExpMap"] | undefined> {
  const response = await fetch(
    new URL(
      "/gamedata/latest/excel/special_operator_table.json",
      TORAPPU_ENDPOINT,
    ),
  );
  if (!response.ok) {
    console.error(
      "Failed to fetch special operator table:",
      response.statusText,
    );
    return;
  }

  const table: SpecialOperatorTable = await response.json();

  return table?.operatorDetailData?.[charId]?.specialOperatorExpMap;
}

async function main() {
  const ele = document.querySelector("#SOEC") as HTMLElement | null;
  if (ele) {
    if (!ele?.dataset?.opid) {
      console.error("data-opid attribute is missing on #SOEC element");
      return;
    }

    const expMap = await getSOExpMapByCharId(ele.dataset.opid);
    if (!expMap || expMap.length === 0 || expMap[0]?.length === 0) {
      console.error(
        "Failed to retrieve expMap for operator:",
        ele.dataset.opid,
      );
      return;
    }

    createApp(SOExpCalc, { expMap }).mount(ele);
  } else {
    console.error("data-opid or ele not found", ele);
  }
}

main();
