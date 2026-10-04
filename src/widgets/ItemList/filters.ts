/**
 * 筛选项定义。三行：分类 / 稀有度 / 获取途径；行内「或」、行间「且」。
 * 选项的 id 就是芯片上的字，也是地址栏里写的值（稀有度写 0–5，同模板输出的 data-rarity）。
 */
export type FilterId = "category" | "rarity" | "obtain";

export const FILTER_IDS: FilterId[] = ["category", "rarity", "obtain"];

export interface FilterOption {
  id: string;
  label: string;
}

interface OptionDef {
  id: string;
  /** 命中哪些值；不写 = 只有 id 自己 */
  values?: string[];
  /** 兜底项：别的选项都没命中的也归它 */
  rest?: boolean;
}

/**
 * 分类按游戏仓库的页签归成几组（ItemRepoUtil.CheckItemFitFilter 的 ClassifyFilter：
 * MATERIAL 养成 / NORMAL 基础 / CONSUME 消耗；classifyType 是 NONE 的不进仓库），
 * 一个分类归哪组看它名下多数道具的 classifyType。归类只是摆法：筛的还是 wiki 的分类（category1–3）。
 * 组内按仓库里的先后（sortId）排，「材料」提到最前。
 */
const CATEGORY_GROUPS: { label: string; options: OptionDef[] }[] = [
  {
    label: "养成材料",
    options: [
      { id: "材料" },
      { id: "作战记录" },
      { id: "技巧概要" },
      { id: "精英化芯片", values: ["芯片", "芯片组", "双芯片"] },
      { id: "通用信物" },
      { id: "信物" },
      { id: "中坚信物" },
      { id: "私人信件" },
    ],
  },
  {
    label: "基础物品",
    options: [
      { id: "基础道具" },
      { id: "寻访数据契约" },
      { id: "可露希尔票券" },
      { id: "纪念物" },
      { id: "专属寻访凭证" },
      { id: "基建材料", values: ["建材", "建材原材料"] },
    ],
  },
  {
    label: "消耗物品",
    options: [
      { id: "理智药剂" },
      { id: "食物" },
      { id: "定向寻访凭证" },
      { id: "消耗道具" },
      { id: "物资补给" },
      { id: "干员赠礼" },
    ],
  },
  {
    label: "其他类别",
    options: [
      { id: "活动道具" },
      {
        id: "道具组合",
        values: [
          "养成材料组合",
          "家具收藏包",
          "其它道具组合",
          "形艺特辑组件包",
        ],
      },
      { id: "文件夹" },
      { id: "其他", values: ["其他道具", "其他干员道具"], rest: true },
    ],
  },
];

/** 获取途径是模板里的一段自由文本，按「、，,」拆开后逐段看含不含这些字 */
const OBTAIN_OPTIONS: OptionDef[] = [
  { id: "采购中心" },
  { id: "任务奖励", values: ["任务奖励", "日常任务", "周常任务"] },
  { id: "赠送" },
  { id: "干员入职" },
  { id: "加工站产物", values: ["加工站"] },
  { id: "制造站产物", values: ["制造站"] },
  { id: "关卡掉落", values: ["关卡掉落", "关卡限时掉落", "常规掉落"] },
  { id: "首次通关" },
  { id: "活动获得", values: ["活动"] },
  { id: "记录修复" },
  { id: "其他", rest: true },
];

/** 稀有度 0–5 = 游戏的 ItemRarity TIER_1…TIER_6，叫法照道具底框的颜色 */
const RARITY_LABELS = ["灰", "绿", "蓝", "紫", "金", "彩"];

const toOption = ({ id }: OptionDef): FilterOption => ({ id, label: id });

export interface FilterDef {
  id: FilterId;
  title: string;
  options: FilterOption[];
  /** 选项分组摆（只有分类行有） */
  groups?: { label: string; options: FilterOption[] }[];
}

export const FILTERS: Record<FilterId, FilterDef> = {
  category: {
    id: "category",
    title: "分类",
    options: CATEGORY_GROUPS.flatMap((g) => g.options.map(toOption)),
    groups: CATEGORY_GROUPS.map((g) => ({
      label: g.label,
      options: g.options.map(toOption),
    })),
  },
  rarity: {
    id: "rarity",
    title: "稀有度",
    options: RARITY_LABELS.map((label, i) => ({ id: String(i), label })),
  },
  obtain: {
    id: "obtain",
    title: "获取途径",
    options: OBTAIN_OPTIONS.map(toOption),
  },
};

/** 进页面时已经选着的（同旧版）；地址栏里不写这一行时按它算 */
export const DEFAULT_CATEGORY = ["材料"];

function hitOptions(
  defs: OptionDef[],
  hit: (value: string) => boolean,
): Set<string> {
  const out = new Set<string>();
  for (const def of defs)
    if ((def.values ?? [def.id]).some(hit)) out.add(def.id);
  if (out.size === 0) for (const def of defs) if (def.rest) out.add(def.id);
  return out;
}

const CATEGORY_DEFS = CATEGORY_GROUPS.flatMap((g) => g.options);

/** 一件道具落在各行的哪些选项里；每行至少落一项（都没命中的归「其他」） */
export function itemOptions(item: {
  categories: string[];
  rarity: number;
  obtain: string[];
}): Record<FilterId, ReadonlySet<string>> {
  return {
    category: hitOptions(CATEGORY_DEFS, (v) => item.categories.includes(v)),
    rarity: new Set([String(item.rarity)]),
    obtain: hitOptions(OBTAIN_OPTIONS, (v) =>
      item.obtain.some((piece) => piece.includes(v)),
    ),
  };
}

export const hasOption = (id: FilterId, option: string) =>
  FILTERS[id].options.some((o) => o.id === option);
