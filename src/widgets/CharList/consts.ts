/** 八项数值：表格里各占一列，也都是排序项（同游戏干员列表的 CharacterSortType） */
export const STAT_COLS = [
  { key: "hp", short: "生命", full: "生命值" },
  { key: "atk", short: "攻击", full: "攻击力" },
  { key: "def", short: "防御", full: "防御力" },
  { key: "res", short: "法抗", full: "法术抗性" },
  { key: "reDeploy", short: "再部署", full: "再部署时间" },
  { key: "cost", short: "费用", full: "部署费用" },
  { key: "block", short: "阻挡", full: "阻挡数" },
  { key: "interval", short: "间隔", full: "攻击间隔" },
] as const;

export type StatKey = (typeof STAT_COLS)[number]["key"];
export type SortKey = "time" | "name" | "rarity" | StatKey;
export type SortDir = 1 | -1;
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: Sort = { key: "time", dir: -1 };

export const isStatKey = (key: string): key is StatKey =>
  STAT_COLS.some((col) => col.key === key);

/** 选中一种排序时先给的方向：名称升序，其余降序（新的 / 高的在前） */
export const firstDir = (key: SortKey): SortDir => (key === "name" ? 1 : -1);

/** 显示方式，编号同地址栏的 _d */
export const View = { TABLE: 0, HALF: 1, AVATAR: 2 } as const;
export type ViewMode = (typeof View)[keyof typeof View];

/**
 * 筛选项怎么摆（筛选项本身、字段名都来自模板输出的 #filter-filter，这里只管归类）：
 * QUICK 一直在；其余进「高级筛选」，按类分页签。数据里新增了这里没列的字段 → 落到第一个页签。
 */
export const QUICK_FIELDS = [
  "profession",
  "subProfession",
  "rarity",
  "position",
];

export interface AdvancedTab {
  id: string;
  title: string;
  fields: string[];
  /** 选项多的类带一个「找选项」输入框 */
  find?: boolean;
}

export const ADVANCED_TABS: AdvancedTab[] = [
  { id: "trait", title: "词缀 · 获取", fields: ["tag", "obtainMethod", "sex"] },
  {
    id: "six",
    title: "六维",
    fields: ["phy", "flex", "tolerance", "plan", "skill", "adapt"],
  },
  { id: "force", title: "势力", fields: ["force"], find: true },
  { id: "birth", title: "出身地", fields: ["birthPlace"], find: true },
  { id: "race", title: "种族", fields: ["race"], find: true },
];

export const PAGE_STEPS = [50, 100, 200];
