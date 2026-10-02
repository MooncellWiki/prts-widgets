import { createApp, nextTick } from "vue";

import { afterEach, describe, expect, it } from "vitest";

import { avatar, fallbackImage } from "@/widgets/HrCalculator/assets";
import HrCalculator from "@/widgets/HrCalculator/index.vue";
import {
  analyze,
  combosOf,
  prune,
  rarityBlocks,
  referenceCombos,
  soloGuarantees,
  toOps,
  type Combo,
  type Source,
} from "@/widgets/HrCalculator/recruit";
import {
  decodeFilter,
  encodeFilter,
  readQuery,
  writeQuery,
} from "@/widgets/HrCalculator/url";

// 词缀 / 获得方式取自现网 cargoquery（chara ⋈ char_obtain），只留用得到的几位
const op = (
  zh: string,
  star: number,
  profession: string,
  position: string,
  tag: string[],
  obtainMethod = ["公开招募", "标准寻访"],
): Source => ({
  zh,
  charId: "",
  rarity: star - 1,
  profession,
  position,
  tag,
  obtainMethod,
});
const SOURCE: Source[] = [
  op("Lancet-2", 1, "医疗", "远程位", ["支援机械", "治疗"], ["公开招募"]),
  op("Castle-3", 1, "近卫", "近战位", ["支援机械", "支援"], ["公开招募"]),
  op("夜刀", 2, "先锋", "近战位", ["新手"], ["公开招募"]),
  op("芬", 3, "先锋", "近战位", ["费用回复"]),
  op("杰西卡", 4, "狙击", "远程位", ["输出", "生存"]),
  op("食铁兽", 5, "特种", "近战位", ["位移", "减速"]),
  op("陨星", 5, "狙击", "远程位", ["群攻", "削弱"]),
  op("狮蝎", 5, "特种", "近战位", ["输出", "生存"]),
  op("能天使", 6, "狙击", "远程位", ["输出"]),
];
const OPS = toOps(SOURCE);

const names = (c: Combo | undefined) => c?.ops.map((o) => o.zh);
const find = (list: Combo[], ...tags: string[]) =>
  list.find((c) => c.tags.join("+") === tags.join("+"));

describe("头像地址", () => {
  const amiya = { zh: "阿米娅", charId: "char_002_amiya" };

  it("有游戏内 ID 时从 torappu 取", () => {
    expect(avatar(amiya)).toBe(
      "https://torappu.prts.wiki/assets/char_avatar/char_002_amiya.png",
    );
  });

  it("cargo 里没填 ID 时按中文名走 media", () => {
    expect(avatar({ zh: "阿米娅", charId: "" })).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/头像_阿米娅\.png$/,
    );
  });

  it("torappu 取不到时换成 media 的同一张，且只换一次", () => {
    const img = document.createElement("img");
    img.addEventListener("error", fallbackImage);

    img.src = avatar(amiya);
    img.dispatchEvent(new Event("error"));
    const media = img.src;
    expect(decodeURI(media)).toBe(avatar({ zh: "阿米娅", charId: "" }));

    img.dispatchEvent(new Event("error"));
    expect(img.src).toBe(media);
  });
});

describe("toOps", () => {
  it("按星级补稀有标签，从高到低排；寻访出不了的记「限」", () => {
    expect(OPS.map((o) => `${o.star}${o.zh}`)).toEqual([
      "6能天使",
      "5食铁兽",
      "5陨星",
      "5狮蝎",
      "4杰西卡",
      "3芬",
      "2夜刀",
      "1Lancet-2",
      "1Castle-3",
    ]);
    expect(OPS[0].tags).toEqual(["狙击", "远程位", "输出", "高级资深干员"]);
    expect(OPS[1].tags).toContain("资深干员");
    expect(OPS.filter((o) => o.only).map((o) => o.zh)).toEqual([
      "夜刀",
      "Lancet-2",
      "Castle-3",
    ]);
  });
});

