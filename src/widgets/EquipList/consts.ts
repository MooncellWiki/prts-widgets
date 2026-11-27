import { getImagePath } from "@/utils/utils";

export const colorMap: Record<string, string> = {
  red: "#F44336",
  blue: "#2196F3",
  green: "#8bd41c",
  yellow: "#ffaa22",
  purple: "#880acc",
  grey: "#2f2f2f",
};

export const shadowColor: Record<string, string> = {
  red: "#ef4444",
  green: "#84cc16",
  yellow: "#f59e0b",
  blue: "#3b82f6",
  purple: "#7e22ce",
  grey: "#52525b",
};

export const statsStyleMap: Record<string, number> = {
  hp: 1,
  atk: 1,
  def: 1,
  res: 1,
  time: -1,
  cost: -1,
  block: 1,
  atkspd: 1,
};

/** 模组稀有度 3 / 4 / 5 → 4 / 5 / 6 星；筛选芯片上的星形自己画。 */
export const rarityMap: Record<string, string> = {
  "3": "4",
  "4": "5",
  "5": "6",
};
export const tagIconFavor = getImagePath("图标_模组需求_信赖.png");

export const tagIconOther = getImagePath("图标_模组需求_精英2等级.png");

export const customLabel = {
  emptyDesc: "无结果",
  filterTitle: "干员筛选",
  typeLabel: "职业",
  rarityLabel: "稀有度",
  subtypeLabel: "职业分支",
  subPlaceholder: "输入或在菜单中选择",
  tableCollapse: "模组排序和筛选",
  tableSortLabel: "排序",
  tableFilterLabel: "筛选",
  pagination: [5, 10, 25, 50],
  typeOptions: ["先锋", "近卫", "重装", "狙击", "术师", "医疗", "辅助", "特种"],
  statsMap: [
    ["hp", "生命"],
    ["atk", "攻击"],
    ["def", "防御"],
    ["res", "法术抗性"],
    ["time", "再部署"],
    ["cost", "部署费用"],
    ["block", "阻挡数"],
    ["atkspd", "攻击速度"],
  ],
  sortOptions: {
    yes: "有",
    no: "无",
    asc: "实装时间升序",
    desc: "实装时间降序",
    all: "全部",
    default: "干员稀有度",
    filterTalent: "新增天赋",
    filterTrait: "特性追加",
    filterType: "模组类型",
    filterTime: "实装时间",
    filterOpt: "任务关卡",
    other: "其他",
  },
  equipString: {
    mission: "模组解锁任务",
    nomission: "该模组无解锁任务",
    condition: "解锁需求与材料消耗",
    upgrade: "模组升级消耗",
    condTrust: "需要信赖值(%)",
    condLv: "需要达到等级(精英2阶段)",
    condMission: "完成本模组所有模组解锁任务",
    latest: "近期更新",
  },
  tableTitle: {
    name: "模组",
    data: "数据",
  },
  loading: "加载中",
};
