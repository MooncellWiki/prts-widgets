import { describe, expect, it } from "vitest";

import type {
  HighGood,
  HighShopData,
  SkinShopData,
} from "@/widgets/Shop/types";
import {
  buildHighShopView,
  formatCstTime,
  formatRemaining,
  getOnSaleSkins,
  kernelSelectIconName,
  parseSkinGallery,
  wikiItemName,
  wikiLink,
} from "@/widgets/Shop/utils";

import highShopJson from "./fixtures/shop_high.json";
import skinShopJson from "./fixtures/shop_skin.json";

// 2026-09-27 的 weedy 快照；shop_high 只保留了 goodList 引用到的阶梯
const highShop = highShopJson as HighShopData;
const skinShop = skinShopJson as SkinShopData;

describe("formatCstTime", () => {
  it.each([
    [1790193600, "2026-09-24 04:00"],
    [1791403199, "2026-10-08 03:59"],
    [0, "1970-01-01 08:00"],
    [-1, ""],
  ])("%i 格式化为 %j", (timestamp, expected) => {
    expect(formatCstTime(timestamp)).toBe(expected);
  });
});

describe("formatRemaining", () => {
  it.each([
    [59, "0分钟"],
    [3599, "59分钟"],
    [3600, "1小时0分钟"],
    [86400, "1天0小时0分钟"],
    [90061, "1天1小时1分钟"],
  ])("%i 秒显示为 %s", (seconds, expected) => {
    expect(formatRemaining(seconds)).toBe(expected);
  });
});

describe("wikiLink", () => {
  it("锚点里的空格转成下划线", () => {
    expect(wikiLink("时装回廊/珊瑚海岸", "悠然假日 HD31")).toBe(
      "/w/时装回廊/珊瑚海岸#悠然假日_HD31",
    );
  });

  it("没有锚点时只拼标题", () => {
    expect(wikiLink("危机合约")).toBe("/w/危机合约");
  });
});

describe("parseSkinGallery", () => {
  const gallery = parseSkinGallery(`===Y-7 14===
{{时装回廊/半身像
|干员名=录武官
|时装序号=1
|干员外文名=RECORD KEEPER
|时装名=照寰瀛
|时装系列=0011-韵系列
}}{{时装回廊/半身像
|干员名=华法琳
|时装序号=2
|时装名=悠然假日 HD31
|锚点=悠然假日_HD31
|时装注释=活动获得
|时装系列=珊瑚海岸
}}{{时装回廊/半身像|干员名=重名|时装序号=3|时装名=照寰瀛|时装系列=时代}}
{{时装回廊/半身像|干员名=缺序号|时装名=缺序号时装|时装系列=时代}}`);

  it("按时装名索引，同名时取第一条", () => {
    expect(gallery.get("照寰瀛")).toEqual({
      skinName: "照寰瀛",
      charName: "录武官",
      skinIndex: "1",
      series: "0011-韵系列",
      anchor: "照寰瀛",
      tag: "",
    });
    expect([...gallery.keys()]).toEqual([
      "照寰瀛",
      "悠然假日 HD31",
      "缺序号时装",
    ]);
  });

  it("保留锚点与时装注释", () => {
    expect(gallery.get("悠然假日 HD31")).toEqual({
      skinName: "悠然假日 HD31",
      charName: "华法琳",
      skinIndex: "2",
      series: "珊瑚海岸",
      anchor: "悠然假日_HD31",
      tag: "活动获得",
    });
  });

  it("缺少时装序号时按 1 处理", () => {
    expect(gallery.get("缺序号时装")?.skinIndex).toBe("1");
  });
});

describe("getOnSaleSkins", () => {
  it("去掉价格为 0 的占位商品", () => {
    expect(
      getOnSaleSkins(skinShop.goodList, 1790300000).map((g) => g.skinName),
    ).toEqual([
      "照寰瀛",
      "桂影窗",
      "松间月",
      "遗迹游学者",
      "至高判决",
      "新手光环",
      "破晓",
    ]);
  });

  it("去掉已过结束时间的商品", () => {
    expect(getOnSaleSkins(skinShop.goodList, 1791489600)).toEqual([]);
  });
});

