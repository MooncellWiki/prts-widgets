import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { galleryLink, wikiBrandName } from "./compat";

import type { Brand, GalleryCard, Skin, SkinTable, WikiSkin } from "./types";

export function findBrand(table: SkinTable, name: string): Brand | undefined {
  return Object.values(table.brandList).find(
    (brand) =>
      brand.brandId === name ||
      wikiBrandName(brand.brandName) === wikiBrandName(name),
  );
}

export function buildCards(
  table: SkinTable,
  wiki: WikiSkin[],
  characters: Record<string, { name: string }>,
): GalleryCard[] {
  const brands = Object.values(table.brandList);
  const byGroup = new Map(
    brands.flatMap((b) => b.groupList.map((g) => [g.skinGroupId, b] as const)),
  );
  const skins = Object.values(table.charSkins).filter(
    (s) => s.displaySkin.skinName,
  );
  const byName = new Map<string, Skin[]>();
  for (const skin of skins) {
    const name = skin.displaySkin.skinName!.trim();
    byName.set(name, [...(byName.get(name) || []), skin]);
  }
  const used = new Set<string>();
  const cards = wiki.map((entry, index): GalleryCard => {
    const candidates = byName.get(entry.skinName) || [];
    const skin = candidates.find(
      (s) =>
        !used.has(s.skinId) &&
        (characters[s.charId]?.name === entry.charName ||
          (entry.charName.startsWith("阿米娅(") &&
            characters[s.charId]?.name === "阿米娅")),
    );
    if (skin) used.add(skin.skinId);
    const brand =
      (skin && byGroup.get(skin.displaySkin.skinGroupId)) ||
      findBrand(table, entry.series);
    return {
      ...entry,
      id: skin?.skinId || `wiki-${index}`,
      portraitId: skin?.portraitId,
      brandId: brand?.brandId || entry.series,
      brandCapitalName: brand?.brandCapitalName || "",
      skinGroupId: skin?.displaySkin.skinGroupId || "",
      tag: entry.tag || skin?.displaySkin.displayTagId || "",
    };
  });
  // 游戏先更新时仍展示新增时装，但不猜测 wiki 期号。
  const pending = skins
    .filter((s) => !used.has(s.skinId))
    .sort((a, b) => b.displaySkin.sortId - a.displaySkin.sortId)
    .map((skin): GalleryCard => {
      const display = skin.displaySkin;
      const brand =
        byGroup.get(display.skinGroupId) || table.brandList.crossover;
      return {
        id: skin.skinId,
        skinName: display.skinName!.trim(),
        charName: characters[skin.charId]?.name || display.modelName,
        charNameEn: display.modelName,
        skinIndex: "",
        series: wikiBrandName(brand?.brandName || "合作款"),
        anchor: display.skinName!.trim(),
        tag: display.displayTagId || "",
        period: "待编入期号",
        portraitId: skin.portraitId,
        brandId: brand?.brandId || "crossover",
        brandCapitalName: brand?.brandCapitalName || "CROSSOVER",
        skinGroupId: display.skinGroupId,
      };
    });
  return [...pending, ...cards];
}

export function brandSlides(brand: Brand, cards: GalleryCard[]) {
  const series = wikiBrandName(brand.brandName);
  return [
    ...brand.kvImgIdList.map((kv) => {
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
