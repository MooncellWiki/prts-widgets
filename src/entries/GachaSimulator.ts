import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT, WEEDY_ENDPOINT } from "@/utils/consts";
import { GachaData } from "@/widgets/GachaSimulator/gamedata-types";
import GachaSimulator from "@/widgets/GachaSimulator/index.vue";
import { GachaDBServer } from "@/widgets/GachaSimulator/types";

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

const [gachaServerTable, gachaClientTable] = await Promise.all([
  initWeedy(),
  initGachaTable(),
]);

const gachaDataRoot = document.querySelector<HTMLElement>("#gacha-data-root");
const { gachaPoolId, gachaBannerFile } = gachaDataRoot?.dataset || {};

const gachaClientPool = gachaClientTable.gachaPoolClient.find(
  (pool) => pool.gachaPoolId === "NORM_0_1_1",
);
const gachaServerPool = gachaServerTable.gachaPoolClient.find(
  (pool) => pool.gachaPoolId === "NORM_0_1_1",
);

const ele = document.querySelector("#root");
if (ele)
  createApp(GachaSimulator, {
    gachaPoolId,
    gachaBannerFile,
    gachaClientPool,
    gachaServerPool,
  }).mount(ele);
