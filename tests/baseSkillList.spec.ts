import { createApp, nextTick } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SORT, View } from "@/widgets/BaseSkillList/consts";
import {
  buildSource,
  parseNote,
  type BuildingBuffData,
  type RawSource,
} from "@/widgets/BaseSkillList/data";
import {
  buffPass,
  charPass,
  createFilters,
  emptyOptions,
  type Filters,
  type Query,
} from "@/widgets/BaseSkillList/filter";
import { buildHash, readHash } from "@/widgets/BaseSkillList/hash";
import BaseSkillList from "@/widgets/BaseSkillList/index.vue";
import {
  highlight,
  parseRichText,
  plainText,
  renderRichText,
} from "@/widgets/BaseSkillList/richText";
import { sortBuffs, sortChars } from "@/widgets/BaseSkillList/sort";
import { createBaseSkillList } from "@/widgets/BaseSkillList/store";

/* 字段与写法取自游戏的 building_data / character_table / gamedata_const，只留用得到的几条 */
const buff = (
  buffId: string,
  over: Partial<BuildingBuffData>,
): [string, BuildingBuffData] => [
  buffId,
  {
    buffId,
    buffName: buffId,
    skillIcon: `bskill_${buffId}`,
    sortId: 0,
    buffColor: "#ffd800",
    roomType: "MANUFACTURE",
    description: "",
    efficiency: 0,
    targets: [],
    ...over,
  },
];
const slot = (...steps: [string, string, number?][]) => ({
  buffData: steps.map(([buffId, phase, level = 1]) => ({
    buffId,
    cond: { phase, level },
  })),
});

