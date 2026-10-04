import { GRADES, gradeRange, STAT_COLS, type StatKey } from "./consts";

import type { Enemy } from "./enemy";

export type FilterId =
  "enemyLevel" | "motion" | "enemyRace" | "attackType" | "damageType" | StatKey;

export interface FilterOption {
  /** 数据里的值，也是地址栏里的写法 */
  id: string;
  /** 悬停提示（属性等级对应的数值范围） */
  tip?: string;
}

export interface FilterDef {
  /** 「敌人一览/数据」里的字段名 */
  id: FilterId;
  title: string;
  options: readonly FilterOption[];
  /** 这个敌人在这一行上的值（攻击方式 / 伤害类型可以有几个） */
  values: (enemy: Enemy) => readonly string[];
}

const options = (...ids: string[]): FilterOption[] => ids.map((id) => ({ id }));

/**
 * 常用的五行，同游戏敌人图鉴的筛选面板（EnemyHandbookShuffleViewModel：地位 / 种类 / 攻击方式 / 伤害类型 / 行动方式）。
 * 种类按 enemy_handbook_table.raceData 的 sortId 排，没有种类的归「其他」（游戏的 RaceShuffleItem.isOther）。
 */
export const QUICK_FILTERS: readonly FilterDef[] = [
  {
    id: "enemyLevel",
    title: "地位",
    options: options("普通", "精英", "领袖"),
    values: (e) => [e.level],
  },
  {
    id: "motion",
    title: "行动方式",
    options: options("地面", "飞行"),
    values: (e) => [e.motion],
  },
  {
    id: "enemyRace",
    title: "种类",
    options: options(
      "感染生物",
      "无人机",
      "萨卡兹",
      "宿主",
      "海怪",
      "法术造物",
      "化物",
      "机械",
      "野生动物",
      "坍缩体",
      "源石造物",
      "其他",
    ),
    values: (e) => [e.race],
  },
  {
    id: "attackType",
    title: "攻击方式",
    options: options("近战", "远程", "不攻击"),
    values: (e) => e.attackType,
  },
  {
    id: "damageType",
    title: "伤害类型",
    options: options("物理", "法术", "治疗", "无"),
    values: (e) => e.damageType,
  },
];

/** 八项属性各一行，选项都是 SS … E */
export const STAT_FILTERS: readonly FilterDef[] = STAT_COLS.map((col) => ({
  id: col.key,
  title: col.full,
  options: GRADES.map((grade) => ({ id: grade, tip: gradeRange(col, grade) })),
  values: (e) => [e.stats[col.key]],
}));

/** 固定定义只读；每个实例独立维护选择状态。 */
export interface FilterState {
  readonly id: FilterId;
  readonly def: FilterDef;
  selected: Set<string>;
}

export function createFilters(): Record<FilterId, FilterState> {
  return Object.fromEntries(
    [...QUICK_FILTERS, ...STAT_FILTERS].map((def) => [
      def.id,
      { id: def.id, def, selected: new Set<string>() },
    ]),
  ) as Record<FilterId, FilterState>;
}

/** 这一行有没有这个选项：地址栏和点选都只收认得的 id。 */
export const hasOption = (f: FilterState, id: string) =>
  f.def.options.some((option) => option.id === id);

/** 已选的选项，按定义次序（结果栏标签、地址栏共用）。 */
export const selectedOptions = (f: FilterState) =>
  f.def.options.filter((option) => f.selected.has(option.id));

/**
 * 同游戏图鉴（EnemyHandbookShuffleViewModel.CheckShuffleInfo）：一行里选了几项是「或」，行与行之间是「且」。
 * 同时会近战和远程的敌人，选「近战」或「远程」都算（游戏里是按位与）。
 */
export function matchFilter(
  f: FilterState,
  enemy: Enemy,
  selected: ReadonlySet<string> = f.selected,
): boolean {
  if (selected.size === 0) return true;
  return f.def.values(enemy).some((value) => selected.has(value));
}

export const normalizeNeedle = (q: string) => q.trim().toLowerCase();

/** 搜索：名称 / 图鉴编号 / 能力（不含术语提示的正文），不分大小写 */
export function matchText(enemy: Enemy, needle: string): boolean {
  if (!needle) return true;
  return [enemy.name, enemy.index, enemy.plainAbility].some((t) =>
    t.toLowerCase().includes(needle),
  );
}

/**
 * 每个敌人没通过的筛选行（搜索不过的直接不收）：
 * 一行都没有 = 在结果里；恰好一行 = 那一行换个选项就可能进结果，用来算「再点这一项还剩不剩」。
 */
export function failedFilters(
  enemies: readonly Enemy[],
  filters: readonly FilterState[],
  needle: string,
): Map<Enemy, FilterState[]> {
  const out = new Map<Enemy, FilterState[]>();
  for (const enemy of enemies) {
    if (!matchText(enemy, needle)) continue;
    out.set(
      enemy,
      filters.filter((f) => !matchFilter(f, enemy)),
    );
  }
  return out;
}

/** 会筛出 0 条的选项：其余条件不变、只选这一项 */
export function emptyOptions(
  f: FilterState,
  failed: Map<Enemy, FilterState[]>,
): Set<string> {
  const present = new Set<string>();
  for (const [enemy, fails] of failed) {
    if (fails.length === 0 || (fails.length === 1 && fails[0] === f))
      for (const value of f.def.values(enemy)) present.add(value);
  }
  return new Set(
    f.def.options.map((option) => option.id).filter((id) => !present.has(id)),
  );
}
