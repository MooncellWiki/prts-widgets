import { defineQueryOptions } from "@pinia/colada";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { parseWikiSkins } from "./compat";
import { buildCards } from "./model";

import type { GalleryData, SkinTable } from "./types";

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`请求失败：HTTP ${response.status}`);
  return response;
}

export const galleryQuery = defineQueryOptions({
  key: ["skin-gallery", "v2"],
  query: async (): Promise<GalleryData> => {
    const [table, characters, source] = await Promise.all([
      get(`${TORAPPU_ENDPOINT}/gamedata/latest/excel/skin_table.json`).then(
        (r) => r.json() as Promise<SkinTable>,
      ),
      get(
        `${TORAPPU_ENDPOINT}/gamedata/latest/excel/character_table.json`,
      ).then((r) => r.json() as Promise<Record<string, { name: string }>>),
      get(
        `/index.php?${new URLSearchParams({ title: "模板:时装回廊", action: "raw", maxage: "3600", smaxage: "3600" })}`,
      ).then((r) => r.text()),
    ]);
    const wiki = parseWikiSkins(source);
    if (!wiki.length) throw new Error("时装回廊期号数据为空，请检查模板数据源");
    return { table, cards: buildCards(table, wiki, characters) };
  },
});