const RAW: RawSource = {
  building: {
    rooms: {
      CONTROL: { id: "CONTROL", name: "控制中枢" },
      MANUFACTURE: { id: "MANUFACTURE", name: "制造站" },
      WORKSHOP: { id: "WORKSHOP", name: "加工站" },
      MEETING: { id: "MEETING", name: "会客室" },
    },
    buffs: Object.fromEntries([
      // 故意打乱次序：页面按设施次序 + sortId 排
      buff("meet_b", {
        buffName: "线索搜集·β",
        roomType: "MEETING",
        buffColor: "#dd653f",
        sortId: 9001,
        efficiency: 20,
        description: "进驻会客室时，线索搜集速度提升<@cc.vup>20%</>",
      }),
      buff("manu_gold", {
        buffName: "金属工艺·α",
        sortId: 3100,
        efficiency: 30,
        targets: ["F_GOLD"],
        description:
          "进驻制造站时，<@cc.kw>贵金属</>类配方的生产力<@cc.vup>+30%</>",
      }),
      buff("ctrl", {
        buffName: "最高权限",
        roomType: "CONTROL",
        buffColor: "#005752",
        sortId: 1603,
        description:
          "进驻控制中枢时，所有制造站生产力<@cc.vup>+2%</>（同种效果取最高）",
      }),
      buff("manu_gold2", {
        buffName: "金属工艺·β",
        sortId: 3101,
        efficiency: 35,
        targets: ["F_GOLD"],
        description:
          "进驻制造站时，<@cc.kw>贵金属</>类配方的生产力<@cc.vup>+35%</>",
      }),
      buff("manu_all", {
        buffName: "标准化·α",
        sortId: 3000,
        efficiency: 15,
        targets: ["F_GOLD", "F_EXP", "F_DIAMOND"],
        description: "进驻制造站时，生产力<@cc.vup>+15%</>",
      }),
      buff("work", {
        buffName: "合成专家",
        roomType: "WORKSHOP",
        buffColor: "#e3eb00",
        sortId: 5000,
        efficiency: -20,
        targets: ["F_EVOLVE"],
        description:
          "进驻加工站加工<@cc.kw>精英材料</>时，副产品的产出概率提升",
      }),
      buff("meet_a", {
        buffName: "线索搜集·α",
        roomType: "MEETING",
        buffColor: "#dd653f",
        sortId: 9000,
        efficiency: 10,
        description:
          "进驻会客室时，<$cc.g.lgd><@cc.kw>龙门近卫局</></>线索搜集速度提升<@cc.vup>10%</>",
      }),
    ]),
    chars: {
      char_d: {
        charId: "char_d",
        buffChar: [slot(["work", "PHASE_0"]), slot(["manu_gold", "PHASE_1"])],
      },
      char_a: {
        charId: "char_a",
        buffChar: [
          slot(["manu_gold", "PHASE_0"], ["manu_gold2", "PHASE_2"]),
          slot(["ctrl", "PHASE_0"]),
        ],
      },
      char_b: {
        charId: "char_b",
        buffChar: [slot(["meet_a", "PHASE_0"], ["meet_b", "PHASE_1"]), slot()],
      },
      char_c: {
        charId: "char_c",
        buffChar: [
          slot(["meet_b", "PHASE_0", 30]),
          slot(["manu_all", "PHASE_0"]),
        ],
      },
    },
    buffSortData: {
      MANUFACTURE: {
        hasEfficiencySort: true,
        efficiencyTargetDict: {
          all: { targets: ["F_GOLD", "F_EXP", "F_DIAMOND"], sortId: 0 },
          exp: { targets: ["F_EXP"], sortId: 2 },
          gold: { targets: ["F_GOLD"], sortId: 1 },
        },
      },
      WORKSHOP: {
        hasEfficiencySort: true,
        efficiencyTargetDict: {
          evolve: { targets: ["F_EVOLVE"], sortId: 2 },
          building: { targets: ["F_BUILDING"], sortId: 1 },
        },
      },
    },
  },
  characters: {
    char_a: { name: "甲", rarity: "TIER_6", profession: "WARRIOR" },
    char_b: { name: "乙", rarity: "TIER_5", profession: "CASTER" },
    char_c: { name: "丙", rarity: "TIER_4", profession: "MEDIC" },
    char_d: { name: "丁", rarity: "TIER_3", profession: "TANK" },
  },
  consts: {
    termDescriptionDict: {
      "cc.g.lgd": {
        termName: "龙门近卫局",
        description: "包含以下干员\n陈、<@cc.kw>星熊</>",
      },
    },
  },
  notes: {
    最高权限: "※备注",
    "金属工艺·α": {
      text: "※对__1__有效",
      insert: {
        "1": {
          type: "template",
          param: { title: "术语", args: { "1": "cc.g.lgd", "2": "近卫局" } },
        },
      },
    },
  },
};

const SOURCE = buildSource(RAW);
const names = (list: readonly { name: string }[]) => list.map((x) => x.name);
const byName = (name: string) => SOURCE.buffs.find((b) => b.name === name)!;

describe("富文本", () => {
  it("样式 / 术语 / 换行转成设计系统的写法，文字转义", () => {
    const nodes = parseRichText("a<@cc.vup>+5%</>\n<$cc.x><@ba.kw>k</></><b>");
    expect(plainText(nodes)).toBe("a+5%\nk<b>");
    const html = renderRichText(nodes, new Map([["cc.x", '名："解释"']]));
    expect(html).toBe(
      'a<span class="ak-rt-vup">+5%</span><br><span class="ak-rt-term" tabindex="0" data-tip="名：&quot;解释&quot;"><span class="ak-rt-kw">k</span></span>&lt;b&gt;',
    );
  });

  it("没闭合的标签在末尾闭合，多出来的 </> 忽略，认不得的样式 / 术语只留文字", () => {
    const html = renderRichText(
      parseRichText("</>x<@cc.what>y<$cc.none>z"),
      new Map(),
    );
    expect(html).toBe("xyz");
  });

  it("搜索高亮只在文字里，不分大小写", () => {
    expect(highlight("Abc<abc>", "abc")).toBe(
      "<mark>Abc</mark>&lt;<mark>abc</mark>&gt;",
    );
    const html = renderRichText(
      parseRichText("生产力<@cc.vup>+2%</>"),
      new Map(),
      "产力+",
    );
    // 跨标签的命中不标
    expect(html).not.toContain("<mark>");
  });

  it("备注里的 {{术语}} 换成术语，别的模板只留文字", () => {
    expect(
      parseNote({
        text: "__1__与__2__",
        insert: {
          "1": {
            type: "template",
            param: { title: "术语", args: { "1": "cc.a", "2": "甲" } },
          },
          "2": {
            type: "template",
            param: { title: "color", args: { "2": "乙" } },
          },
        },
      }),
    ).toEqual([
      { type: "term", key: "cc.a", children: [{ type: "text", text: "甲" }] },
      { type: "text", text: "与" },
      { type: "text", text: "乙" },
    ]);
  });
});

