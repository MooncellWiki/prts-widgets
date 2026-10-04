/** 排序项：仓库顺序（游戏仓库的排法）/ 稀有度 */
export type SortKey = "order" | "rarity";
export type SortDir = 1 | -1;
export interface Sort {
  key: SortKey;
  dir: SortDir;
}

export const SORT_KEYS: SortKey[] = ["order", "rarity"];
export const DEFAULT_SORT: Sort = { key: "order", dir: 1 };

/** 选中一种排序时先给的方向：仓库顺序照游戏正着排，稀有度高的在前 */
export const firstDir = (key: SortKey): SortDir => (key === "order" ? 1 : -1);

/** 显示方式，编号同地址栏的 _d */
export const View = { GRID: 0, LIST: 1 } as const;
export type ViewMode = (typeof View)[keyof typeof View];

export const PAGE_STEPS = [50, 100, 200, 500];
/** 默认一页 100：进页面默认选着的「材料」（六十多件）一页放得下 */
export const DEFAULT_STEP = 100;
