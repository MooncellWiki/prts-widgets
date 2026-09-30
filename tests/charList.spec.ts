import { describe, expect, it } from "vitest";

import {
  avatar,
  branchLine,
  fallbackImage,
  halfPortrait,
  professionLine,
} from "@/widgets/CharList/assets";
import { convertFeature } from "@/widgets/CharList/feature";
import {
  createFilters,
  dropOrphanBranches,
  emptyOptions,
  failedFilters,
  matchFilter,
  matchText,
} from "@/widgets/CharList/filter";
import type { FilterId } from "@/widgets/CharList/filters";
import { buildHash, readHash } from "@/widgets/CharList/hash";
import { sortChars } from "@/widgets/CharList/sort";
import { charStats, splitUnit } from "@/widgets/CharList/stats";
import { Char } from "@/widgets/CharList/utils";

function makeChar(attrs: Record<string, string> = {}, html = "") {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries({
    "data-zh": "12F",
    "data-profession": "术师",
    "data-subprofession": "扩散术师",
    "data-rarity": "1",
    "data-hp": "1461",
    "data-atk": "432",
    "data-def": "50",
    "data-res": "10",
    "data-cost": "24",
    "data-block": "1",
    "data-interval": "2.9s",
    "data-sex": "男",
    "data-position": "远程位",
    "data-potential": "cost,atk,re_deploy,atk,cost`-1,12,-5,12,-1",
    "data-trust": "0,50,0",
    "data-sortid": "7",
    ...attrs,
  }))
    el.setAttribute(k, v);
  el.innerHTML = html;
  return new Char(el);
}

const setup = () => {
  const filterById = createFilters();
  const filters = Object.values(filterById);
  const by = (id: FilterId) => filterById[id];
  return { filters, by };
};

describe("Char", () => {
  it("读取连字符形式的 data 属性", () => {
    const c = makeChar({
      "data-birth-place": "哥伦比亚",
      "data-re-deploy": "70s",
      "data-obtain-method": "公开招募, 标准寻访",
    });
    expect(c.birthPlace).toBe("哥伦比亚");
    expect(c.reDeploy).toBe("70s");
    expect(c.obtainMethod).toEqual(["公开招募", "标准寻访"]);
  });

  it("兼容旧的下划线形式 data 属性", () => {
    const c = makeChar({
      "data-birth_place": "哥伦比亚",
      "data-re_deploy": "70s",
      "data-obtain_method": "公开招募, 标准寻访",
    });
    expect(c.birthPlace).toBe("哥伦比亚");
    expect(c.reDeploy).toBe("70s");
    expect(c.obtainMethod).toEqual(["公开招募", "标准寻访"]);
  });

  it("属性被 Sanitizer 丢弃时回落为空值", () => {
    const c = makeChar({});
    expect(c.birthPlace).toBe("");
    expect(c.reDeploy).toBe("");
    expect(c.obtainMethod).toEqual([]);
  });
});

describe("头像 / 半身像地址", () => {
  const amiya = makeChar({
    "data-zh": "阿米娅",
    "data-char-id": "char_002_amiya",
  });

  it("有游戏内 ID 时从 torappu 取", () => {
    expect(avatar(amiya)).toBe(
      "https://torappu.prts.wiki/assets/char_avatar/char_002_amiya.png",
    );
    expect(halfPortrait(amiya)).toBe(
      "https://torappu.prts.wiki/assets/char_portrait/char_002_amiya_1.png",
    );
  });

  it("模板没输出 ID 时按中文名走 media", () => {
    const char = makeChar({ "data-zh": "阿米娅" });
    expect(avatar(char)).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/头像_阿米娅\.png$/,
    );
    expect(halfPortrait(char)).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/半身像_阿米娅_1\.png$/,
    );
  });

  it("torappu 取不到时换成 media 的同一张，且只换一次", () => {
    const box = document.createElement("div");
    const img = document.createElement("img");
    box.append(img);
    box.addEventListener("error", fallbackImage, true);

    img.src = halfPortrait(amiya);
    img.dispatchEvent(new Event("error"));
    const media = img.src;
    expect(decodeURI(media)).toBe(
      halfPortrait(makeChar({ "data-zh": "阿米娅" })),
    );

    img.dispatchEvent(new Event("error"));
    expect(img.src).toBe(media);
  });
});

