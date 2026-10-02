import { createApp, nextTick } from "vue";

import { afterEach, describe, expect, it } from "vitest";

import { avatar } from "@/utils/charImage";
import HrCalculator from "@/widgets/HrCalculator/index.vue";
import {
  analyze,
  combosOf,
  prune,
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
    const list = combosOf(OPS, ["狙击", "远程位", "输出", "生存", "群攻"]);
    expect(Math.max(...list.map((c) => c.tags.length))).toBe(3);
  });

  it("6★ 只在组合含【高级资深干员】时算", () => {
    const list = combosOf(OPS, ["输出", "高级资深干员"]);
    expect(names(find(list, "输出"))).toEqual(["狮蝎", "杰西卡"]);
    expect(find(list, "输出")?.min).toBe(4);
    expect(names(find(list, "输出", "高级资深干员"))).toEqual(["能天使"]);
  });

  it("不按招募时限筛：1★、2★ 照列，但保底按 9:00 算，不被它们拉低", () => {
    const vanguard = find(combosOf(OPS, ["先锋"]), "先锋");
    expect(names(vanguard)).toEqual(["芬", "夜刀"]);
    expect(vanguard?.min).toBe(3);
    expect(names(find(combosOf(OPS, ["近卫"]), "近卫"))).toEqual(["Castle-3"]);
    // 整组都低于 3★ 时取最低那一星
    expect(find(combosOf(OPS, ["新手"]), "新手")?.min).toBe(2);
    const robots = find(combosOf(OPS, ["支援机械"]), "支援机械");
    expect(names(robots)).toEqual(["Lancet-2", "Castle-3"]);
    expect(robots?.min).toBe(1);
  });

  it("4★ 以上的干员里混着 1★ 支援机械，保底照样是 4★", () => {
    const ops = toOps([
      ...SOURCE,
      op("CONFESS-47", 1, "先锋", "近战位", ["支援机械", "控场"], ["公开招募"]),
      op("红豆", 4, "先锋", "近战位", ["输出", "控场"]),
    ]);
    const control = find(combosOf(ops, ["控场"]), "控场");
    expect(names(control)).toEqual(["红豆", "CONFESS-47"]);
    expect(control?.min).toBe(4);
  });
});

describe("prune / analyze", () => {
  it("多加一个标签却圈不出更小范围的组合不列", () => {
    const list = prune(combosOf(OPS, ["狙击", "远程位"]));
    expect(list.map((c) => c.tags.join("+"))).toEqual(["狙击", "远程位"]);
    // 狙击 + 远程位 与 狙击 是同一批干员
    expect(
      prune(combosOf(OPS, ["狙击", "群攻"])).map((c) => c.tags.join("+")),
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
    const list = prune(combosOf(ops, ["高级资深干员", "近卫", "支援"]));
    // 近卫 + 支援 与 近卫 是同一批（杜宾、诗怀雅）：不列
    expect(find(list, "近卫", "支援")).toBeUndefined();
    // 加上【高级资深干员】也是两位，但换成了帕拉斯、银灰：照列
    expect(names(find(list, "高级资深干员", "近卫", "支援"))).toEqual([
      "帕拉斯",
      "银灰",
    ]);
  });

  it("全部组合排成一张表：保底高的在前，同保底标签少的在前，支援机械在最后", () => {
    const list = analyze(OPS, [
      "高级资深干员",
      "资深干员",
      "支援机械",
      "先锋",
      "输出",
      "生存",
    ]);
    expect(list.map((c) => `${c.min} ${c.tags.join("+")}`)).toEqual([
      "6 高级资深干员",
      "5 资深干员",
      "5 资深干员+输出",
      "5 资深干员+生存",
      "4 输出",
      "4 生存",
      "3 先锋",
      "1 支援机械",
    ]);
  });
});

describe("单选保底", () => {
  it("单选即可保底的标签带保底星级，稀有标签不算", () => {
    const solo = soloGuarantees(OPS);
    expect(solo.get("削弱")).toBe(5);
    expect(solo.get("输出")).toBe(4);
    expect(solo.has("资深干员")).toBe(false);
    expect(solo.has("先锋")).toBe(false);
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

  it("只改写 filter，其余参数原样保留", () => {
    expect(writeQuery("?title=公招计算&filter=x", new Set())).toBe(
      `?${new URLSearchParams({ title: "公招计算" })}`,
    );
    const search = writeQuery("?title=公招计算", new Set(["近卫"]));
    expect(new URLSearchParams(search).get("title")).toBe("公招计算");
    expect(readQuery(search)).toEqual(new Set(["近卫"]));
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

  const mount = async (
    path = "/w/公招计算",
    props: { source?: Source[]; failed?: boolean } = { source: SOURCE },
  ) => {
    history.replaceState(null, "", path);
    const host = document.createElement("div");
    document.body.append(host);
    app = createApp(HrCalculator, props);
    app.mount(host);
    await nextTick();
    return host;
  };
  const chip = (host: HTMLElement, tag: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".ak-chip")].find(
      (b) => b.textContent?.trim() === tag,
    )!;

  it("没选标签时结果区是空的；点芯片写进地址栏，「清空」全部取消", async () => {
    const host = await mount();
    expect(host.querySelector(".hr-combo")).toBeNull();
    const clear = [
      ...host.querySelectorAll<HTMLButtonElement>(".hr-bar .ak-btn"),
    ].find((b) => b.textContent?.includes("清空"))!;
    expect(clear.disabled).toBe(true);

    chip(host, "削弱").click();
    await nextTick();
    expect(chip(host, "削弱").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".hr-combo")?.getAttribute("data-rarity")).toBe(
      "5",
    );
    expect(readQuery(location.search)).toEqual(new Set(["削弱"]));

    clear.click();
    await nextTick();
    expect(chip(host, "削弱").getAttribute("aria-pressed")).toBe("false");
    expect(host.querySelector(".hr-combo")).toBeNull();
    expect(location.search).toBe("");
  });

  it("标签个数不限", async () => {
    const tags = ["近卫", "狙击", "重装", "医疗", "辅助", "术师"];
    const host = await mount(`/w/公招计算${writeQuery("", new Set(tags))}`);
    expect(
      tags.every((t) => chip(host, t).getAttribute("aria-pressed") === "true"),
    ).toBe(true);
    chip(host, "削弱").click();
    await nextTick();
    expect(chip(host, "削弱").getAttribute("aria-pressed")).toBe("true");
    expect(readQuery(location.search).size).toBe(7);
  });

  it("头像 torappu 取不到时换回 media 且看得见，media 也取不到才藏掉", async () => {
    const angel = { zh: "能天使", charId: "char_103_angel" };
    const host = await mount(
      `/w/公招计算${writeQuery("", new Set(["高级资深干员"]))}`,
      {
        source: SOURCE.map((s) => (s.zh === angel.zh ? { ...s, ...angel } : s)),
      },
    );
    const img = host.querySelector<HTMLImageElement>(
      `img[src="${avatar(angel)}"]`,
    )!;
    expect(img).not.toBeNull();

    img.dispatchEvent(new Event("error"));
    expect(decodeURI(img.src)).toBe(avatar({ ...angel, charId: "" }));
    expect(img.style.visibility).toBe("");

    img.dispatchEvent(new Event("error"));
    expect(img.style.visibility).toBe("hidden");
  });

  it("干员数据没取到：结果区是失败提示，不再转圈", async () => {
    const host = await mount(undefined, { failed: true });
    expect(host.querySelector(".ak-empty")?.textContent).toContain(
      "干员数据读取失败",
    );
    expect(host.querySelector(".ak-spinner")).toBeNull();
  });
});