describe("buildSource", () => {
  it("设施按游戏次序、技能按设施次序 + sortId，干员稀有度高的在前", () => {
    expect(names(SOURCE.rooms)).toEqual([
      "控制中枢",
      "制造站",
      "加工站",
      "会客室",
    ]);
    expect(names(SOURCE.buffs)).toEqual([
      "最高权限",
      "标准化·α",
      "金属工艺·α",
      "金属工艺·β",
      "合成专家",
      "线索搜集·α",
      "线索搜集·β",
    ]);
    expect(names(SOURCE.chars)).toEqual(["甲", "乙", "丙", "丁"]);
    expect(SOURCE.chars.map((c) => c.stars)).toEqual([6, 5, 4, 3]);
  });

  it("设施色与作用对象：亮色取技能名条底色，暗色取光环色；作用对象按 sortId、去掉 all", () => {
    const manu = SOURCE.rooms[1];
    expect(manu).toMatchObject({ color: "#ffd800", halo: "#FFCC00", count: 3 });
    expect(manu.targets.map((t) => t.label)).toEqual(["贵金属", "作战记录"]);
    expect(SOURCE.rooms[2].targets.map((t) => t.id)).toEqual([
      "building",
      "evolve",
    ]);
    expect(SOURCE.rooms[0].targets).toEqual([]);
  });

  it("持有关系、解锁条件与技能链", () => {
    const gold = byName("金属工艺·α");
    expect(gold.holders.map((h) => [h.char.name, h.cond])).toEqual([
      ["甲", "e0"],
      ["丁", "e1"],
    ]);
    expect(names(gold.next.map((n) => n.buff))).toEqual(["金属工艺·β"]);
    expect(gold.next[0].phase).toBe(2);
    expect(names(byName("金属工艺·β").prev)).toEqual(["金属工艺·α"]);
    expect(byName("线索搜集·β").holders.map((h) => h.cond)).toEqual([
      "e1",
      "e0l30",
    ]);
    expect(SOURCE.conds.map((c) => c.id)).toEqual(["e0", "e0l30", "e1", "e2"]);
    // 只有一槽的干员第二槽是空的
    expect(SOURCE.chars[1].slots.map((s) => s.length)).toEqual([2, 0]);
  });

  it("术语解释去掉富文本，备注按技能名挂上", () => {
    expect(SOURCE.terms.get("cc.g.lgd")).toBe(
      "龙门近卫局：包含以下干员\n陈、星熊",
    );
    expect(byName("最高权限").note).toEqual([{ type: "text", text: "※备注" }]);
    expect(byName("金属工艺·α").note?.[1]).toMatchObject({
      type: "term",
      key: "cc.g.lgd",
    });
    expect(byName("标准化·α").note).toBeUndefined();
  });
});

