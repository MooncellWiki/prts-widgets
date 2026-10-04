import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";

import { itemOptions, type FilterId } from "./filters";

export interface Item {
  /** 在模板输出里的次序：列表的 key（道具名、itemId 都有重复的） */
  index: number;
  name: string;
  itemId: string;
  /** 0–5 = 游戏的 ItemRarity TIER_1…TIER_6 */
  rarity: number;
  sortId: number;
  /** category1–3 里填了的 */
  categories: string[];
  usage: string;
  usageHtml: string;
  description: string;
  descriptionHtml: string;
  /** 获取途径按「、，,」拆开的各段 */
  obtain: string[];
  obtainHtml: string;
  icon: string;
  /** 图标是白色线稿，要垫深色底 */
  dark: boolean;
  href: string;
  /** 搜索用：名称 + 用途 + 描述，已转小写 */
  haystack: string;
  /** 落在各行筛选的哪些选项里 */
  options: Record<FilterId, ReadonlySet<string>>;
}

/** 取不到图时的占位图 */
export const PLACEHOLDER_ICON = getImagePath("无图片占位符.png");

/**
 * 道具图标：模板给了图（data-filename，现网的「道具 带框 <名>.png」或指定的文件）就用它，
 * 否则按 iconId 从 torappu 取——那批也是带底框的合成图。
 */
function iconOf(filename: string, iconId: string) {
  if (filename) return filename;
  return iconId
    ? `${TORAPPU_ENDPOINT}/assets/item_icon/${iconId}.png`
    : PLACEHOLDER_ICON;
}

/** 模板:道具筛选数据2 输出的一条 → Item；没有 itemId 的（已移除的旧道具）不收，同旧版 */
function readItem(el: HTMLElement, index: number): Item | null {
  const { dataset } = el;
  const name = dataset.name ?? "";
  const itemId = dataset.itemId ?? "";
  if (!itemId) return null;

  const part = (cls: string) => el.querySelector<HTMLElement>(`.${cls}`);
  const text = (node: HTMLElement | null) => node?.textContent?.trim() ?? "";
  const html = (node: HTMLElement | null) => node?.innerHTML.trim() ?? "";
  const usage = part("purpose");
  const description = part("description");
  const obtain = part("obtain-method");

  const base = {
    categories: [
      dataset.category1,
      dataset.category2,
      dataset.category3,
    ].filter((c): c is string => !!c),
    rarity: Number(dataset.rarity ?? "0"),
    obtain: text(obtain)
      .split(/[,、，]/)
      .map((s) => s.trim())
      .filter(Boolean),
  };

  return {
    ...base,
    index,
    name,
    itemId,
    sortId: Number(dataset.sortId ?? "0"),
    usage: text(usage),
    usageHtml: html(usage),
    description: text(description),
    descriptionHtml: html(description),
    obtainHtml: html(obtain),
    icon: iconOf(dataset.filename ?? "", dataset.iconId ?? ""),
    dark: dataset.darkBackground === "1",
    href: `/w/${encodeURIComponent(name)}`,
    haystack: [name, text(usage), text(description)].join("\n").toLowerCase(),
    options: itemOptions(base),
  };
}

/** 读页面上 #cargo-data 里的全部道具 */
export function readItems(container: ParentNode | null): Item[] {
  const items: Item[] = [];
  for (const el of container?.children ?? []) {
    const item = readItem(el as HTMLElement, items.length);
    if (item) items.push(item);
    else
      console.warn(
        "[ItemList] itemId 为空，跳过：",
        (el as HTMLElement).dataset.name,
      );
  }
  return items;
}
