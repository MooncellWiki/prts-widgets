/** 属性等级，从高到低（游戏 enemy_handbook_table 的 levelInfoList 同序） */
export const GRADES = [
  "SS",
  "S+",
  "S",
  "A+",
  "A",
  "B+",
  "B",
  "C",
  "D",
  "E",
] as const;
export type Grade = (typeof GRADES)[number];

/**
 * 八项属性：表格里各占一列，也都是排序项与筛选行；key 是「敌人一览/数据」里的字段名。
 * 前四项同游戏图鉴详情的次序（耐久 / 攻击力 / 防御力 / 法术抗性），名称照站内敌人页的叫法。
 *
 * bounds 是 SS … D 九档的分界（E 是剩下的那段），取自 enemy_handbook_table.levelInfoList
 * （EnemyHandBookEverViewModel._RefreshAttribute：min ≤ 数值 < max 记这一档）：
 * 一般是各档的下限；攻击速度按攻击间隔分档、越短越高，记的是各档的上限（interval）。
 */
export const STAT_COLS = [
  {
    key: "endure",
    short: "生命",
    full: "生命值",
    bounds: [500000, 250000, 100000, 25000, 12000, 8000, 5000, 3500, 1000],
  },
  {
    key: "attack",
    short: "攻击",
    full: "攻击力",
    bounds: [5000, 3000, 2000, 1500, 1000, 700, 500, 300, 200],
  },
  {
    key: "defence",
    short: "防御",
    full: "防御力",
    bounds: [5000, 3000, 2000, 1200, 1000, 800, 500, 200, 100],
  },
  {
    key: "resistance",
    short: "法抗",
    full: "法术抗性",
    bounds: [90, 80, 70, 60, 50, 30, 20, 10, 1],
  },
  {
    key: "moveSpeed",
    short: "移速",
    full: "移动速度",
    bounds: [2, 1.8, 1.5, 1.2, 1, 0.9, 0.7, 0.5, 0.3],
  },
  {
    key: "attackSpeed",
    short: "攻速",
    full: "攻击速度",
    bounds: [0.5, 0.8, 1, 1.2, 1.7, 2.6, 3.5, 5, 6.9],
    interval: true,
  },
  {
    // 数据源的 enemyDamageRes 是元素伤害抗性，enemyRes 是元素损伤抵抗。
    key: "enemyDamageRes",
    short: "元抗",
    full: "元素抗性",
    bounds: [90, 80, 70, 60, 50, 30, 20, 10, 1],
  },
  {
    key: "enemyRes",
    short: "损抗",
    full: "损伤抵抗",
    bounds: [90, 80, 70, 60, 50, 30, 20, 10, 1],
  },
] as const satisfies readonly {
  key: string;
  short: string;
  full: string;
  bounds: readonly number[];
  interval?: boolean;
}[];

export type StatCol = (typeof STAT_COLS)[number];
export type StatKey = StatCol["key"];

export const isStatKey = (key: string): key is StatKey =>
  STAT_COLS.some((col) => col.key === key);

/** 这一档对应的数值范围，筛选芯片的提示用：「生命值 A：12000 – 25000」 */
export function gradeRange(col: StatCol, grade: Grade): string {
  const i = GRADES.indexOf(grade);
  // 上一档的分界（没有 = 不封顶）与这一档的分界（没有 = 到 0 为止）
  const outer: number | undefined = col.bounds[i - 1];
  const inner: number | undefined = col.bounds[i];
  const [min, max] =
    "interval" in col ? [outer ?? 0, inner] : [inner ?? 0, outer];
  const range =
    max === undefined ? `≥ ${min}` : min === 0 ? `< ${max}` : `${min} – ${max}`;
  return "interval" in col
    ? `${col.full} ${grade}：攻击间隔 ${range} 秒`
    : `${col.full} ${grade}：${range}`;
}

/** 排序项：图鉴顺序（数据里的 sortId）/ 名称 / 八项属性的等级 */
export type SortKey = "index" | "name" | StatKey;
export type SortDir = 1 | -1;
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

/** 同改版前：按图鉴顺序从头排 */
export const DEFAULT_SORT: Sort = { key: "index", dir: 1 };

/** 选中一种排序时先给的方向：图鉴顺序、名称升序，属性降序（等级高的在前） */
export const firstDir = (key: SortKey): SortDir => (isStatKey(key) ? -1 : 1);

/** 显示方式，编号同地址栏的 _d */
export const View = { TABLE: 0, GRID: 1 } as const;
export type ViewMode = (typeof View)[keyof typeof View];

export const PAGE_STEPS = [50, 100, 200, 500];