describe("筛选", () => {
  const query = (
    setup: (f: Filters) => void = () => {},
    needle = "",
  ): Query => {
    const filters = createFilters(SOURCE);
    setup(filters);
    return { filters, needle };
  };
  const pass = (q: Query) => names(SOURCE.buffs.filter((b) => buffPass(b, q)));

  it("作用对象只约束自己那个设施的技能", () => {
    const q = query((f) => {
      f.room.selected.add("MANUFACTURE");
      f.room.selected.add("WORKSHOP");
      f.target.selected.add("exp");
    });
    // 制造站只剩带作战记录的；加工站没选它的对象，不受影响
    expect(pass(q)).toEqual(["标准化·α", "合成专家"]);
  });

  it("持有者那三行：技能只要有一位持有者符合就留下", () => {
    const q = query((f) => f.rarity.selected.add("3"));
    expect(pass(q)).toEqual(["金属工艺·α", "合成专家"]);
    const both = query((f) => {
      f.rarity.selected.add("3");
      f.phase.selected.add("e0");
    });
    // 丁的金属工艺·α 是精英一解锁，不算
    expect(pass(both)).toEqual(["合成专家"]);
  });

  it("搜索技能名、描述（含术语）与持有干员的名字", () => {
    expect(pass(query(undefined, "龙门近卫局"))).toEqual(["线索搜集·α"]);
    expect(pass(query(undefined, "丙"))).toEqual(["标准化·α", "线索搜集·β"]);
  });

  it("点了也不会多出技能的选项", () => {
    const q = query((f) => f.room.selected.add("MEETING"));
    const empty = emptyOptions(SOURCE.buffs, q);
    // 设施行跳过自己：别的设施都还点得出东西
    expect([...empty.get("room")!]).toEqual([]);
    expect([...empty.get("rarity")!]).toEqual(["6", "3", "2", "1"]);
    expect([...empty.get("prof")!]).toEqual([
      "PIONEER",
      "WARRIOR",
      "TANK",
      "SNIPER",
      "SUPPORT",
      "SPECIAL",
    ]);
  });

  it("干员视图：至少有一级技能过；搜干员名也算", () => {
    const q = query((f) => f.room.selected.add("WORKSHOP"));
    expect(names(SOURCE.chars.filter((c) => charPass(c, q)))).toEqual(["丁"]);
    const byChar = query(undefined, "乙");
    expect(names(SOURCE.chars.filter((c) => charPass(c, byChar)))).toEqual([
      "乙",
    ]);
  });
});

describe("排序", () => {
  it("先按设施次序（倒序也不倒设施），组内按游戏顺序 / 效率 / 持有人数 / 技能名，同值按游戏顺序", () => {
    const { buffs, chars } = SOURCE;
    expect(names(sortBuffs(buffs, { key: "order", dir: -1 }))).toEqual([
      "最高权限",
      "金属工艺·β",
      "金属工艺·α",
      "标准化·α",
      "合成专家",
      "线索搜集·β",
      "线索搜集·α",
    ]);
    expect(names(sortBuffs(buffs, { key: "eff", dir: -1 }))).toEqual([
      "最高权限",
      "金属工艺·β",
      "金属工艺·α",
      "标准化·α",
      "合成专家",
      "线索搜集·β",
      "线索搜集·α",
    ]);
    expect(names(sortBuffs(buffs, { key: "eff", dir: 1 }))).toEqual([
      "最高权限",
      "标准化·α",
      "金属工艺·α",
      "金属工艺·β",
      "合成专家",
      "线索搜集·α",
      "线索搜集·β",
    ]);
    // 制造站里 标准化·α 与 金属工艺·β 都是一位，同值按游戏顺序
    expect(names(sortBuffs(buffs, { key: "holders", dir: -1 }))).toEqual([
      "最高权限",
      "金属工艺·α",
      "标准化·α",
      "金属工艺·β",
      "合成专家",
      "线索搜集·β",
      "线索搜集·α",
    ]);
    expect(names(sortChars(chars, { key: "order", dir: -1 }))).toEqual([
      "丁",
      "丙",
      "乙",
      "甲",
    ]);
  });
});