describe("职业图标地址", () => {
  it("八个职业从 torappu 取", () => {
    expect(professionLine("术师")).toBe(
      "https://torappu.prts.wiki/assets/profession_icon/icon_profession_caster.png",
    );
    expect(professionLine("近卫")).toBe(
      "https://torappu.prts.wiki/assets/profession_icon/icon_profession_warrior.png",
    );
  });

  it("表里没有的职业按中文名走 media", () => {
    expect(professionLine("召唤物")).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/图标_职业_透明_召唤物\.png$/,
    );
  });
});

describe("分支图标地址", () => {
  it("查得到 key 的从 torappu 取", () => {
    expect(branchLine("中坚术师")).toBe(
      "https://torappu.prts.wiki/assets/subprofession_icon/sub_corecaster_icon.png",
    );
  });

  it("表里没有的分支按中文名走 media", () => {
    expect(branchLine("新分支")).toMatch(
      /^https:\/\/media\.prts\.wiki\/.\/..\/职业分支图标_新分支\.png$/,
    );
  });
});

describe("数值加算", () => {
  it("满潜能 / 满信赖各自加到对应的项上，并标出变了的项", () => {
    const c = makeChar({ "data-re-deploy": "70s" });
    expect(charStats(c, false, false)).toMatchObject({
      atk: 432,
      cost: 24,
      reDeploy: "70s",
      mod: { atk: false, cost: false, reDeploy: false },
    });
    expect(charStats(c, true, false)).toMatchObject({
      atk: 456,
      cost: 22,
      reDeploy: "65s",
      mod: { atk: true, cost: true, reDeploy: true, hp: false },
    });
    expect(charStats(c, false, true)).toMatchObject({ atk: 482, hp: 1461 });
  });

  it("缺少再部署时间 / 信赖数据时不抛错", () => {
    const c = makeChar({ "data-trust": "" });
    expect(charStats(c, true, true)).toMatchObject({ reDeploy: "", hp: 1461 });
  });

  it("单位拆开显示", () => {
    expect(splitUnit("70s")).toEqual(["70", "s"]);
    expect(splitUnit("1.05s")).toEqual(["1.05", "s"]);
    expect(splitUnit(24)).toEqual(["24", ""]);
    expect(splitUnit("-")).toEqual(["-", ""]);
  });
});

