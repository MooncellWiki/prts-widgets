import { describe, expect, it } from "vitest";

import {
  chainMembers,
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
import { encodeGif, planGif } from "../src/widgets/SpineViewer/engine/gif";

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

  it("取景按同一招的几段并起来，从哪一段点进来都一样", () => {
    const chain = ["Skill_2_Begin", "Skill_2_Loop", "Skill_2_End"];
    expect(names(chainMembers(list, find("Skill_2_End")))).toEqual(chain);
    expect(names(chainMembers(list, find("Skill_2_Begin")))).toEqual(chain);
    expect(names(chainMembers(list, find("Idle")))).toEqual(["Idle"]);
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

describe("planGif：GIF 的帧与帧时长（厘秒）", () => {
  const sum = (list: number[]) => list.reduce((a, b) => a + b, 0);

  it("30 帧 / 秒排成 3 4 3 3 4 3…，循环时不画最后一帧，总时长不漂", () => {
    const p = planGif(30, 1, true);
    expect(p.frames).toEqual([...Array(30).keys()]);
    expect(p.delays.slice(0, 6)).toEqual([3, 4, 3, 3, 4, 3]);
    expect(sum(p.delays)).toBe(100);
  });

  it("播一遍画到最后一帧，末帧停 1 秒", () => {
    const p = planGif(53, 1, false);
    expect(p.frames).toHaveLength(54);
    expect(p.frames.at(-1)).toBe(53);
    expect(sum(p.delays.slice(0, -1))).toBe(177);
    expect(p.delays.at(-1)).toBe(100);
  });

  it("慢放拉长每帧；快到一帧不足 2 厘秒就隔帧取，不足 2 厘秒的尾巴并进前一帧", () => {
    expect(planGif(30, 0.1, true).delays.slice(0, 3)).toEqual([33, 34, 33]);
    expect(planGif(30, 1.5, true).frames).toHaveLength(30);

    const fast = planGif(53, 2, true);
    expect(fast.frames).toEqual(Array.from({ length: 26 }, (_, i) => i * 2));
    expect(fast.delays.at(-1)).toBe(5);
    expect(sum(fast.delays)).toBe(88);
    expect(Math.min(...fast.delays)).toBeGreaterThanOrEqual(2);
  });
});

/** 按块走一遍 GIF：帧数、各帧时长（厘秒）与透明标记、循环次数（没有 NETSCAPE 扩展 = 播一遍）、带局部色表的帧数 */
function parseGif(b: Uint8Array) {
  const out = {
    header: String.fromCharCode(...b.subarray(0, 6)),
    frames: 0,
    delays: [] as number[],
    transparent: [] as boolean[],
    loops: null as number | null,
    local: 0,
  };
  let p = 13;
  if (b[10] & 0x80) p += 3 << ((b[10] & 7) + 1);
  const skipBlocks = () => {
    while (b[p]) p += b[p] + 1;
    p++;
  };
  while (b[p] !== 0x3b) {
    if (b[p] === 0x21) {
      if (b[p + 1] === 0xf9) {
        out.transparent.push(Boolean(b[p + 3] & 1));
        out.delays.push(b[p + 4] | (b[p + 5] << 8));
      } else if (
        String.fromCharCode(...b.subarray(p + 3, p + 14)) === "NETSCAPE2.0"
      ) {
        out.loops = b[p + 16] | (b[p + 17] << 8);
      }
      p += 2;
      skipBlocks();
    } else if (b[p] === 0x2c) {
      out.frames++;
      const packed = b[p + 9];
      p += 10;
      if (packed & 0x80) {
        out.local++;
        p += 3 << ((packed & 7) + 1);
      }
      p++;
      skipBlocks();
    } else {
      throw new Error(`第 ${p} 字节不是块开头：${b[p]}`);
    }
  }
  return out;
}

describe("encodeGif", () => {
  // 4 × 4：左半边随帧变色，右半边是底（透明底时 alpha 由参数给）
  const size = 4;
  const frame = (f: number, alpha: number) => {
    const px = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++)
      px.set(
        i % size < 2 ? [200, f * 20, 40, 255] : [10, 10, 10, alpha],
        i * 4,
      );
    return px;
  };
  const parse = async (blob: Blob) =>
    parseGif(new Uint8Array(await blob.arrayBuffer()));

  it("帧时长、一直循环写进文件，各帧共用全局色表", async () => {
    const plan = planGif(6, 1, true);
    const gif = await parse(
      await encodeGif({
        size,
        plan,
        loop: true,
        transparent: false,
        grab: (f) => frame(f, 255),
      }),
    );
    expect(gif.header).toBe("GIF89a");
    expect(gif.frames).toBe(6);
    expect(gif.delays).toEqual(plan.delays);
    expect(gif.loops).toBe(0);
    expect(gif.local).toBe(0);
    expect(gif.transparent).not.toContain(true);
  });

  it("播一遍不写循环；透明底每帧都带透明色", async () => {
    const gif = await parse(
      await encodeGif({
        size,
        plan: planGif(3, 1, false),
        loop: false,
        transparent: true,
        grab: (f) => frame(f, 60),
      }),
    );
    expect(gif.frames).toBe(4);
    expect(gif.loops).toBeNull();
    expect(gif.transparent).toEqual([true, true, true, true]);
  });
});
