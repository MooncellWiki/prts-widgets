import { BRANCH_KEYS } from "./branchKeys";

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

/** 一行筛选的选项：写成 { label, value } = 一个选项管好几个值 */
export type FilterOption = string | { label: string; value: string[] };
export interface FilterDef {
  title: string;
  /** 对应 Char 上的属性，也是地址栏里的参数名 */
  field: string;
  /** 带「其他」的行，「其他」= 值不在本行任何选项里 */
  options: FilterOption[];
  /** 有没有「同时满足」（只有词缀行有） */
  canAnd?: boolean;
}

const SIX_GRADES = ["卓越", "优良", "标准", "普通", "缺陷", "其他"];

/**
 * 筛选项：出了新势力 / 新种族改这里；分支跟着 branchKeys.ts 走，新分支加到那边。
 * 次序也是地址栏参数的次序。
 */
export const FILTERS: FilterDef[] = [
  {
    title: "职业",
    field: "profession",
    options: ["先锋", "近卫", "重装", "狙击", "术师", "医疗", "辅助", "特种"],
  },
  { title: "分支", field: "subProfession", options: Object.keys(BRANCH_KEYS) },
  {
    title: "稀有度",
    field: "rarity",
    options: ["★1", "★2", "★3", "★4", "★5", "★6"],
  },
  { title: "位置", field: "position", options: ["近战位", "远程位"] },
  { title: "性别", field: "sex", options: ["男性", "女性", "其他"] },
  {
    title: "获取途径",
    field: "obtainMethod",
    options: [
      "公开招募",
      "标准寻访",
      "限定寻访",
      "中坚寻访",
      {
        label: "活动获得",
        value: ["活动获得", "记录修复奖励"],
      },
      "其他",
    ],
  },
  {
    title: "词缀",
    field: "tag",
    options: [
      "治疗",
      "支援",
      "输出",
      "群攻",
      "减速",
      "生存",
      "防护",
      "削弱",
      "位移",
      "控场",
      "爆发",
      "召唤",
      "快速复活",
      "费用回复",
      "支援机械",
      "元素",
      "高空",
    ],
    canAnd: true,
  },
  { title: "物理强度", field: "phy", options: SIX_GRADES },
  { title: "战场机动", field: "flex", options: SIX_GRADES },
  { title: "生理耐受", field: "tolerance", options: SIX_GRADES },
  { title: "战术规划", field: "plan", options: SIX_GRADES },
  { title: "战斗技巧", field: "skill", options: SIX_GRADES },
  { title: "源石技艺适应性", field: "adapt", options: SIX_GRADES },
  {
    title: "势力",
    field: "force",
    options: [
      "罗德岛",
      "炎",
      "炎-龙门",
      "阿戈尔",
      "玻利瓦尔",
      "哥伦比亚",
      "东",
      "伊比利亚",
      "卡西米尔",
      "谢拉格",
      "拉特兰",
      "莱塔尼亚",
      "米诺斯",
      "雷姆必拓",
      "萨米",
      "萨尔贡",
      "叙拉古",
      "乌萨斯",
      "维多利亚",
      "罗德岛-精英干员",
      "S.W.E.E.P.",
      "巴别塔",
      "深海猎人",
      "黑钢国际",
      "格拉斯哥帮",
      "喀兰贸易",
      "龙门近卫局",
      "企鹅物流",
      "红松骑士团",
      "莱茵生命",
      "汐斯塔",
      "炎-岁",
      "深池",
      "塔拉",
      "行动组A4",
      "行动预备组A1",
      "行动预备组A4",
      "行动预备组A6",
      "贾维团伙",
      "使徒",
      "鲤氏侦探事务所",
      "彩虹小队",
      "乌萨斯学生自治团",
      "莱欧斯小队",
      "Ave Mujica",
    ],
  },
  {
    title: "出身地",
    field: "birthPlace",
    options: [
      "龙门",
      "雷姆必拓",
      "阿戈尔",
      "谢拉格",
      "萨米",
      "萨尔贡",
      "莱塔尼亚",
      "罗德岛",
      "维多利亚",
      "米诺斯",
      "瓦伊凡",
      "玻利瓦尔",
      "炎",
      {
        label: "汐斯塔",
        value: ["汐斯塔", "汐斯塔（独立城邦）"],
      },
      "拉特兰",
      "哥伦比亚",
      "叙拉古",
      "卡西米尔",
      "卡兹戴尔",
      {
        label: "伊比利亚",
        value: ["阿戈尔地区", "伊比利亚"],
      },
      "乌萨斯",
      {
        label: "东",
        value: ["东", "东国"],
      },
      "杜林",
      {
        label: "未公开/不公开",
        value: ["未公开", "因经纪公司要求不公开"],
      },
      {
        label: "未知",
        value: ["不明", "未知"],
      },
      "其他",
    ],
  },
  {
    title: "种族",
    field: "race",
    options: [
      "龙",
      "黎博利",
      "麒麟",
      "鲁珀",
      "鬼",
      "阿达克利斯",
      "阿纳萨",
      "阿纳缇",
      "阿斯兰",
      "阿戈尔",
      "萨科塔",
      "萨弗拉",
      "萨卡兹",
      "菲林",
      "皮洛萨",
      "瓦伊凡",
      "瑞柏巴",
      "沃尔珀",
      "杜林",
      "札拉克",
      "曼提柯",
      "斐迪亚",
      "德拉克",
      "库兰塔",
      "安努拉",
      "奇美拉",
      "塞拉托",
      "埃拉菲亚",
      "卡特斯",
      "卡普里尼",
      "匹特拉姆",
      "依特拉",
      "佩洛",
      "乌萨斯",
      "丰蹄",
      "精灵",
      {
        label: "未公开/不公开",
        value: ["未公开", "因经纪公司要求不公开"],
      },
      {
        label: "未知",
        value: ["未知", "不明", "未知（疑似黎博利）"],
      },
      "其他",
    ],
  },
];

/**
 * 筛选项怎么摆：QUICK 一直在；其余进「高级筛选」，按类分页签。
 * FILTERS 里新增了这里没列的字段 → 落到第一个页签。
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