describe("筛选", () => {
  it("没选 = 不筛；同一行里多选是「或」", () => {
    const { by } = setup();
    const c = makeChar();
    expect(matchFilter(by("profession"), c)).toBe(true);
    by("profession").selection.selected.add("近卫");
    expect(matchFilter(by("profession"), c)).toBe(false);
    by("profession").selection.selected.add("术师");
    expect(matchFilter(by("profession"), c)).toBe(true);
  });

  it("稀有度按星级 ID（rarity+1），性别按「x性」，其他 = 非男非女", () => {
    const { by } = setup();
    expect(matchFilter(by("rarity"), makeChar(), new Set(["2"]))).toBe(true);
    expect(matchFilter(by("rarity"), makeChar(), new Set(["1"]))).toBe(false);
    expect(matchFilter(by("sex"), makeChar(), new Set(["男性"]))).toBe(true);
    expect(matchFilter(by("sex"), makeChar(), new Set(["其他"]))).toBe(false);
    const robot = makeChar({ "data-sex": "断罪" });
    expect(matchFilter(by("sex"), robot, new Set(["其他"]))).toBe(true);
  });

  it("词缀「同时满足」要求全中", () => {
    const { by } = setup();
    const c = makeChar({ "data-tag": "输出 群攻" });
    const both = new Set(["输出", "治疗"]);
    expect(matchFilter(by("tag"), c, both, false)).toBe(true);
    expect(matchFilter(by("tag"), c, both, true)).toBe(false);
    expect(matchFilter(by("tag"), c, new Set(["输出", "群攻"]), true)).toBe(
      true,
    );
  });

  it.each([
    ["活动获得", "活动获得"],
    ["记录修复奖励", "活动获得"],
    ["标准寻访, 礼包购买", "标准寻访"],
    ["标准寻访, 礼包购买", "其他"],
  ])("获取途径 %s 匹配 %s", (value, selected) => {
    const { by } = setup();
    const char = makeChar({ "data-obtain-method": value });
    expect(matchFilter(by("obtainMethod"), char, new Set([selected]))).toBe(
      true,
    );
  });

  it("其他不包含已知别名或空数组；可以与普通选项一起选", () => {
    const { by } = setup();
    const filter = by("obtainMethod");
    const known = makeChar({ "data-obtain-method": "记录修复奖励" });
    expect(matchFilter(filter, known, new Set(["其他"]))).toBe(false);
    expect(matchFilter(filter, makeChar(), new Set(["其他"]))).toBe(false);
    expect(matchFilter(filter, known, new Set(["其他", "活动获得"]))).toBe(
      true,
    );
  });

  it.each([
    ["汐斯塔（独立城邦）", "汐斯塔"],
    ["阿戈尔地区", "伊比利亚"],
    ["东国", "东"],
    ["因经纪公司要求不公开", "未公开/不公开"],
    ["不明", "未知"],
    ["未列出的地方", "其他"],
    ["", "其他"],
  ])("出身地 %s 匹配 %s", (value, selected) => {
    const { by } = setup();
    const char = makeChar({ "data-birth-place": value });
    expect(matchFilter(by("birthPlace"), char, new Set([selected]))).toBe(true);
  });

  it("混合种族既能匹配已知种族也能匹配其他，未知别名不算其他", () => {
    const { by } = setup();
    const char = makeChar({ "data-race": "黎博利/未列出的种族" });
    expect(matchFilter(by("race"), char, new Set(["黎博利"]))).toBe(true);
    expect(matchFilter(by("race"), char, new Set(["其他"]))).toBe(true);
    const alias = makeChar({ "data-race": "未知（疑似黎博利）" });
    expect(matchFilter(by("race"), alias, new Set(["未知"]))).toBe(true);
    expect(matchFilter(by("race"), alias, new Set(["其他"]))).toBe(false);
  });

  it.each(["phy", "flex", "tolerance", "plan", "skill", "adapt"] as const)(
    "六维 %s 共用等级规则，空值和特殊等级归其他",
    (id) => {
      const { by } = setup();
      expect(
        matchFilter(
          by(id),
          makeChar({ [`data-${id}`]: "卓越" }),
          new Set(["卓越"]),
        ),
      ).toBe(true);
      expect(
        matchFilter(
          by(id),
          makeChar({ [`data-${id}`]: "卓越" }),
          new Set(["其他"]),
        ),
      ).toBe(false);
      expect(
        matchFilter(
          by(id),
          makeChar({ [`data-${id}`]: "■■" }),
          new Set(["其他"]),
        ),
      ).toBe(true);
      expect(matchFilter(by(id), makeChar(), new Set(["其他"]))).toBe(true);
    },
  );

  it("势力可命中国家、组织或小队", () => {
    const { by } = setup();
    const char = makeChar({ "data-nation": "炎", "data-group": "龙门近卫局" });
    expect(matchFilter(by("force"), char, new Set(["炎"]))).toBe(true);
    expect(matchFilter(by("force"), char, new Set(["龙门近卫局"]))).toBe(true);
    expect(matchFilter(by("force"), char, new Set(["罗德岛"]))).toBe(false);
  });

  it("搜索名称 / 英文名 / 代号 / 特性，不分大小写，不搜术语提示的正文", () => {
    const c = makeChar(
      { "data-en": "Lava", "data-id": "RL03" },
      '攻击造成<span class="mc-tooltips"><span>群体</span><span style="display:none">术语: 群体<br>隐藏的解释</span></span>法术伤害',
    );
    expect(matchText(c, "")).toBe(true);
    expect(matchText(c, "lava")).toBe(true);
    expect(matchText(c, "rl03")).toBe(true);
    expect(matchText(c, "群体法术")).toBe(true);
    expect(matchText(c, "隐藏")).toBe(false);
  });

  it("会筛出 0 条的选项：其余条件不变、再点这一项", () => {
    const { filters, by } = setup();
    const chars = [
      makeChar({ "data-zh": "A", "data-profession": "术师" }),
      makeChar({
        "data-zh": "B",
        "data-profession": "近卫",
        "data-rarity": "5",
      }),
    ];
    by("rarity").selection.selected.add("6");
    const failed = failedFilters(chars, filters, "");
    // 稀有度筛到只剩近卫 B：职业里术师、先锋是空的；稀有度自己那行不受自己影响
    expect(emptyOptions(by("profession"), failed)).toEqual(
      new Set(["先锋", "重装", "狙击", "术师", "医疗", "辅助", "特种"]),
    );
    expect(emptyOptions(by("rarity"), failed)).toEqual(
      new Set(["1", "3", "4", "5"]),
    );
  });

  it("词缀 AND 的置灰在当前选择上加条件，OR 则考察该选项本身", () => {
    const { filters, by } = setup();
    const tag = by("tag");
    const chars = [
      makeChar({ "data-tag": "输出 群攻" }),
      makeChar({ "data-tag": "治疗" }),
    ];
    tag.selection.selected.add("输出");
    tag.selection.and = true;
    const andEmpty = emptyOptions(tag, failedFilters(chars, filters, ""));
    expect(andEmpty.has("治疗")).toBe(true);
    expect(andEmpty.has("群攻")).toBe(false);
    expect(andEmpty.has("输出")).toBe(false);
    tag.selection.and = false;
    expect(
      emptyOptions(tag, failedFilters(chars, filters, "")).has("治疗"),
    ).toBe(false);
  });

  it("选了职业，别的职业名下已选的分支一并取消", () => {
    const { by } = setup();
    by("subProfession").selection.selected.add("尖兵").add("强攻手");
    dropOrphanBranches(by("profession"), by("subProfession"));
    expect(by("subProfession").selection.selected.size).toBe(2); // 没选职业：不动
    by("profession").selection.selected.add("近卫");
    dropOrphanBranches(by("profession"), by("subProfession"));
    expect(Array.from(by("subProfession").selection.selected)).toEqual([
      "强攻手",
    ]);
  });
});

