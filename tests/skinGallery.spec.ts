import { createApp, nextTick } from "vue";

import { describe, expect, it } from "vitest";

import {
  expandSlider,
  replaceCarousel,
  replaceHome,
} from "../scripts/skin-gallery/patch";
import { halfPortrait, onImageError } from "../src/utils/charImage";
import Carousel from "../src/widgets/SkinGallery/Carousel.vue";
import {
  galleryLink,
  parseWikiSkins,
  wikiBrandName,
} from "../src/widgets/SkinGallery/compat";
import { brandSlides, buildCards } from "../src/widgets/SkinGallery/model";

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
  group = "2026#summer",
): Skin {
  return {
    skinId: id,
    charId,
    portraitId: `${charId}_summer#1`,
    displaySkin: {
      skinName: name,
      skinGroupId: group,
      skinGroupName: "珊瑚海岸",
      modelName: charId,
      displayTagId: "活动获得",
      sortId: 1,
    },
  };
}
const wiki = `===Y-7 20===
{{时装回廊/半身像|干员名=阿米娅(近卫)|干员外文名=AMIYA|时装名=触及星辰|时装序号=2|时装系列=珊瑚海岸|锚点=自定义_锚点}}
<!-- {{时装回廊/半身像|时装名=不应出现}} -->
===Y-7 19===
{{时装回廊/半身像|干员名=甲|时装名=同名|时装系列=珊瑚海岸}}
{{时装回廊/半身像|干员名=乙|时装名=同名|时装系列=珊瑚海岸}}
{{时装回廊/半身像|干员名=新干员|时装名=新时装|时装序号=3|时装系列=珊瑚海岸|时装注释=联动获得}}`;

describe("时装回廊迁移", () => {
  it("保留期号、同名时装、显式锚点、外文名并排除注释", () => {
    const parsed = parseWikiSkins(wiki);
    expect(parsed).toHaveLength(4);
    expect(parsed[0]).toMatchObject({
      period: "Y-7 20",
      anchor: "自定义_锚点",
      charNameEn: "AMIYA",
      skinIndex: "2",
    });
    expect(parsed.slice(1).map((s) => s.period)).toEqual([
      "Y-7 19",
      "Y-7 19",
      "Y-7 19",
    ]);
    expect(parsed[3].tag).toBe("联动获得");
  });

  it("品牌名与 URL 兼容 wiki，特殊字符不截断图片和锚点", () => {
    expect(wikiBrandName("0011/飙系列")).toBe("0011-飙系列");
    expect(wikiBrandName("0011/韵系列")).toBe("0011-韵系列");
    expect(wikiBrandName("巫异盛宴 ")).toBe("巫异盛宴");
    expect(galleryLink("珊瑚海岸", "假日 HD91#1")).toContain(
      encodeURIComponent("假日_HD91#1"),
    );
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

  it("按干员与时装名配对，兼容升变阿米娅；wiki/game 两侧新增均不丢失", () => {
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
        a: skin("a", "触及星辰", "amiya"),
        b: skin("b", "同名", "a"),
        c: skin("c", "同名", "b"),
        d: skin("d", "游戏新时装", "new", "collab"),
      },
    };
    const cards = buildCards(table, parseWikiSkins(wiki), {
      amiya: { name: "阿米娅" },
      a: { name: "甲" },
      b: { name: "乙" },
    });
    expect(cards).toHaveLength(5);
    expect(cards[0]).toMatchObject({
      period: "待编入期号",
      series: "合作款",
      skinName: "游戏新时装",
    });
    expect(cards[1]).toMatchObject({
      id: "a",
      anchor: "自定义_锚点",
      charName: "阿米娅(近卫)",
    });
    expect(cards.slice(2, 4).map((c) => c.id)).toEqual(["b", "c"]);
    expect(cards[4]).toMatchObject({
      skinName: "新时装",
      portraitId: undefined,
      skinIndex: "3",
    });
    const slides = brandSlides(brand(), cards);
    expect(slides).toHaveLength(25);
    expect(slides[0].id).toBe("kv_summer24");
    expect(slides[0].linked[0].href).toContain(
      encodeURIComponent("自定义_锚点"),
    );
    expect(slides.at(-1)?.id).toBe("default_kv_summer");
    expect(
      brandSlides(brand({ brandId: "ambienceSynesthesia" }), []).at(-1)?.src,
    ).toContain("default_kv_ambienceSynesthesia.png");
  });

  it("游戏先更新且 wiki 没有时装编号时不回退成默认服装", () => {
    const img = document.createElement("img");
    img.src = halfPortrait({ zh: "阿米娅", portraitId: "game_only#1" });
    img.addEventListener("error", onImageError);
    img.dispatchEvent(new Event("error"));
    expect(img.src).toContain("game_only%231.png");
    expect(img.style.visibility).toBe("hidden");
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

  it("临时扩槽保持顺序及隐藏参数，重复运行不重复添加", () => {
    const slot = (id: string) =>
      `<div class="swiper-slide" style="<!--{$imgdis_${id}|regex_replace:'x':''}-->"><img src="<!--{$sliderimg_${id}|regex_replace:'x':''}-->"></div>`;
    const old = [
      ...Array.from({ length: 10 }, (_, i) => slot(String(10 - i))),
      slot("default"),
    ].join("\n");
    const fixed = expandSlider(old);
    expect(
      [...fixed.matchAll(/\$sliderimg_(\d+|default)\|/g)].map((m) => m[1]),
    ).toEqual([
      ...Array.from({ length: 20 }, (_, i) => String(20 - i)),
      "default",
    ]);
    expect(fixed).toContain("$imgdis_20|");
    expect(fixed).toContain(old);
    expect(expandSlider(fixed)).toBe(fixed);
    expect(() => expandSlider("unknown format")).toThrow(
      "Slider 槽位结构已变化",
    );
  });

  it("迁移只替换轮播及首页引用，保留运营表格及模板数据源", () => {
    const old =
      "__NOTOC__\n{{时装回廊/轮播\n|图1={{filepath:宣传图.png|nowiki}}\n|名称=时代\n}}\n==时装==\n{{干员时装|价格=18}}";
    const migrated = replaceCarousel(old, "epoque");
    expect(migrated).toBe(
      "__NOTOC__\n{{#Widget:SkinGalleryV2|mode=carousel|brand=epoque}}\n==时装==\n{{干员时装|价格=18}}",
    );
    expect(replaceCarousel(migrated, "epoque")).toBe(migrated);
    expect(() => replaceCarousel("{{时装回廊/轮播", "epoque")).toThrow(
      "轮播模板括号不匹配",
    );
    expect(replaceHome("{{Ads}}\n{{时装回廊}}")).toBe(
      "{{Ads}}\n{{#Widget:SkinGalleryV2}}",
    );
  });
});
