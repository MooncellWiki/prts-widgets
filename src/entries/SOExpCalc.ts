import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import "virtual:uno.css";

import SOExpCalc from "../widgets/SOExpCalc.vue";

async function getSOTree(charId: string) {
  const response = await fetch(
    new URL(
      "/gamedata/latest/excel/special_operator_table.json",
      TORAPPU_ENDPOINT,
    ),
  );
  const SOTable = await response.json();

  return await SOTable.operatorDetailData[charId].specialOperatorExpMap;
}

async function main() {
  const ele = document.querySelector("#SOEC") as HTMLElement | null;
  if (ele) {
    const retval = await getSOTree(ele?.dataset?.opid || "");

    createApp(SOExpCalc, { exptree: retval }).mount(ele);
  } else {
    console.error("data-opid or ele not found", ele);
  }
}

main();
