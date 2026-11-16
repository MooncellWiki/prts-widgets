import { createApp, nextTick } from "vue";

import { describe, expect, it } from "vitest";

import { halfPortrait, onImageError } from "../src/utils/charImage";
import Carousel from "../src/widgets/SkinGallery/Carousel.vue";
import {
  brandSlides,
  buildCards,
  galleryLink,
  portraitChar,
  wikiBrandName,
} from "../src/widgets/SkinGallery/model";

import type { Brand, Skin, SkinTable } from "../src/widgets/SkinGallery/types";

function brand(overrides: Partial<Brand> = {}): Brand {
  return {
    brandId: "summer",
    brandName: "珊瑚海岸",
    brandCapitalName: "CORAL COAST",
    description: "介绍\n第二行",
    sortId: 1,
    groupList: [{ skinGroupId: "2026#summer", publishTime: 0 }],
    kvImgIdList: Array.from({ length: 24 }, (_, i) => ({
      kvImgId: `kv_summer${24 - i}`,
      linkedSkinGroupId: "2026#summer",
    })),
    ...overrides,
  };
}

function skin(
  id: string,
  name: string,
  charId: string,
  display: Partial<Skin["displaySkin"]> = {},
): Skin {
  return {
    skinId: id,
    charId,
    portraitId: `${charId}_summer#1`,
    displaySkin: {
      skinName: name,
      skinGroupId: "2026#summer",
      skinGroupName: "珊瑚海岸",
      modelName: charId,
      displayTagId: "活动获得",
      sortId: 1,
      getTime: 0,
      onYear: 7,
      onPeriod: 20,
      ...display,
    },
  };
}

const names = {
  char_002_amiya: "阿米娅",
  char_1001_amiya2: "阿米娅(近卫)",
  char_1002_amiya3: "阿米娅(医疗)",
  char_2014_nian: "年",
  char_2015_dusk: "夕",
};