describe("排序", () => {
  const chars = [
    makeChar({ "data-zh": "甲", "data-sortid": "1", "data-rarity": "5" }),
    makeChar({
      "data-zh": "乙",
      "data-sortid": "2",
      "data-rarity": "3",
      "data-atk": "900",
    }),
    makeChar({
      "data-zh": "丙",
      "data-sortid": "3",
      "data-rarity": "5",
      "data-profession": "先锋",
    }),
    makeChar({ "data-zh": "丁", "data-sortid": "4", "data-interval": "" }),
  ];
  const order = ["先锋", "近卫", "术师"];
  const stats = (c: Char) => charStats(c, false, false);
  const names = (key: Parameters<typeof sortChars>[1]["key"], dir: 1 | -1) =>
    sortChars(chars, { key, dir }, order, stats).map((c) => c.zh);

  it("实装时间 / 稀有度（同稀有度按职业）", () => {
    expect(names("time", -1)).toEqual(["丁", "丙", "乙", "甲"]);
    expect(names("rarity", -1)).toEqual(["丙", "甲", "乙", "丁"]);
  });

  it("数值：同值时稀有度高的在前 → 职业；没有数值的不分升降都排最后", () => {
    expect(names("atk", -1)).toEqual(["乙", "丙", "甲", "丁"]);
    expect(names("atk", 1)).toEqual(["丙", "甲", "丁", "乙"]);
    expect(names("interval", 1).at(-1)).toBe("丁");
    expect(names("interval", -1).at(-1)).toBe("丁");
  });
});

