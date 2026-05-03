import type { ItemData } from "./types";

export async function fetchAllItems(): Promise<ItemData[]> {
  const items: ItemData[] = [];
  let offset = 0;
  while (offset % 5000 === 0) {
    const resp = await fetch(
      `/api.php?${new URLSearchParams({
        action: "cargoquery",
        format: "json",
        limit: "5000",
        tables: "item",
        fields:
          "name,description,purpose,obtain_method,rarity,category1,category2,itemId,sortId,iconId,forceWikiFile,darkBackground",
        order_by: "sortId",
        offset: offset.toString(),
      })}`,
    );
    const json = await resp.json();
    if (!json.cargoquery?.length) break;

    for (const e of json.cargoquery) {
      const t = e.title;
      items.push({
        name: t.name ?? "",
        description: t.description ?? "",
        usage: t.purpose ?? "",
        obtainApproach: (t["obtain method"] ?? "")
          .split("、")
          .filter(Boolean),
        rarity: Number(t.rarity),
        category1: t.category1 ?? "",
        category2: t.category2 ?? "",
        categories: [t.category1, t.category2].filter(Boolean),
        itemId: t.itemId ?? "",
        sortId: Number(t.sortId),
        iconId: t.iconId ?? "",
        forceWikiFile: t.forceWikiFile === "1",
        darkBackground: t.darkBackground === "1",
      });
    }
    offset += json.cargoquery.length;
  }
  return items;
}
