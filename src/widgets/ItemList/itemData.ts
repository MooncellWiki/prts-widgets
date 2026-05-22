import type { ItemData } from "./types";

export async function fetchAllItems(): Promise<ItemData[]> {
  const itemsMap = new Map<string, ItemData>();
  let offset = 0;
  while (offset % 500 === 0) {
    const resp = await fetch(
      `/api.php?${new URLSearchParams({
        action: "cargoquery",
        format: "json",
        limit: "500",
        tables: "item",
        fields:
          "name,description,purpose,obtain_method,rarity,category1,category2,itemId,sortId,iconId,filename,darkBackground",
        order_by: "sortId",
        offset: offset.toString(),
      })}`,
    );
    const json = await resp.json();
    if (!json.cargoquery?.length) break;

    for (const e of json.cargoquery) {
      const t = e.title;
      const itemId = t.itemId ?? "";
      if (!itemId) {
        console.warn("[ItemList] itemId为空,跳过:", t.name);
        continue;
      }
      const name = t.name ?? "";
      itemsMap.set(name, {
        name,
        description: t.description ?? "",
        usage: t.purpose ?? "",
        obtainApproach: (t["obtain method"] ?? "").split("、").filter(Boolean),
        rarity: Number(t.rarity),
        category1: t.category1 ?? "",
        category2: t.category2 ?? "",
        category3: t.category3 ?? "",
        categories: [t.category1, t.category2, t.category3].filter(Boolean),
        itemId,
        sortId: Number(t.sortId),
        iconId: t.iconId ?? "",
        filename: t.filename ?? "",
        darkBackground: t.darkBackground === "1",
      });
    }
    offset += json.cargoquery.length;
  }
  return Array.from(itemsMap.values()).sort((a, b) => a.sortId - b.sortId);
}