describe("地址栏 # 参数", () => {
  it("读旧版短链接：筛选 / 同时满足 / 稀有度只写数字 / _o 编号", () => {
    const { filters, by } = setup();
    const state = readHash(
      `#${new URLSearchParams({
        profession: "1-近卫;术师",
        rarity: "1-6",
        tag: "0-输出;群攻",
        nonsense: "1-x",
        _s: "陈",
        _o: "5",
        _f: "pt",
        _d: "2",
      })}`,
      filters,
    );
    expect(Array.from(by("profession").selection.selected)).toEqual([
      "近卫",
      "术师",
    ]);
    expect(Array.from(by("rarity").selection.selected)).toEqual(["6"]);
    expect(by("tag").selection.and).toBe(true);
    expect(state).toEqual({
      q: "陈",
      sort: { key: "rarity", dir: -1 },
      pot: true,
      trust: true,
      view: 2,
    });
  });

  it("_o 的六个旧编号与数值列写法", () => {
    const { filters } = setup();
    const sort = (o: string) => readHash(`_o=${o}`, filters).sort;
    expect(sort("0")).toEqual({ key: "time", dir: 1 });
    expect(sort("1")).toEqual({ key: "time", dir: -1 });
    expect(sort("2")).toEqual({ key: "name", dir: 1 });
    expect(sort("3")).toEqual({ key: "name", dir: -1 });
    expect(sort("4")).toEqual({ key: "rarity", dir: 1 });
    expect(sort("hp-a")).toEqual({ key: "hp", dir: 1 });
    expect(sort("reDeploy-d")).toEqual({ key: "reDeploy", dir: -1 });
    // 认不出的退回默认
    expect(sort("9")).toEqual({ key: "time", dir: -1 });
    expect(sort("zzz-a")).toEqual({ key: "time", dir: -1 });
  });

  it("不在选项里的值、没有「同时满足」的行上的 0- 都不认", () => {
    const { filters, by } = setup();
    readHash("profession=0-近卫;不存在", filters);
    expect(Array.from(by("profession").selection.selected)).toEqual(["近卫"]);
    expect(by("profession").selection.and).toBe(false);
  });

  it("默认状态不写参数；写出去的能原样读回来", () => {
    const { filters, by } = setup();
    const state = readHash("", filters);
    expect(buildHash(filters, state)).toBe("");

    by("rarity").selection.selected.add("6").add("1");
    by("tag").selection.selected.add("治疗");
    by("tag").selection.and = true;
    const hash = buildHash(filters, {
      ...state,
      q: "a b",
      sort: { key: "cost", dir: 1 },
      pot: true,
      view: 1,
    });
    // 选项按筛选项定义里的顺序写，不按点选的先后
    expect(new URLSearchParams(hash).get("rarity")).toBe("1-1;6");
    expect(new URLSearchParams(hash).get("tag")).toBe("0-治疗");

    const again = setup();
    expect(readHash(hash, again.filters)).toEqual({
      q: "a b",
      sort: { key: "cost", dir: 1 },
      pot: true,
      trust: false,
      view: 1,
    });
    expect(buildHash(again.filters, readHash(hash, again.filters))).toBe(hash);
  });

  it("默认显示方式是头像时（手机）：不带 _d 读成头像，换回表格写 _d=0", () => {
    const { filters } = setup();
    const state = readHash("", filters, 2);
    expect(state.view).toBe(2);
    expect(buildHash(filters, state, 2)).toBe("");

    const hash = buildHash(filters, { ...state, view: 0 }, 2);
    expect(hash).toBe("_d=0");
    expect(readHash(hash, filters, 2).view).toBe(0);
    // 认不出的退回默认
    expect(readHash("_d=7", filters, 2).view).toBe(2);
    expect(readHash("_d=", filters, 2).view).toBe(2);
  });
});

describe("特性 HTML", () => {
  it("关键词色 → .ak-rt-kw，术语 → .ak-term[data-tip]，其余只留文字", () => {
    const el = document.createElement("div");
    el.innerHTML =
      '恢复<span style="color:#00B0FF;">生命</span>，不受<span class="mc-tooltips"><span class="term" style="cursor:help;">鼓舞</span><span style="display:none" data-size="350"><strong>术语: 鼓舞</strong><br>获得加成<br>※同类取最高</span></span>影响<br><b>加粗</b>';
    expect(convertFeature(el)).toBe(
      '恢复<span class="ak-rt-kw">生命</span>，不受<span class="ak-term" tabindex="0" data-tip="获得加成\n※同类取最高">鼓舞</span>影响<br>加粗',
    );
    // 不改动原节点：Char 还要从它读 innerHTML
    expect(el.querySelectorAll(".mc-tooltips br").length).toBe(2);
  });

  it("文字与属性里的特殊字符都转义", () => {
    const el = document.createElement("div");
    el.innerHTML =
      'a &lt;b&gt; &amp; <span class="mc-tooltips"><span>x</span><span>"q" &lt;i&gt;</span></span>';
    expect(convertFeature(el)).toBe(
      'a &lt;b&gt; &amp; <span class="ak-term" tabindex="0" data-tip="&quot;q&quot; &lt;i&gt;">x</span>',
    );
  });
});