describe("combosOf", () => {
  it("每组至多 3 个标签", () => {
    const list = combosOf(OPS, ["狙击", "远程位", "输出", "生存", "群攻"], 2);
    expect(Math.max(...list.map((c) => c.tags.length))).toBe(3);
  });

  it("6★ 只在组合含【高级资深干员】时算", () => {
    const list = combosOf(OPS, ["输出", "高级资深干员"], 2);
    expect(names(find(list, "输出"))).toEqual(["狮蝎", "杰西卡"]);
    expect(find(list, "输出")?.min).toBe(4);
    expect(names(find(list, "输出", "高级资深干员"))).toEqual(["能天使"]);
  });

  it("时限决定星级范围：9:00 不出 1★ / 2★，3:50 以下才出 1★", () => {
    expect(find(combosOf(OPS, ["支援机械"], 2), "支援机械")).toBeUndefined();
    const robots = find(combosOf(OPS, ["支援机械"], 0), "支援机械");
    expect(names(robots)).toEqual(["Lancet-2", "Castle-3"]);
    expect(robots?.min).toBe(1);
    // 1–4★ 一档不出 5★
    expect(names(find(combosOf(OPS, ["生存"], 0), "生存"))).toEqual(["杰西卡"]);
  });

  it("时限没拉满时含稀有标签的组合不保底，保底按这一档的下限算", () => {
    const at9 = find(combosOf(OPS, ["资深干员"], 2), "资深干员");
    expect(at9).toMatchObject({ unsure: false, min: 5 });
    const short = find(combosOf(OPS, ["资深干员"], 0), "资深干员");
    // 【资深干员】把上限抬到 5★：1–4★ 一档也算 5★ 的干员
    expect(names(short)).toEqual(["食铁兽", "陨星", "狮蝎"]);
    expect(short).toMatchObject({ unsure: true, min: 1 });
  });
});

describe("prune / analyze", () => {
  it("多加一个标签却圈不出更小范围的组合不列", () => {
    const list = prune(combosOf(OPS, ["狙击", "远程位"], 2));
    expect(list.map((c) => c.tags.join("+"))).toEqual(["狙击", "远程位"]);
    // 狙击 + 远程位 与 狙击 是同一批干员
    expect(
      prune(combosOf(OPS, ["狙击", "群攻"], 2)).map((c) => c.tags.join("+")),
    ).toEqual(["狙击", "群攻"]);
  });

  it("比的是同一批干员，不只是人数：稀有标签换了星级范围", () => {
    const ops = toOps([
      op("杜宾", 4, "近卫", "近战位", ["输出", "支援"]),
      op("诗怀雅", 5, "近卫", "近战位", ["输出", "支援"]),
      op("帕拉斯", 6, "近卫", "近战位", ["输出", "支援"]),
      op("银灰", 6, "近卫", "近战位", ["输出", "支援"]),
      op("陈", 6, "近卫", "近战位", ["爆发", "输出"]),
      op("夜莺", 6, "医疗", "远程位", ["治疗", "支援"]),
    ]);
    const list = prune(combosOf(ops, ["高级资深干员", "近卫", "支援"], 2));
    // 近卫 + 支援 与 近卫 是同一批（杜宾、诗怀雅）：不列
    expect(find(list, "近卫", "支援")).toBeUndefined();
    // 加上【高级资深干员】也是两位，但换成了帕拉斯、银灰：照列
    expect(names(find(list, "高级资深干员", "近卫", "支援"))).toEqual([
      "帕拉斯",
      "银灰",
    ]);
  });

  it("按保底分层；1★ 整组单列「必得支援机械」，其余不保底的收在最后", () => {
    const r = analyze(OPS, ["资深干员", "支援机械", "先锋", "输出"], 0);
    // 1–4★ 一档：输出只剩杰西卡，照样保底 4★
    expect(r.tiers.map((t) => t.min)).toEqual([4]);
    expect(r.robots.map((c) => c.tags.join("+"))).toEqual(["支援机械"]);
    // 时限没拉满：含【资深干员】的组合落到不保底
    expect(r.low.map((c) => c.tags.join("+"))).toEqual([
      "先锋",
      "资深干员",
      "资深干员+输出",
    ]);

    const at9 = analyze(OPS, ["高级资深干员", "资深干员", "输出", "生存"], 2);
    expect(
      at9.tiers.map((t) => [t.min, t.combos.map((c) => c.tags.join("+"))]),
    ).toEqual([
      [6, ["高级资深干员"]],
      [5, ["资深干员", "资深干员+输出", "资深干员+生存"]],
      [4, ["输出", "生存"]],
    ]);
    expect(at9.robots).toEqual([]);
  });
});

describe("保底速查 / 单选保底", () => {
  it("只列能保底 4★ 以上的最小组合，不含资质标签", () => {
    const ref = referenceCombos(OPS);
    const tags = ref.map((c) => c.tags.join("+"));
    expect(tags).not.toContain("资深干员");
    expect(tags).toContain("削弱");
    expect(tags).toContain("生存");
    // 输出 已保底 4★；加上近战位把保底抬到 5★ 才列，加上远程位没抬高的不列
    expect(tags).toContain("近战位+输出");
    expect(tags).not.toContain("远程位+生存");
    // 特种 自己就保底 5★，特种 + 生存 不列
    expect(tags).toContain("特种");
    expect(tags).not.toContain("特种+生存");
    expect(ref.every((c) => c.min >= 4)).toBe(true);
    expect(ref[0].min).toBe(5);
  });

  it("单选即可保底的标签带保底星级，稀有标签不算", () => {
    const solo = soloGuarantees(OPS);
    expect(solo.get("削弱")).toBe(5);
    expect(solo.get("输出")).toBe(4);
    expect(solo.has("资深干员")).toBe(false);
    expect(solo.has("先锋")).toBe(false);
  });

  it("稀有度块：选了稀有标签，那一星标黄、上限抬到那一星", () => {
    expect(rarityBlocks(2, new Set())).toEqual([
      { star: 3, up: false },
      { star: 4, up: false },
      { star: 5, up: false },
    ]);
    expect(
      rarityBlocks(0, new Set(["高级资深干员"])).map(
        (b) => `${b.star}${b.up ? "↑" : ""}`,
      ),
    ).toEqual(["1", "2", "3", "4", "5", "6↑"]);
  });
});

