import { describe, expect, it } from "vitest";

import {
  chainOf,
  defaultAnim,
  groupAnims,
  nextInChain,
  sortModels,
  sortSkins,
  summarize,
} from "../src/widgets/SpineViewer/engine/anims";
import {
  hexToHsv,
  hsvToHex,
  normalizeHex,
} from "../src/widgets/SpineViewer/engine/color";

const anim = (name: string, duration = 1) => summarize(name, duration, []);
const names = (list: { name: string }[]) => list.map((a) => a.name);

describe("summarize", () => {
  it("按时间排事件，帧数与判定帧按 30 帧 / 秒取整", () => {
    const a = summarize("Skill_3", 2.5, [
      { name: "OnAttack", time: 1.2 },
      { name: "OnStart", time: 0 },
      { name: "OnAttack", time: 0.4 },
    ]);
    expect(a.frames).toBe(75);
    expect(names(a.events)).toEqual(["OnStart", "OnAttack", "OnAttack"]);
    expect(a.hits).toEqual([12, 36]);
  });
});

describe("sortSkins / sortModels", () => {
  it("「默认」提到最前，其余照 meta.json 的次序", () => {
    expect(sortSkins(["岁红霞", "默认", "初晴"])).toEqual([
      "默认",
      "岁红霞",
      "初晴",
    ]);
  });

  it("模型按 正面 / 背面 / 基建 排，不认识的放最后", () => {
    expect(sortModels(["基建", "某某", "背面", "正面"])).toEqual([
      "正面",
      "背面",
      "基建",
      "某某",
    ]);
    expect(sortModels(["基建", "战斗"])).toEqual(["战斗", "基建"]);
  });
});

describe("defaultAnim", () => {
  it("战斗播 Idle，基建播 Relax，都没有就第一个", () => {
    expect(defaultAnim([anim("Attack"), anim("Idle")])?.name).toBe("Idle");
    expect(defaultAnim([anim("Move"), anim("Relax")])?.name).toBe("Relax");
    expect(defaultAnim([anim("Attack"), anim("Die")])?.name).toBe("Attack");
    expect(defaultAnim([])).toBeUndefined();
  });
});

describe("chainOf", () => {
  it("摘出段名当次序，剩下的当招式名", () => {
    expect(chainOf("Skill_2_Begin")).toEqual(["Skill_2", 0]);
    expect(chainOf("Skill_2_Loop")).toEqual(["Skill_2", 2]);
    expect(chainOf("Skill_2_End")).toEqual(["Skill_2", 6]);
    expect(chainOf("Attack_Down_Begin")).toEqual(["Attack_Down", 0]);
    expect(chainOf("Skill_2")).toEqual(["Skill_2", 1]);
    // 第一段是名字本身，不当段名
    expect(chainOf("Start")).toEqual(["Start", 1]);
    expect(chainOf("Idle")).toEqual(["Idle", 1]);
  });
});

describe("groupAnims", () => {
  it("不超过 8 个只排序不分组：按 入场 / 待机 / 攻击 / 技能 / 其它", () => {
    const groups = groupAnims(
      ["Die", "Skill", "Idle", "Attack", "Start", "Default"].map((n) =>
        anim(n, n === "Default" ? 0 : 1),
      ),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("");
    // Default 是 0 帧的定格姿态，排到待机组最后
    expect(names(groups[0].items)).toEqual([
      "Start",
      "Idle",
      "Default",
      "Attack",
      "Skill",
      "Die",
    ]);
  });

  it("超过 8 个分组，一招的几段按出招顺序而不是字母序", () => {
    const groups = groupAnims(
      [
        "Attack",
        "Attack_Down_Begin",
        "Attack_Down_End",
        "Attack_Down_Loop",
        "Die",
        "Idle",
        "Skill_2_Begin",
        "Skill_2_End",
        "Skill_2_Loop",
        "Skill_10",
        "Start",
      ].map((n) => anim(n)),
    );
    expect(groups.map((g) => g.title)).toEqual([
      "入场",
      "待机",
      "攻击",
      "技能",
      "其它",
    ]);
    expect(names(groups[2].items)).toEqual([
      "Attack",
      "Attack_Down_Begin",
      "Attack_Down_Loop",
      "Attack_Down_End",
    ]);
    // 数字按数值比：Skill_2 在 Skill_10 前
    expect(names(groups[3].items)).toEqual([
      "Skill_2_Begin",
      "Skill_2_Loop",
      "Skill_2_End",
      "Skill_10",
    ]);
  });
});

describe("nextInChain", () => {
  const list = [
    "Idle",
    "Skill_2_End",
    "Skill_2_Begin",
    "Skill_2_Loop",
    "Default",
  ].map((n) => anim(n, n === "Default" ? 0 : 1));
  const find = (n: string) => list.find((a) => a.name === n)!;

  it("播完一段接同一招的下一段", () => {
    expect(nextInChain(list, find("Skill_2_Begin"), false)?.name).toBe(
      "Skill_2_Loop",
    );
    expect(nextInChain(list, find("Skill_2_Loop"), false)?.name).toBe(
      "Skill_2_End",
    );
  });

  it("最后一段播完：循环回到第一段，否则停住", () => {
    expect(nextInChain(list, find("Skill_2_End"), true)?.name).toBe(
      "Skill_2_Begin",
    );
    expect(nextInChain(list, find("Skill_2_End"), false)).toBeNull();
  });

  it("只有一段的动作不受影响", () => {
    expect(nextInChain(list, find("Idle"), true)).toBeNull();
    expect(nextInChain(list, find("Default"), true)).toBeNull();
  });
});

describe("取色：HSV ↔ #rrggbb", () => {
  it("认 #rgb / #rrggbb（# 可省），统一成小写 6 位", () => {
    expect(normalizeHex("#18D1FF")).toBe("#18d1ff");
    expect(normalizeHex("18d1ff")).toBe("#18d1ff");
    expect(normalizeHex(" #fc0 ")).toBe("#ffcc00");
    expect(normalizeHex("#18d1f")).toBeNull();
    expect(normalizeHex("#ggg")).toBeNull();
  });

  it("来回换算不丢颜色", () => {
    for (const hex of [
      "#18d1ff",
      "#0098dc",
      "#ffd800",
      "#313131",
      "#000000",
      "#ffffff",
      "#ff00ff",
    ])
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 360, s: 1, v: 1 })).toBe("#ff0000");
  });

  it("灰 / 黑没有色相，沿用传进来的色相", () => {
    expect(hexToHsv("#808080", 200)).toEqual({ h: 200, s: 0, v: 128 / 255 });
    expect(hexToHsv("#000000", 42).h).toBe(42);
    expect(hexToHsv("#18d1ff", 42).h).toBeCloseTo(191.95, 1);
  });
});
