import {
  ALL_TAGS,
  MAX_PICK,
  MIN_STAR,
  NOVICE,
  ROBOT,
  SENIOR,
  TOP,
  isSenior,
} from "./consts";

/** cargoquery 的一行（chara ⋈ char_obtain，见 entries/HrCalculator.ts） */
export interface Source {
  profession: string;
  position: string;
  /** 0 起算 */
  rarity: number;
  tag: string[];
  zh: string;
  /** 游戏内 ID（char_002_amiya），取 torappu 头像用；cargo 里没填时为空 */
  charId: string;
  obtainMethod: string[];
}

export interface Op {
  zh: string;
  charId: string;
  star: number;
  profession: string;
  /** 职业 + 位置 + 词缀 + 按星级补的资深 / 高级资深 */
  tags: string[];
  mask: number;
  /** 寻访出不了的都算只能公招出 */
  only: boolean;
}

export interface Combo {
  tags: string[];
  mask: number;
  /** 星级从高到低 */
  ops: Op[];
  /** 保底 = 9:00 时这组里最低的星级（见 combosOf） */
  min: number;
}

const BIT = new Map(ALL_TAGS.map((t, i) => [t, 1 << i]));
const bit = (tag: string) => BIT.get(tag) ?? 0;

export function toOps(source: readonly Source[]): Op[] {
  return source
    .map((c) => {
      const star = c.rarity + 1;
      const tags = [c.profession, c.position, ...c.tag];
      if (star === 5) tags.push(SENIOR);
      else if (star === 6) tags.push(TOP);
      return {
        zh: c.zh,
        charId: c.charId,
        star,
        profession: c.profession,
        tags,
        mask: tags.reduce((m, t) => m | bit(t), 0),
        only: c.obtainMethod.every((v) => !v.includes("寻访")),
      };
    })
    .sort((a, b) => b.star - a.star);
}

/**
 * 从 tags 里取 1–maxPick 个；一组的干员 = 带齐这几个标签的，不按招募时限筛：
 * 1–5★ 都算，6★ 只在组合含【高级资深干员】时算（同旧版的 can5）。
 * 保底按 9:00 算（见 consts.ts 的 MIN_STAR）：只看 MIN_STAR 以上的；整组都低于 MIN_STAR 时才取最低那一星。
 */
export function combosOf(
  ops: readonly Op[],
  tags: readonly string[],
  maxPick = MAX_PICK,
): Combo[] {
  const out: Combo[] = [];
  const walk = (start: number, picked: string[], mask: number) => {
    if (picked.length) {
      const top = (mask & bit(TOP)) !== 0;
      const matched = ops.filter(
        (c) => (c.mask & mask) === mask && (c.star !== 6 || top),
      );
      if (matched.length) {
        const sure = matched.filter((c) => c.star >= MIN_STAR);
        const floor = sure.length ? sure : matched;
        out.push({
          tags: picked,
          mask,
          ops: matched,
          min: floor[floor.length - 1].star,
        });
      }
    }
    if (picked.length < maxPick)
      for (let i = start; i < tags.length; i++)
        walk(i + 1, [...picked, tags[i]], mask | bit(tags[i]));
  };
  walk(0, [], 0);
  return out;
}

/** a 是 b 的真子组合 */
const subOf = (a: Combo, b: Combo) =>
  a.mask !== b.mask && (a.mask & b.mask) === a.mask;

/** 两组圈出的是同一批干员（都是从同一份 ops 按序筛出来的，逐个比即可） */
const sameOps = (a: Combo, b: Combo) =>
  a.ops.length === b.ops.length && a.ops.every((o, i) => o === b.ops[i]);

/**
 * 多加一个标签却没圈出更小范围的不列（干员与某个子组合相同）。
 * 要比是不是同一批人，不能只比人数：稀有标签会改星级范围，【高级资深干员】+ 近卫 + 支援（帕拉斯、银灰）
 * 与 近卫 + 支援 人数一样，却是另一批干员。
 */
export const prune = (list: readonly Combo[]) =>
  list.filter((c) => !list.some((s) => subOf(s, c) && sameOps(s, c)));

/** 保底高的在前；同保底标签少的在前、干员少的在前 */
export const compareCombos = (a: Combo, b: Combo) =>
  b.min - a.min ||
  a.tags.length - b.tags.length ||
  a.ops.length - b.ops.length ||
  a.mask - b.mask;

/** 单选就能保底 4★ 以上的标签 → 保底星级；稀有标签不算（它们另有一套皮） */
export function soloGuarantees(ops: readonly Op[]): Map<string, number> {
  return new Map(
    combosOf(
      ops,
      ALL_TAGS.filter((t) => !isSenior(t)),
      1,
    )
      .filter((c) => c.min >= 4)
      .map((c) => [c.tags[0], c.min]),
  );
}

/**
 * 保底速查：全部标签里能保底 4★ 以上的最小组合（9:00）。
 * 不含资质三个与支援机械——稀有标签自己就是保底，新手 / 支援机械只出低星。多加标签没把保底抬高的不列。
 */
export function referenceCombos(ops: readonly Op[]): Combo[] {
  const skip = new Set([TOP, SENIOR, NOVICE, ROBOT]);
  const good = combosOf(
    ops,
    ALL_TAGS.filter((t) => !skip.has(t)),
  ).filter((c) => c.min >= 4);
  return good
    .filter((c) => !good.some((s) => subOf(s, c) && s.min >= c.min))
    .sort(compareCombos);
}

export interface Analysis {
  /** 全部组合（已剪枝、已排序：保底高的在前） */
  list: Combo[];
  /** 保底 6★ / 5★ / 4★ 各一层 */
  tiers: { min: number; combos: Combo[] }[];
  /** 整组都是 1★：必得支援机械 */
  robots: Combo[];
  /** 保底 3★ 及以下（含整组只有 2★ 新手的） */
  low: Combo[];
}

/** picked 按面板的次序（ALL_TAGS）给，组合里的标签照这个次序摆 */
export function analyze(
  ops: readonly Op[],
  picked: readonly string[],
): Analysis {
  const list = prune(combosOf(ops, picked)).sort(compareCombos);
  const robots = list.filter((c) => c.ops[0].star === 1);
  const rest = list.filter((c) => c.ops[0].star !== 1);
  const good = rest.filter((c) => c.min >= 4);
  return {
    list,
    tiers: [6, 5, 4]
      .map((min) => ({ min, combos: good.filter((c) => c.min === min) }))
      .filter((t) => t.combos.length > 0),
    robots,
    low: rest.filter((c) => c.min < 4),
  };
}
