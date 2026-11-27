import { customLabel, rarityMap } from "./consts";

/**
 * 干员筛选与模组筛选的数据定义。
 */

export type OperatorFilterId = "type" | "rarity" | "sub";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
}

export interface OperatorFilterDef {
  id: OperatorFilterId;
  title: string;
  options: FilterOption[];
  /** 选项分组摆（职业分支按职业分组） */
  groups?: FilterGroup[];
}

/** 干员筛选的选择状态；空数组 = 这一行不筛。 */
export interface OperatorSelection {
  type: string[];
  rarity: string[];
  sub: string[];
}

export const createOperatorSelection = (): OperatorSelection => ({
  type: [],
  rarity: [],
  sub: [],
});

/** 职业行：选项就是模板里固定的八大职业。 */
export const TYPE_FILTER_OPTIONS: FilterOption[] = customLabel.typeOptions.map(
  (value) => ({ value, label: value }),
);

/** 稀有度行：模组数据里的 3 / 4 / 5 对应 4 / 5 / 6 星（星形由芯片自己画，同 CharList）。 */
export const RARITY_FILTER_OPTIONS: FilterOption[] = Object.values(
  rarityMap,
).map((label) => ({ value: label, label }));

/** 模组筛选 / 排序用到的数值键。 */
export type StatKey =
  "hp" | "atk" | "def" | "res" | "time" | "cost" | "block" | "atkspd";

/** 排序可用的数值键（没有阻挡数）。 */
export type SortStatKey = Exclude<StatKey, "block">;

export type EquipFilterMode =
  "all" | "talent" | "trait" | "type" | "addtime" | "mission2opt" | StatKey;

/** 高级筛选页签里真正会筛掉东西的方式（不含「全部」）。 */
export type ActiveEquipFilterMode = Exclude<EquipFilterMode, "all">;

/** 排序键。 */
export type EquipSortKey = "addtime" | "default" | SortStatKey;

export interface EquipSort {
  key: EquipSortKey;
  /** 1 = 升序，-1 = 降序 */
  dir: 1 | -1;
}

/** 进页面默认：实装时间新的在前。 */
export const DEFAULT_SORT: EquipSort = { key: "addtime", dir: -1 };

/** 选中一种排序时先给的方向：时间 / 费用越小越前，其余越大越前。 */
export function firstSortDir(key: EquipSortKey): 1 | -1 {
  return key === "time" || key === "cost" ? 1 : -1;
}

/** 显示方式：表格；头像（分组卡片）。 */
export const View = {
  TABLE: "table",
  AVATAR: "avatar",
} as const;
export type EquipView = (typeof View)[keyof typeof View];

/** 头像模式的分组方式。 */
export const GroupBy = {
  SUB: "sub",
  TIME: "time",
  OPT: "opt",
} as const;
export type EquipGroupBy = (typeof GroupBy)[keyof typeof GroupBy];

/**
 * 每种筛选方式要哪种值：
 *   none     不需要值（全部）
 *   yesno    有 / 无
 *   type     模组类型，可多选
 *   addtime  实装时间（可多选）
 *   text     任务关卡，自由输入
 *   stat     某几项数值有没有加成，有 / 无
 */
export type FilterValueKind =
  "none" | "yesno" | "type" | "addtime" | "text" | "stat";

export interface EquipFilterModeDef {
  value: EquipFilterMode;
  label: string;
  kind: FilterValueKind;
}

const statLabel = (key: string): string =>
  customLabel.statsMap.find(([value]) => value === key)?.[1] ?? key;

