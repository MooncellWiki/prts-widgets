import { defineQueryOptions } from "@pinia/colada";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { buildCards } from "./model";

import type { CharNames, GalleryData, SkinTable } from "./types";

/** cargo `chara` 表一次最多 500 行，全表 470 行左右，正常一次就够 */
const CARGO_LIMIT = 500;

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
  return response;
}

async function skinTable(): Promise<SkinTable> {
  const response = await get(
    `${TORAPPU_ENDPOINT}/gamedata/latest/excel/skin_table.json`,
  );
  return (await response.json()) as SkinTable;
}

/**
 * 干员中文名，含 `阿米娅(近卫)` 这种职业后缀——gamedata 的 `character_table.json` 里
 * 升变形态没有条目，而且那文件 8 MB，只为一个名字不值得。cargo 全表约 40 KB，分页取完。
 */
async function charNames(): Promise<CharNames> {
  const names: CharNames = {};
  for (let offset = 0; ; offset += CARGO_LIMIT) {
    const response = await get(
      `/api.php?${new URLSearchParams({
        action: "cargoquery",
        format: "json",
        tables: "chara",
        fields: "charId,cn",
        limit: String(CARGO_LIMIT),
        offset: String(offset),
      })}`,
    );
    const json = (await response.json()) as {
      cargoquery?: { title: { charId: string; cn: string } }[];
      error?: { info: string };
    };
    if (json.error) throw new Error(json.error.info);
    const rows = json.cargoquery ?? [];
    for (const { title } of rows) names[title.charId] = title.cn;
    if (rows.length < CARGO_LIMIT) return names;
  }
}

/**
 * 卡片全部从 gamedata 推导（见 model.ts 的 buildCards），wiki 只贡献干员中文名。
 * 与旧实现的两点差别：
 * - 不再请求 `模板:时装回廊` 的 wikitext，期号/顺序/锚点/注释的推导已与它逐条核对过；
 * - 干员名改走 cargo：`character_table.json` 是 8 MB，换成一个约 40 KB 的分页请求。
 * wiki 比游戏快时（模板里已有、skin_table 还没有的时装）暂时看不到，见迁移 issue 的后续项。
 */
export const galleryQuery = defineQueryOptions({
  key: ["skin-gallery", "v2"],
  query: async (): Promise<GalleryData> => {
    const [table, names] = await Promise.all([skinTable(), charNames()]);
    return { table, cards: buildCards(table, names) };
  },
});
