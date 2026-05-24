import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "../utils/consts";
import { getImagePath } from "../utils/utils";
import ItemList from "../widgets/ItemList/index.vue";

import type { ItemData } from "../widgets/ItemList/types";

function readItemsFromDOM(): ItemData[] {
  const elements = document.querySelectorAll<HTMLDivElement>("#cargo-data>div");
  const items: ItemData[] = [];

  for (const el of elements) {
    const name = el.dataset.name ?? "";
    const itemId = el.dataset.itemId ?? "";
    if (!itemId) {
      console.warn("[ItemList] itemId为空,跳过:", name);
      continue;
    }

    const obtainMethodEl = el.querySelector<HTMLDivElement>(".obtain-method");
    const descriptionEl = el.querySelector<HTMLDivElement>(".description");
    const purposeEl = el.querySelector<HTMLDivElement>(".purpose");

    const filename = el.dataset.filename ?? "";
    const iconId = el.dataset.iconId ?? "";
    const imgSrc = (() => {
      if (filename === "") {
        return iconId === ""
          ? getImagePath("无图片占位符.png")
          : `${TORAPPU_ENDPOINT}/assets/item_icon/${iconId}.png`;
      } else {
        return filename;
      }
    })();

    items.push({
      name,
      description: descriptionEl?.textContent ?? "",
      descriptionHtml: descriptionEl?.innerHTML ?? "",
      usage: purposeEl?.textContent ?? "",
      usageHtml: purposeEl?.innerHTML ?? "",
      obtainApproach: (obtainMethodEl?.textContent ?? "")
        .split(/[,、，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      rarity: Number(el.dataset.rarity ?? "0"),
      category1: el.dataset.category1 ?? "",
      category2: el.dataset.category2 ?? "",
      category3: el.dataset.category3 ?? "",
      categories: [
        el.dataset.category1,
        el.dataset.category2,
        el.dataset.category3,
      ].filter(Boolean) as string[],
      itemId,
      sortId: Number(el.dataset.sortId ?? "0"),
      iconId,
      filename,
      darkBackground: el.dataset.darkBackground === "1",
      imgSrc,
    });
  }

  items.sort((a, b) => a.sortId - b.sortId);
  return items;
}

const ele = document.querySelector("#root");
if (ele) {
  const items = readItemsFromDOM();
  console.log(items);
  createApp(ItemList, { items }).mount(ele);
}
