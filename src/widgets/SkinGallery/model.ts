import { TORAPPU_ENDPOINT } from "@/utils/consts";

import type { Brand, CharNames, GalleryCard, Skin, SkinTable } from "./types";

/** wiki 侧的品牌名与 `Skin brand {系列}.png` 一致：`0011/飙系列` 写作 `0011-飙系列`，`巫异盛宴` 去掉尾空格 */
export function wikiBrandName(name: string): string {
  return name.trim().replace(/^0011\//, "0011-");
}

export function galleryLink(series: string, anchor?: string): string {
  return `/w/${encodeURIComponent("时装回廊")}/${encodeURIComponent(series)}${anchor ? `#${encodeURIComponent(anchor.replaceAll(" ", "_"))}` : ""}`;
}

export function findBrand(table: SkinTable, name: string): Brand | undefined {
  return Object.values(table.brandList).find(
    (brand) =>
      brand.brandId === name ||
      wikiBrandName(brand.brandName) === wikiBrandName(name),
  );
}

/**
 * 期号：`Y-{onYear} {onPeriod}`，`onPeriod` 补两位。
 * 与 wiki `模板:时装回廊` 的 `===Y-x==='` 分段逐条核对过 533/533 一致；
 * `sortId`、`skinGroupSortIndex` 都与期号划分无关，别拿来推。
 * 注意 `onYear` 可以是 0（Y-0 01 之类），不能用真值判断缺省。
 */
function periodOf(skin: Skin): string {
  const { onYear, onPeriod } = skin.displaySkin;
  return `Y-${onYear} ${String(onPeriod).padStart(2, "0")}`;
}

/**
 * `portraitId` 以干员 ID 开头，但升变形态用的是另一个 ID（阿米娅是 `char_1001_amiya2`）。
 * cargo `chara` 表里有这些形态的中文名（`阿米娅(近卫)`），按最长前缀取出对应 ID。
 */
export function portraitChar(
  portraitId: string,
  ids: readonly string[],
): string | undefined {
  return ids.find(
    (id) =>
      portraitId.startsWith(id) &&
      (portraitId.length === id.length ||
        "_@#-".includes(portraitId[id.length])),
  );
}

function orderedSkins(table: SkinTable): Skin[] {
  return Object.values(table.charSkins)
    .filter((s) => s.displaySkin.skinName?.trim())
    .sort((a, b) => {
      const x = a.displaySkin;
      const y = b.displaySkin;
      return (
        y.onYear - x.onYear ||
        y.onPeriod - x.onPeriod ||
        x.getTime - y.getTime ||
        x.sortId - y.sortId
      );
    });
}

/**
 * 半身像失败时回退的 wiki 文件名里的序号：同一形态的时装按获取时间排第几张。
 * 与 wiki `时装序号` 逐条核对过 533/533 一致；`skinId` 尾巴上的 `#N` 是另一套编号，不能用。
 */
function skinIndexes(
  skins: Skin[],
  ids: readonly string[],
): Map<string, string> {
  const byChar = new Map<string, Skin[]>();
  for (const skin of skins) {
    const charId = portraitChar(skin.portraitId, ids) || skin.charId;
    byChar.set(charId, [...(byChar.get(charId) || []), skin]);
  }
  const index = new Map<string, string>();
  for (const list of byChar.values()) {
    [...list]
      .sort(
        (a, b) =>
          a.displaySkin.getTime - b.displaySkin.getTime ||
          a.displaySkin.sortId - b.displaySkin.sortId,
      )
      .forEach((skin, position) =>
        index.set(skin.skinId, String(position + 1)),
      );
  }
  return index;
}

/**
 * 卡片全部由 `skin_table` 推导，不再解析 `模板:时装回廊` 的 wikitext：
 * 期号、顺序、锚点、注释、外文名、半身像序号都与该模板逐条核对过 533/533 一致。
 * 只用到 cargo 的干员中文名（含职业后缀），拿不到时退化成外文名。
 */
export function buildCards(table: SkinTable, names: CharNames): GalleryCard[] {
  const brands = Object.values(table.brandList);
  const byGroup = new Map(
    brands.flatMap((b) => b.groupList.map((g) => [g.skinGroupId, b] as const)),
  );
  const skins = orderedSkins(table);
  const ids = Object.keys(names).sort((a, b) => b.length - a.length);
  const indexes = skinIndexes(skins, ids);

  return skins.map((skin): GalleryCard => {
    const display = skin.displaySkin;
    const portraitId = skin.portraitId || undefined;
    const charId = (portraitId && portraitChar(portraitId, ids)) || skin.charId;
    const brand = byGroup.get(display.skinGroupId) || table.brandList.crossover;
    const skinName = display.skinName!.trim();
    return {
      id: skin.skinId,
      skinId: skin.skinId,
      portraitId,
      charId,
      skinName,
      charName: names[charId] || display.modelName,
      // wiki 那行是全大写，但 `Лето`、`Wiš'adel` 这类大小写混排的原样更准，直接用 modelName
      charNameEn: display.modelName,
      skinIndex: indexes.get(skin.skinId) || "1",
      series: wikiBrandName(brand?.brandName || "合作款"),
      anchor: skinName,
      tag: display.displayTagId || "",
      period: periodOf(skin),
      brandId: brand?.brandId || "crossover",
      brandCapitalName: brand?.brandCapitalName || "CROSSOVER",
      skinGroupId: display.skinGroupId,
    };
  });
}

function kvOrder(id: string): number {
  return Number(id.match(/(\d+)$/)?.[1] ?? -1);
}

/**
 * 宣传图按 `kvImgIdList` 的顺序，末尾补品牌默认图。
 * 多数品牌本来就是倒序，但 `斗争血脉` 是 8,6,7,5…，按编号倒序排才和旧页一致。
 */
export function brandSlides(brand: Brand, cards: GalleryCard[]) {
  const series = wikiBrandName(brand.brandName);
  return [
    ...[...brand.kvImgIdList]
      .sort((a, b) => kvOrder(b.kvImgId) - kvOrder(a.kvImgId))
      .map((kv) => {
        const linked = cards.filter(
          (card) => card.skinGroupId === kv.linkedSkinGroupId,
        );
        return {
          id: kv.kvImgId,
          src: `${TORAPPU_ENDPOINT}/assets/skin_kv/${encodeURIComponent(kv.kvImgId)}.png`,
          label: linked.length
            ? linked.map((card) => card.skinName).join(" · ")
            : series,
          linked: linked.map((card) => ({
            name: card.skinName,
            href: galleryLink(card.series, card.anchor),
          })),
        };
      }),
    {
      id: `default_kv_${brand.brandId}`,
      src: `${TORAPPU_ENDPOINT}/assets/skin_kv/${encodeURIComponent(`default_kv_${brand.brandId}`)}.png`,
      label: `${series} · 品牌图`,
      linked: [],
    },
  ];
}