describe("地址栏", () => {
  // 旧版 Widget（Char.dump）编码出来的链接
  const LEGACY: [string[], string][] = [
    [["近卫"], "5StKvqDxWUZaxzoDWN7tHNwNd9K54fc8TNwG2eB4pCi7yJUMCEK"],
    [["高级资深干员"], "21Rmcm1DaQv9btcPmPuTsB2PQ8eUe2A3tYXz3PAWEccjkeCL7H"],
    [
      ["支援机械", "新手"],
      "LdFYYbrC16epvA6z6NBYneqKJ8NctLyEf1pUBUedvDThTGEjD9xB",
    ],
    [
      ["先锋", "远程位", "资深干员", "元素", "治疗"],
      "LdFYYbrC16epvA6z6PxZK4u7bt8oWeLKWbM3Mwu6jeLV5Yyhpca4",
    ],
  ];

  it("?filter= 与旧版逐字一致，旧链接照样能读", () => {
    for (const [tags, encoded] of LEGACY) {
      expect(encodeFilter(new Set(tags))).toBe(encoded);
      expect([...decodeFilter(encoded)].sort()).toEqual([...tags].sort());
    }
  });

  it("解不开的 filter 当作没选", () => {
    expect(decodeFilter("0OIl").size).toBe(0);
    expect(decodeFilter("").size).toBe(0);
  });

  it("?t= 只写非默认档，其余参数原样保留", () => {
    expect(readQuery("?t=0").dur).toBe(0);
    expect(readQuery("?t=5").dur).toBe(2);
    expect(writeQuery("?title=公招计算&t=1", new Set(), 2)).toBe(
      `?${new URLSearchParams({ title: "公招计算" })}`,
    );
    const search = writeQuery("", new Set(["近卫"]), 1);
    expect(readQuery(search)).toEqual({ sel: new Set(["近卫"]), dur: 1 });
  });
});

describe("HrCalculator UI smoke", () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
    history.replaceState(null, "", "/w/公招计算");
  });

  const mount = async (path = "/w/公招计算") => {
    history.replaceState(null, "", path);
    const host = document.createElement("div");
    document.body.append(host);
    app = createApp(HrCalculator, { source: SOURCE });
    app.mount(host);
    await nextTick();
    return host;
  };
  const chip = (host: HTMLElement, tag: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".ak-chip")].find(
      (b) => b.textContent?.trim() === tag,
    )!;

  it("没选标签时是保底速查；点芯片落进格子并写进地址栏", async () => {
    const host = await mount();
    expect(host.querySelector(".hr-ref-head")?.textContent).toContain(
      "保底速查",
    );
    expect(host.querySelectorAll(".hr-slot--empty")).toHaveLength(5);

    chip(host, "削弱").click();
    await nextTick();
    expect(chip(host, "削弱").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector("button.hr-slot")?.textContent).toContain("削弱");
    expect(host.querySelector(".hr-tier__title")?.textContent).toBe("保底 5★");
    expect(readQuery(location.search).sel).toEqual(new Set(["削弱"]));
  });

  it("选满 5 个后其余芯片压淡、再点不加", async () => {
    const host = await mount(
      `/w/公招计算${writeQuery("", new Set(["狙击", "远程位", "输出", "生存", "群攻"]), 2)}`,
    );
    const extra = chip(host, "削弱");
    expect(extra.getAttribute("aria-disabled")).toBe("true");
    extra.click();
    await nextTick();
    expect(extra.getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelectorAll("button.hr-slot")).toHaveLength(5);
  });

  it("旧链接带了 5 个以上标签：照收并提示", async () => {
    const host = await mount(
      `/w/公招计算?filter=${encodeFilter(new Set(["近卫", "狙击", "重装", "医疗", "辅助", "术师"]))}`,
    );
    expect(host.querySelectorAll("button.hr-slot")).toHaveLength(6);
    expect(host.querySelector(".hr-tips")?.textContent).toContain(
      "这条链接带了 6 个标签",
    );
  });
});