describe("时装回廊迁移", () => {
  it("期号、顺序、注释、锚点全部由 gamedata 推导", () => {
    const table: SkinTable = {
      brandList: {
        summer: brand(),
        crossover: brand({
          brandId: "crossover",
          brandName: "合作款",
          groupList: [],
        }),
      },
      charSkins: {
        a: skin("a", "触及星辰", "char_002_amiya", {
          onYear: 7,
          onPeriod: 19,
          getTime: 1,
        }),
        b: skin("b", "同名", "char_2014_nian", {
          onYear: 7,
          onPeriod: 20,
          getTime: 2,
          sortId: 9,
        }),
        c: skin("c", "同名", "char_2015_dusk", {
          onYear: 7,
          onPeriod: 20,
          getTime: 2,
          sortId: 8,
        }),
      },
    };
    const cards = buildCards(table, names);
    // 期号倒序；同期同时间按 sortId 升序
    expect(cards.map((c) => [c.skinName, c.period])).toEqual([
      ["同名", "Y-7 20"],
      ["同名", "Y-7 20"],
      ["触及星辰", "Y-7 19"],
    ]);
    expect(cards[0].id).toBe("c");
    expect(cards.every((c) => c.anchor === c.skinName)).toBe(true);
    expect(cards.every((c) => c.tag === "活动获得")).toBe(true);
    expect(cards.every((c) => c.series === "珊瑚海岸")).toBe(true);
  });

  it("onYear 为 0 也照常出期号（不能用真值判断）", () => {
    const table: SkinTable = {
      brandList: { summer: brand() },
      charSkins: {
        a: skin("a", "老时装", "char_2014_nian", { onYear: 0, onPeriod: 3 }),
      },
    };
    expect(buildCards(table, names)[0].period).toBe("Y-0 03");
  });

  it("干员名按 portraitId 最长前缀查 cargo，认出升变阿米娅", () => {
    const ids = Object.keys(names).sort((a, b) => b.length - a.length);
    expect(portraitChar("char_1001_amiya2_casc#1", ids)).toBe(
      "char_1001_amiya2",
    );
    expect(portraitChar("char_2014_nian_sale#1", ids)).toBe("char_2014_nian");
    expect(portraitChar("char_unknown_x#1", ids)).toBeUndefined();

    const table: SkinTable = {
      brandList: { summer: brand() },
      charSkins: {
        a: {
          ...skin("a", "触及星辰", "char_002_amiya"),
          portraitId: "char_1001_amiya2_casc#1",
        },
      },
    };
    const [card] = buildCards(table, names);
    expect(card.charName).toBe("阿米娅(近卫)");
    expect(card.charId).toBe("char_1001_amiya2");
    expect(card.portraitId).toBe("char_1001_amiya2_casc#1");
  });

  it("cargo 取不到干员名时退化成外文名，不丢卡片", () => {
    const table: SkinTable = {
      brandList: { summer: brand() },
      charSkins: { a: skin("a", "触及星辰", "char_002_amiya") },
    };
    expect(buildCards(table, {})[0].charName).toBe("char_002_amiya");
  });

  it("半身像序号按同一形态的获取时间排序", () => {
    const table: SkinTable = {
      brandList: { summer: brand() },
      charSkins: {
        a: skin("a", "晚", "char_2014_nian", { getTime: 300 }),
        b: skin("b", "早", "char_2014_nian", { getTime: 100 }),
        c: skin("c", "中", "char_2014_nian", { getTime: 200 }),
      },
    };
    const cards = buildCards(table, names);
    const byName = new Map(cards.map((c) => [c.skinName, c.skinIndex]));
    expect(byName.get("早")).toBe("1");
    expect(byName.get("中")).toBe("2");
    expect(byName.get("晚")).toBe("3");
  });

  it("品牌名与 URL 兼容 wiki，特殊字符不截断图片和锚点", () => {
    expect(wikiBrandName("0011/飙系列")).toBe("0011-飙系列");
    expect(wikiBrandName("0011/韵系列")).toBe("0011-韵系列");
    expect(wikiBrandName("巫异盛宴 ")).toBe("巫异盛宴");
    expect(galleryLink("珊瑚海岸", "假日 HD91#1")).toContain(
      encodeURIComponent("假日_HD91#1"),
    );
  });

  it("宣传图按编号倒序，修掉 kvImgIdList 里 8,6,7 这类乱序", () => {
    const cards = buildCards(
      {
        brandList: { summer: brand() },
        charSkins: { a: skin("a", "触及星辰", "char_002_amiya") },
      },
      names,
    );
    const slides = brandSlides(brand(), cards);
    expect(slides).toHaveLength(25);
    expect(slides[0].id).toBe("kv_summer24");
    expect(slides[0].linked[0]).toMatchObject({
      name: "触及星辰",
      href: galleryLink("珊瑚海岸", "触及星辰"),
    });
    expect(slides.at(-1)?.id).toBe("default_kv_summer");

    const boc = brandSlides(
      brand({
        brandId: "boc",
        brandName: "斗争血脉",
        kvImgIdList: [8, 6, 7, 5, 4, 3, 1, 2].map((n) => ({
          kvImgId: `kv_boc${n}`,
          linkedSkinGroupId: "2026#summer",
        })),
      }),
      [],
    );
    expect(boc.slice(0, 8).map((s) => s.id)).toEqual(
      [8, 7, 6, 5, 4, 3, 2, 1].map((n) => `kv_boc${n}`),
    );
    expect(
      brandSlides(brand({ brandId: "ambienceSynesthesia" }), []).at(-1)?.src,
    ).toContain("default_kv_ambienceSynesthesia.png");
  });

  it("半身像：有 portraitId 时按 ID 取，失败回退 wiki 时装图", () => {
    const src = halfPortrait({
      zh: "阿米娅",
      portraitId: "char_002_amiya_summer#1",
      skinIndex: "2",
    });
    expect(new URL(src).hash).toBe("");
    expect(src).toContain("summer%231.png");

    const img = document.createElement("img");
    img.src = src;
    img.addEventListener("error", onImageError);
    img.dispatchEvent(new Event("error"));
    expect(decodeURI(img.src)).toContain("半身像_阿米娅_skin2.png");
    img.dispatchEvent(new Event("error"));
    expect(img.style.visibility).toBe("hidden");
  });

  it("没有时装序号时不退回默认服装冒充该时装", () => {
    const img = document.createElement("img");
    img.src = halfPortrait({ zh: "阿米娅", portraitId: "game_only#1" });
    img.addEventListener("error", onImageError);
    img.dispatchEvent(new Event("error"));
    expect(img.src).toContain("game_only%231.png");
    expect(img.style.visibility).toBe("hidden");
  });

  it("有时装序号但没有 portraitId 时直接走 wiki 图，不去取默认服装", () => {
    const src = halfPortrait({
      zh: "阿米娅",
      charId: "char_002_amiya",
      skinIndex: "3",
    });
    expect(src).toContain("半身像_阿米娅_skin3.png");
    expect(src).not.toContain("char_002_amiya_1");
  });

  it("轮播支持超过 20 张、首尾循环及单页多实例", async () => {
    const first = document.createElement("div"),
      second = document.createElement("div");
    const app = createApp(Carousel, { brand: brand(), cards: [] });
    const other = createApp(Carousel, {
      brand: brand({ brandId: "epoque", kvImgIdList: [] }),
      cards: [],
    });
    app.mount(first);
    other.mount(second);
    expect(first.querySelectorAll("option")).toHaveLength(25);
    first
      .querySelector<HTMLButtonElement>('button[aria-label="上一张宣传图"]')!
      .click();
    await nextTick();
    expect(first.querySelector("img")?.src).toContain("default_kv_summer.png");
    expect(second.querySelector("img")?.src).toContain("default_kv_epoque.png");
    first
      .querySelector<HTMLButtonElement>('button[aria-label="下一张宣传图"]')!
      .click();
    await nextTick();
    expect(first.querySelector("img")?.src).toContain("kv_summer24.png");
    app.unmount();
    other.unmount();
  });
});