describe("地址栏", () => {
  it("读写互逆，认不得的选项丢掉，默认状态是空串", () => {
    const filters = createFilters(SOURCE);
    const state = readHash(
      "#room=1-MANUFACTURE;NOPE&target=1-gold&phase=1-e0l30&rarity=1-6&_s=金属&_o=eff-d&_d=1",
      filters,
    );
    expect([...filters.room.selected]).toEqual(["MANUFACTURE"]);
    expect(state).toEqual({
      q: "金属",
      sort: { key: "eff", dir: -1 },
      view: View.OP,
    });
    expect(buildHash(filters, state)).toBe(
      "room=1-MANUFACTURE&target=1-gold&phase=1-e0l30&rarity=1-6&_s=%E9%87%91%E5%B1%9E&_o=eff-d&_d=1",
    );
    const empty = readHash("", filters);
    expect(empty.sort).toEqual(DEFAULT_SORT);
    expect(buildHash(filters, empty)).toBe("");
  });

  it("设施页：只看这个设施，分享链接指到一览页并带上设施", () => {
    const store = createBaseSkillList(SOURCE, { room: "制造站" });
    expect(store.room?.id).toBe("MANUFACTURE");
    expect(store.total.value).toBe(3);
    expect(store.targetRooms.value.map((r) => r.id)).toEqual(["MANUFACTURE"]);
    store.filters.target.selected.add("gold");
    expect(store.shareLink()).toBe(
      "https://prts.wiki/w/%E5%90%8E%E5%8B%A4%E6%8A%80%E8%83%BD%E4%B8%80%E8%A7%88#room=1-MANUFACTURE&target=1-gold",
    );
    // 认不出的设施当一览页
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(createBaseSkillList(SOURCE, { room: "电梯" }).room).toBeUndefined();
    vi.restoreAllMocks();
  });
});

