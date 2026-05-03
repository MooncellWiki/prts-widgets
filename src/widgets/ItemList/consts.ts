import type { FilterConfig } from "./types";

export const defaultFilterConfig: FilterConfig = {
  filters: {
    rarity: {
      title: "稀有度",
      options: ["0", "1", "2", "3", "4", "5"],
    },
    category: {
      title: "分类",
      options: [
        "材料",
        "消耗道具",
        "作战记录",
        "建材",
        "建材原材料",
        "技巧概要",
        "芯片",
        "双芯片",
        "芯片组",
        "理智药剂",
        "食物",
        "物资补给",
        "定向寻访凭证",
        "专属寻访凭证",
        "通用信物",
        "信物",
        "中坚信物",
        "私人信件",
        "文件夹",
        "活动道具",
        "其它道具组合",
        "干员赠礼",
        "纪念物",
        "可露希尔票券",
        "其他道具",
        "其他干员道具",
        "养成材料组合",
        "家具收藏包",
        "形艺特辑组件包",
      ],
    },
    obtainApproach: {
      title: "获取途径",
      options: [
        "采购中心",
        "任务奖励",
        "赠送",
        "干员入职",
        "加工站产物",
        "制造站产物",
        "关卡掉落",
        "首次通关",
        "其他",
      ],
    },
  },
  groups: [
    {
      title: "筛选",
      filters: ["rarity", "category", "obtainApproach"],
      show: true,
    },
  ],
  states: {
    rarity: [],
    category: [],
    obtainApproach: [],
  },
  sortOrder: "id_asc",
};

export const rarityColorMap: Record<number, string> = {
  0: "#8e8e8e",
  1: "#D3DB2E",
  2: "#09B3F7",
  3: "#D8B3D8",
  4: "#FFC802",
  5: "#e06c00",
};

export const obtainApproachAliases: Record<string, string[]> = {
  采购中心: ["采购中心"],
  任务奖励: ["任务奖励", "日常任务", "周常任务"],
  赠送: ["赠送"],
  干员入职: ["干员入职"],
  加工站产物: ["加工站产物", "加工站"],
  制造站产物: ["制造站产物", "制造站"],
  关卡掉落: ["关卡掉落", "关卡限时掉落", "常规掉落"],
  首次通关: ["首次通关"],
  其他: [
    "清理房间获取",
    "自然时间回复",
    "战斗获取",
    "好友助战",
    "支援单位",
    "宿舍氛围",
    "线索交流",
    "每日恢复",
    "预约活动奖励",
  ],
};

export const sortOptions = [
  { label: "游戏内顺序", value: "id_asc" as const },
  { label: "游戏内倒序", value: "id_desc" as const },
  { label: "稀有度升序", value: "rarity_asc" as const },
  { label: "稀有度降序", value: "rarity_desc" as const },
];
