import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT, WEEDY_ENDPOINT } from "@/utils/consts";
import { GachaData } from "@/widgets/GachaSimulatorV2/gamedata-types";
import GachaSimulator from "@/widgets/GachaSimulatorV2/index.vue";
import { GachaDBServer } from "@/widgets/GachaSimulatorV2/types";

async function initWeedy(): Promise<GachaDBServer> {
  const response = await fetch(new URL("/gacha_table.json", WEEDY_ENDPOINT));
  const data = await response.json();

  return data;
}

async function initGachaTable(): Promise<GachaData> {
  const response = await fetch(
    new URL("/gamedata/latest/excel/gacha_table.json", TORAPPU_ENDPOINT),
  );
  const data = await response.json();

  return data;
}

async function main() {
  const [gachaServerTable, gachaClientTable] = await Promise.all([
    initWeedy(),
    initGachaTable(),
  ]);

  const gachaDataRoot = document.querySelector<HTMLElement>("#gacha-data-root");
  const { gachaPoolId } = gachaDataRoot?.dataset || {};
  const gachaBannerFile = gachaDataRoot?.dataset.gachaBannerFile?.replace(
    / /g,
    "_",
  );

  const gachaClientPool = gachaClientTable.gachaPoolClient.find(
    (pool) => pool.gachaPoolId === gachaPoolId,
  );

  const newbeeClientPool = gachaClientTable.newbeeGachaPoolClient.find(
    (pool) => pool.gachaPoolId === gachaPoolId,
  );

  const gachaServerPool = gachaServerTable.gachaPoolClient.find(
    (pool) => pool.gachaPoolId === gachaPoolId,
  );

  const ele = document.querySelector("#root");
  if (ele)
    createApp(GachaSimulator, {
      gachaPoolId,
      gachaBannerFile,
      gachaClientPool,
      gachaServerPool,
      newbeeClientPool,
    }).mount(ele);
}

main();
