import { professionMap } from "@/utils/utils";

/**
 * 有后勤技能的设施，按游戏 rooms 表的次序（同现网页面各章节的次序；活动室 / 电梯 / 走廊没有技能）。
 * halo = 进驻面板技能图标的光环色（arts/building/buffs/buff_image_config，按 RoomType），暗色主题的设施色。
 * 亮色主题的设施色取这一设施技能名条的底色 buffColor（building_data 里每个设施只有一种），见 data.ts。
 */
export const ROOM_ORDER = [
  { id: "CONTROL", halo: "#00E4D7" },
  { id: "POWER", halo: "#8FC31F" },
  { id: "MANUFACTURE", halo: "#FFCC00" },
  { id: "TRADING", halo: "#2ABDFF" },
  { id: "DORMITORY", halo: "#2AFFED" },
  { id: "WORKSHOP", halo: "#E3EB00" },
  { id: "HIRE", halo: "#DCDCDC" },
  { id: "TRAINING", halo: "#D20039" },
  { id: "RECYCLE", halo: "#6CCBCB" },
  { id: "MEETING", halo: "#FF6534" },
] as const;

/** 作用对象（buffSortData.efficiencyTargetDict 的键）在游戏里的叫法：制造站 / 加工站是产物，训练室是职业 */
export const TARGET_LABELS: Record<string, string> = {
  gold: "贵金属",
  exp: "作战记录",
  diamond: "源石碎片",
  building: "基建材料",
  evolve: "精英材料",
  skill: "技巧概要",
  asc: "芯片",
  ...Object.fromEntries(
    Object.entries(professionMap).map(([key, zh]) => [key.toLowerCase(), zh]),
  ),
};

/** 职业，按游戏的次序（同干员一览）：持有干员的职业筛选 */
export const PROFESSIONS = [
  "PIONEER",
  "WARRIOR",
  "TANK",
  "SNIPER",
  "CASTER",
  "MEDIC",
  "SUPPORT",
  "SPECIAL",
] as const satisfies readonly (keyof typeof professionMap)[];

export const professionName = (key: string) =>
  (professionMap as Record<string, string>)[key] ?? key;

const CN = ["零", "一", "二"];
/** 解锁条件：「精英零」「精英零 30 级」 */
export const condText = (phase: number, level: number) =>
  `精英${CN[phase] ?? phase}${level > 1 ? ` ${level} 级` : ""}`;
/** 解锁条件的编号，也是地址栏里的写法：e0 / e0l30 / e2 */
export const condId = (phase: number, level: number) =>
  `e${phase}${level > 1 ? `l${level}` : ""}`;

/**
 * 排序项：游戏顺序（设施次序 + sortId，同进驻面板的 CharSortType.BUFF_SORTID）/
 * 效率（CharSortType.EFFICIENCY）/ 持有人数 / 技能名。干员视图只有游戏顺序与名称。
 */
export type SortKey = "order" | "eff" | "holders" | "name";
export const SORT_KEYS: SortKey[] = ["order", "eff", "holders", "name"];
export const OP_SORT_KEYS: SortKey[] = ["order", "name"];
export type SortDir = 1 | -1;
export interface Sort {
  key: SortKey;
  dir: SortDir;
}
export const DEFAULT_SORT: Sort = { key: "order", dir: 1 };

/** 选中一种排序时先给的方向：游戏顺序 / 名称正着排，效率 / 人数高的在前 */
export const firstDir = (key: SortKey): SortDir =>
  key === "order" || key === "name" ? 1 : -1;

/** 显示方式，编号同地址栏的 _d */
export const View = { SKILL: 0, OP: 1 } as const;
export type ViewMode = (typeof View)[keyof typeof View];

/** 每页条数：只有干员视图分页（技能视图按设施折叠，同现网） */
export const PAGE_STEPS = [50, 100, 200, 500];
export const DEFAULT_STEP = 100;
/** 设施页里嵌着的那份只有一个设施的干员：一页放完 */
export const EMBED_STEP = 200;

/** 持有干员超过这么多位先收起（线索搜集·α 有 10 位，刚好放下） */
export const MAX_HOLDERS = 10;

export const LIST_PAGE = "后勤技能一览";