describe("buildHighShopView", () => {
  const view = buildHighShopView(highShop);
  const names = (goods: HighGood[]) => goods.map((g) => g.displayName);

  it("前两个干员合同归标准池，其余归中坚池", () => {
    expect(names(view.standard)).toEqual(["涤火杰西卡", "洋灰"]);
    expect(names(view.kernel)).toEqual(["艾雅法拉", "初雪"]);
    expect(view.kernelSelect).toBe(false);
  });

  it("当期阶梯只含凭证与许可，保持商店顺序", () => {
    expect(view.ladders.map((l) => [l.steps[0].displayName, l.total])).toEqual([
      ["寻访凭证", 258],
      ["中坚寻访凭证", 216],
      ["加急许可", 138],
    ]);
  });

  it("其余当期商品归入通用信物与养成材料", () => {
    expect(names(view.materials)).toEqual([
      "模组数据块",
      "芯片助剂",
      "特种遗产信物",
      "辅助遗产信物",
      "特种皇家信物",
      "辅助皇家信物",
      "白马醇",
      "三水锰矿",
      "炽合金块",
      "晶体电路",
      "环烃预制体",
      "手性屈光体",
    ]);
  });

  it("当期合计与原页面的 2952+ 一致", () => {
    expect(view.total).toBe(2952);
    expect(view.hasUnlimited).toBe(true);
  });

  it("常驻往期复刻的合计与原页面的 1420 一致", () => {
    expect(
      view.reeditionOperators.map((l) => [l.steps[0].displayName, l.total]),
    ).toEqual([
      ["柏喙", 65],
      ["稀音", 65],
      ["图耶", 65],
      ["埃拉托", 65],
    ]);
    expect(view.reeditionSkins).toHaveLength(29);
    expect(view.reeditionSkinTotal).toBe(1160);
    expect(view.reeditionOperatorTotal + view.reeditionSkinTotal).toBe(1420);
  });

  it("中坚甄选商品归入中坚池并标记甄选", () => {
    // 原 模块:WeedyJsonDecode 只按类型名里是否含 CLASSIC_FES_PICK 判断
    const withSelect = buildHighShopView({
      ...highShop,
      goodList: highShop.goodList.map((good) =>
        good.goodId === "HS_17088"
          ? {
              ...good,
              displayName: "中坚甄选6星干员",
              item: { id: "fes_pick_6", count: 1, type: "CLASSIC_FES_PICK_6" },
            }
          : good,
      ),
    });
    expect(names(withSelect.kernel)).toEqual(["中坚甄选6星干员", "初雪"]);
    expect(withSelect.kernelSelect).toBe(true);
  });

  it("没有中坚池时中坚合同为空，合计相应减少", () => {
    const withoutKernel = buildHighShopView({
      ...highShop,
      goodList: highShop.goodList.filter(
        (good) => good.goodId !== "HS_17088" && good.goodId !== "HS_18088",
      ),
    });
    expect(withoutKernel.kernel).toEqual([]);
    expect(withoutKernel.total).toBe(2952 - 180 - 45);
  });
});

describe("wikiItemName", () => {
  it.each([
    ["TKT_GACHA_10", "批量寻访凭证", "十连寻访凭证"],
    ["CLASSIC_TKT_GACHA_10", "批量中坚寻访凭证", "十连中坚寻访凭证"],
    ["TKT_GACHA", "寻访凭证", "寻访凭证"],
  ])("%s 的「%s」对应站内的「%s」", (type, displayName, expected) => {
    expect(wikiItemName({ id: "", count: 1, type }, displayName)).toBe(
      expected,
    );
  });
});

describe("kernelSelectIconName", () => {
  const good = (displayName: string, price: number): HighGood => ({
    ...highShop.goodList[2],
    displayName,
    price,
  });

  it.each([
    ["中坚甄选6星干员", 180, "中坚甄选6星干员"],
    ["怀旧庆典六星自选", 0, "中坚甄选6星干员"],
    ["中坚甄选5星干员", 45, "中坚甄选5星干员"],
  ])("%s（%i）使用 %s 图标", (displayName, price, expected) => {
    expect(kernelSelectIconName(good(displayName, price))).toBe(expected);
  });
});