describe("BaseSkillList UI smoke", () => {
  let app: ReturnType<typeof createApp> | undefined;
  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.innerHTML = "";
    history.replaceState(null, "", "/w/后勤技能一览");
    vi.unstubAllGlobals();
  });

  /** happy-dom 不排版，ResizeObserver 也不回调（宽度停在挂载前的 +∞）；要看窄排布就得自己报一个宽度 */
  const mount = async (
    path = "/w/后勤技能一览",
    props: { source?: typeof SOURCE; failed?: boolean; room?: string } = {
      source: SOURCE,
    },
    width = 1200,
  ) => {
    const report: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(target: Element) {
          const size = { inlineSize: width, blockSize: 0 };
          const entry = {
            target,
            borderBoxSize: [size],
            contentBoxSize: [size],
            contentRect: { width, height: 0 },
          } as unknown as ResizeObserverEntry;
          report.push(() =>
            this.callback([entry], this as unknown as ResizeObserver),
          );
        }
        unobserve() {}
        disconnect() {}
      },
    );
    history.replaceState(null, "", path);
    const host = document.createElement("div");
    document.body.append(host);
    app = createApp(BaseSkillList, props);
    app.mount(host);
    await nextTick();
    for (const fire of report) fire();
    await nextTick();
    return host;
  };
  const chip = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".ak-chip")].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const toolButton = (host: HTMLElement, label: string) =>
    [...host.querySelectorAll<HTMLButtonElement>(".ls-bar__tools button")].find(
      (b) => b.textContent?.trim() === label,
    )!;
  const rows = (host: HTMLElement) =>
    [...host.querySelectorAll(".rs-item .rs-name")].map((h) => h.textContent);
  const rowLabels = (host: HTMLElement) =>
    [...host.querySelectorAll(".rs-row__label > span")].map((s) =>
      s.textContent?.trim(),
    );

  it("按设施分组列出全部技能；点芯片筛选并写回地址栏", async () => {
    const host = await mount();
    expect(
      [...host.querySelectorAll(".rs-section__title")].map(
        (h) => h.textContent,
      ),
    ).toEqual(["控制中枢", "制造站", "加工站", "会客室"]);
    // 同现网默认都折叠；全部展开后才是全部技能
    expect(rows(host)).toEqual([]);
    toolButton(host, "全部展开").click();
    await nextTick();
    expect(rows(host)).toEqual(names(SOURCE.buffs));
    toolButton(host, "全部折叠").click();
    await nextTick();
    expect(rows(host)).toEqual([]);
    // 作用对象行要选了带对象的设施才出
    expect(rowLabels(host)).toEqual([
      "设施",
      "解锁阶段",
      "干员稀有度",
      "干员职业",
    ]);

    chip(host, "制造站").click();
    await nextTick();
    expect(rows(host)).toEqual(["标准化·α", "金属工艺·α", "金属工艺·β"]);
    expect(rowLabels(host)[1]).toContain("作用对象");
    chip(host, "作战记录").click();
    await nextTick();
    expect(rows(host)).toEqual(["标准化·α"]);
    expect(location.hash).toBe("#room=1-MANUFACTURE&target=1-exp");
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain("1");

    // 取消设施：作用对象那一段藏起来，里面选着的也清掉；没了筛选，又都折起来
    chip(host, "制造站").click();
    await nextTick();
    expect(location.hash).toBe("");
    expect(rows(host)).toEqual([]);
  });

  it("设施分组：默认折叠，点组头开合；有筛选 / 搜索时默认展开；技能视图不分页", async () => {
    const host = await mount();
    const toggles = () => [
      ...host.querySelectorAll<HTMLButtonElement>(".rs-section__toggle"),
    ];
    expect(toggles().map((b) => b.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
      "false",
      "false",
    ]);
    toggles()[1].click();
    await nextTick();
    expect(toggles()[1].getAttribute("aria-expanded")).toBe("true");
    expect(rows(host)).toEqual(["标准化·α", "金属工艺·α", "金属工艺·β"]);
    expect(
      host.querySelector(`#${toggles()[1].getAttribute("aria-controls")}`),
    ).not.toBeNull();
    toggles()[1].click();
    await nextTick();
    expect(rows(host)).toEqual([]);

    // 有了筛选默认都展开，点组头仍可收起
    chip(host, "精英二").click();
    await nextTick();
    expect(rows(host)).toEqual(["金属工艺·β"]);
    toggles()[0].click();
    await nextTick();
    expect(rows(host)).toEqual([]);

    // 没有每页条数与分页
    expect(host.querySelector(".ls-bar .ak-select")).toBeNull();
    expect(host.querySelector(".ls-pager, .rs-foot")).toBeNull();
  });

  it("别的排序也按设施分组，只在组内排，行里不带设施名", async () => {
    const host = await mount("/w/后勤技能一览#_o=eff-d");
    toolButton(host, "全部展开").click();
    await nextTick();
    expect(
      [...host.querySelectorAll(".rs-section__title")].map(
        (h) => h.textContent,
      ),
    ).toEqual(["控制中枢", "制造站", "加工站", "会客室"]);
    expect(rows(host)).toEqual(
      names(sortBuffs(SOURCE.buffs, { key: "eff", dir: -1 })),
    );
    expect(host.querySelector(".rs-item .rs-roomtag")).toBeNull();
  });

  it("行里：解锁条件、替换关系、效率、描述的富文本与术语、备注", async () => {
    const host = await mount("/w/后勤技能一览#_s=金属工艺·α");
    const row = host.querySelector(".rs-item")!;
    expect(row.querySelector(".rs-chain")?.textContent?.trim()).toBe(
      "精英二替换为 金属工艺·β",
    );
    expect(row.querySelector(".rs-eff")?.textContent?.trim()).toBe("效率 30");
    expect(row.querySelector(".rs-name mark")?.textContent).toBe("金属工艺·α");
    expect(row.querySelector(".rs-desc .ak-rt-kw")?.textContent).toBe("贵金属");
    expect(
      row.querySelector(".rs-note .ak-rt-term")?.getAttribute("data-tip"),
    ).toBe("龙门近卫局：包含以下干员\n陈、星熊");
    // 解锁条件在持有者头像左下角（同现网），按条件排；悬停只出干员名
    expect(row.querySelector(".rs-head .ak-elite")).toBeNull();
    const holders = [...row.querySelectorAll(".rs-holder")];
    expect(holders.map((h) => h.getAttribute("title"))).toEqual(["甲", "丁"]);
    expect(
      holders.map((h) =>
        h.querySelector(".ak-op-card__elite img")?.getAttribute("alt"),
      ),
    ).toEqual(["精英零", "精英一"]);
    expect(holders[0].hasAttribute("data-tip")).toBe(false);
  });

  it("持有者头像：「精英零 30 级」在精英图上方补等级", async () => {
    const host = await mount("/w/后勤技能一览#_s=线索搜集·β");
    const holders = [...host.querySelectorAll<HTMLElement>(".rs-holder")];
    expect(holders.map((h) => h.getAttribute("title"))).toEqual(["丙", "乙"]);
    expect(holders.map((h) => h.style.getPropertyValue("--rs-lv"))).toEqual([
      '"30"',
      "",
    ]);
  });

  it("持有者筛选：不符合的压淡不藏，符合的排前面", async () => {
    const host = await mount("/w/后勤技能一览#rarity=1-3&_s=金属工艺·α");
    const holders = [...host.querySelectorAll(".rs-holder")];
    expect(holders.map((h) => h.getAttribute("title"))).toEqual(["丁", "甲"]);
    expect(holders.map((h) => h.classList.contains("is-dim"))).toEqual([
      false,
      true,
    ]);
  });

  it("干员视图：两槽各列技能链，只有一槽的不出空的「技能 2」，被筛掉的压淡", async () => {
    const host = await mount("/w/后勤技能一览#room=1-MEETING&_d=1");
    const cards = [...host.querySelectorAll(".rs-op")];
    expect(
      cards.map((c) => c.querySelector(".rs-op__name")?.textContent),
    ).toEqual(["乙", "丙"]);
    expect(cards[0].querySelectorAll(".rs-slot")).toHaveLength(1);
    const steps = [...cards[1].querySelectorAll(".rs-step")];
    expect(steps.map((s) => s.classList.contains("is-dim"))).toEqual([
      false,
      true,
    ]);
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain(
      "位干员",
    );
  });

  it("设施页：没有设施行，作用对象不写段首，不碰地址栏", async () => {
    const host = await mount("/w/罗德岛基建/制造站#概述", {
      source: SOURCE,
      room: "MANUFACTURE",
    });
    expect(rowLabels(host)).toEqual([
      "作用对象",
      "解锁阶段",
      "干员稀有度",
      "干员职业",
    ]);
    expect(host.querySelector(".rs-group__label")).toBeNull();
    expect(host.querySelector(".rs-section__head")).toBeNull();
    expect(rows(host)).toEqual(["标准化·α", "金属工艺·α", "金属工艺·β"]);
    chip(host, "贵金属").click();
    await nextTick();
    expect(rows(host)).toEqual(["标准化·α", "金属工艺·α", "金属工艺·β"]);
    chip(host, "作战记录").click();
    await nextTick();
    expect(rows(host)).toEqual(["标准化·α", "金属工艺·α", "金属工艺·β"]);
    chip(host, "贵金属").click();
    await nextTick();
    expect(rows(host)).toEqual(["标准化·α"]);
    expect(decodeURIComponent(location.hash)).toBe("#概述");
  });

  it("读取中转圈，读取失败出提示", async () => {
    let host = await mount(undefined, {});
    expect(host.querySelector(".ak-spinner")).not.toBeNull();
    app?.unmount();
    host = await mount(undefined, { failed: true });
    expect(host.textContent).toContain("后勤技能数据读取失败");
  });
});