/** 筛选方式的次序。 */
export const EQUIP_FILTER_MODES: EquipFilterModeDef[] = [
  { value: "all", label: customLabel.sortOptions.all, kind: "none" },
  {
    value: "talent",
    label: customLabel.sortOptions.filterTalent,
    kind: "yesno",
  },
  { value: "trait", label: customLabel.sortOptions.filterTrait, kind: "yesno" },
  { value: "type", label: customLabel.sortOptions.filterType, kind: "type" },
  {
    value: "addtime",
    label: customLabel.sortOptions.filterTime,
    kind: "addtime",
  },
  {
    value: "mission2opt",
    label: customLabel.sortOptions.filterOpt,
    kind: "text",
  },
  ...(
    ["hp", "atk", "def", "res", "cost", "time", "block", "atkspd"] as StatKey[]
  ).map((value): EquipFilterModeDef => ({
    value,
    label: statLabel(value),
    kind: "stat",
  })),
];

const FILTER_MODE_BY_VALUE = new Map(
  EQUIP_FILTER_MODES.map((mode) => [mode.value, mode]),
);

export function filterModeDef(mode: EquipFilterMode): EquipFilterModeDef {
  return FILTER_MODE_BY_VALUE.get(mode) ?? FILTER_MODE_BY_VALUE.get("all")!;
}

/** 有 / 无这两个值给所有布尔型筛选方式共用。 */
export const YES_NO_OPTIONS: FilterOption[] = [
  { value: "yes", label: customLabel.sortOptions.yes },
  { value: "no", label: customLabel.sortOptions.no },
];

/** 模组类型：X / Y / Δ / α / β。 */
export const TYPE_VALUE_OPTIONS: FilterOption[] = [
  { value: "x", label: "X" },
  { value: "y", label: "Y" },
  { value: "δ", label: "Δ" },
  { value: "α", label: "α" },
  { value: "β", label: "β" },
];

/** 高级筛选的选择状态：每种筛选方式各存一组值，跨页签的条件之间是「且」。 */
export type EquipFilterSelection = Record<ActiveEquipFilterMode, string[]>;

const STAT_FILTER_MODES: ActiveEquipFilterMode[] = [
  "hp",
  "atk",
  "def",
  "res",
  "cost",
  "time",
  "block",
  "atkspd",
];

export interface EquipAdvancedTab {
  id: string;
  title: string;
  modes: ActiveEquipFilterMode[];
}

/** 高级筛选页签：模组信息（除数值外的所有条件）+ 数值。 */
export const EQUIP_ADVANCED_TABS: EquipAdvancedTab[] = [
  {
    id: "info",
    title: "模组信息",
    modes: ["talent", "trait", "type", "addtime", "mission2opt"],
  },
  {
    id: "stats",
    title: "数值",
    modes: STAT_FILTER_MODES,
  },
];

export const ADVANCED_FILTER_MODES: ActiveEquipFilterMode[] =
  EQUIP_ADVANCED_TABS.flatMap((tab) => tab.modes);

export function createEquipFilterSelection(): EquipFilterSelection {
  return {
    talent: [],
    trait: [],
    type: [],
    addtime: [],
    mission2opt: [],
    hp: [],
    atk: [],
    def: [],
    res: [],
    cost: [],
    time: [],
    block: [],
    atkspd: [],
  };
}

/** 某一组值会不会真的筛掉东西（空值不算）。 */
export function isFilterModeActive(values: readonly string[]): boolean {
  return values.some((value) => value.trim() !== "");
}

/** 已选值的总数（高级筛选钮 / 页签上的角标）。 */
export function selectionCount(selection: EquipFilterSelection): number {
  return Object.values(selection).reduce(
    (sum, values) => sum + values.length,
    0,
  );
}

export interface SortGroupOption {
  type: "group";
  label: string;
  children: FilterOption[];
}

export type EquipSortOption = FilterOption | SortGroupOption;

/** 排序项：实装时间 · 干员稀有度 · 数值（分组下拉）。 */
export const EQUIP_SORT_OPTIONS: EquipSortOption[] = [
  { label: customLabel.sortOptions.filterTime, value: "addtime" },
  { label: customLabel.sortOptions.default, value: "default" },
  {
    type: "group",
    label: "数值",
    children: (
      ["hp", "atk", "def", "res", "cost", "time", "atkspd"] as SortStatKey[]
    ).map((value) => ({ value, label: statLabel(value) })),
  },
];
