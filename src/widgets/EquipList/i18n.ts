import { LANGUAGES } from "@/utils/i18n";

export const customSubtype: Record<string, Record<string, string>> = {
  zh: {},
};

const customPages = {
  zhCN: [
    {
      label: "5 / 页",
      value: 5,
    },
    {
      label: "10 / 页",
      value: 10,
    },
    {
      label: "25 / 页",
      value: 25,
    },
    {
      label: "50 / 页",
      value: 50,
    },
  ],
  zhTW: [
    {
      label: "5 / 頁",
      value: 5,
    },
    {
      label: "10 / 頁",
      value: 10,
    },
    {
      label: "25 / 頁",
      value: 25,
    },
    {
      label: "50 / 頁",
      value: 50,
    },
  ],
  enUS: [
    {
      label: "5 / Page",
      value: 5,
    },
    {
      label: "10 / Page",
      value: 10,
    },
    {
      label: "25 / Page",
      value: 25,
    },
    {
      label: "50 / Page",
      value: 50,
    },
  ],
  jaJP: [
    {
      label: "5 / ページ",
      value: 5,
    },
    {
      label: "10 / ページ",
      value: 10,
    },
    {
      label: "25 / ページ",
      value: 25,
    },
    {
      label: "50 / ページ",
      value: 50,
    },
  ],
};

export const customLabel = {
  zh: {
    pagination: customPages.zhCN,
    emptyDesc: "无结果",
    filterTitle: "干员筛选",
    typeLabel: "职业",
    rarityLabel: "稀有度",
    subtypeLabel: "职业分支",
    subPlaceholder: "输入或在菜单中选择",
    subtypeMap: customSubtype.zh,
    tableCollapse: "模组排序和筛选",
    tableSortLabel: "排序",
    tableFilterLabel: "筛选",
    typeOptions: [
      "先锋",
      "近卫",
      "重装",
      "狙击",
      "术师",
      "医疗",
      "辅助",
      "特种",
    ],
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
  },
  "zh-tw": {
    pagination: customPages.zhTW,
    emptyDesc: "無結果",
    typeLabel: "職業",
    filterTitle: "幹員篩選",
    rarityLabel: "稀有度",
    tableSortLabel: "排序",
    tableFilterLabel: "篩選",
    tableCollapse: "模組排序和篩選",
    subPlaceholder: "鍵入或在選單中選擇",
    subtypeLabel: "職業分支",
    subtypeMap: customSubtype.zh,
    typeOptions: [
      "先鋒",
      "近衛",
      "重裝",
      "狙擊",
      "術師",
      "醫療",
      "輔助",
      "特種",
    ],
    statsMap: [
      ["hp", "生命"],
      ["atk", "攻擊"],
      ["def", "防禦"],
      ["res", "法術抗性"],
      ["time", "再部署"],
      ["cost", "部署费用"],
      ["block", "阻擋數"],
      ["atkspd", "攻擊速度"],
    ],
    sortOptions: {
      yes: "有",
      no: "無",
      asc: "實裝時間遞增",
      desc: "實裝時間遞減",
      all: "全部",
      default: "幹員稀有度",
      filterTalent: "新增天賦",
      filterTrait: "特性追加",
      filterType: "模組類型",
      filterTime: "實裝時間",
      filterOpt: "任務關卡",
      other: "其他",
    },
    equipString: {
      mission: "模組解鎖任務",
      nomission: "該模組無解鎖任務",
      condition: "解鎖需求與材料消耗",
      upgrade: "模組升級消耗",
      condTrust: "需要信賴值(%)",
      condLv: "需要達到等級(精英2階段)",
      condMission: "完成本模組所有模組解鎖任務",
      latest: "近期更新",
    },
    tableTitle: {
      name: "模組",
      data: "數值",
    },
    loading: "載入中",
  },
  en: {
    pagination: customPages.enUS,
    emptyDesc: "No Results",
    typeLabel: "Class",
    filterTitle: "Operators Filter",
    rarityLabel: "Rarity",
    tableSortLabel: "Sort",
    tableFilterLabel: "Filter",
    tableCollapse: "Modules Sorting & Filtering",
    subPlaceholder: "Input or choose from menu",
    subtypeLabel: "Branches",
    subtypeMap: customSubtype.zh,
    typeOptions: [
      "Vanguard",
      "Guard",
      "Defender",
      "Sniper",
      "Caster",
      "Medic",
      "Supporter",
      "Specialist",
    ],
    statsMap: [
      ["hp", "HP"],
      ["atk", "ATK"],
      ["def", "DEF"],
      ["res", "RES"],
      ["time", "Rdp."],
      ["cost", "Cost"],
      ["block", "Block"],
      ["atkspd", "ASPD"],
    ],
    sortOptions: {
      yes: "Yes",
      no: "No",
      asc: "Added Time(Asc.)",
      desc: "Added Time(Desc.)",
      all: "All",
      default: "Operator Rarity",
      filterTalent: "New Talent",
      filterTrait: "New Trait",
      filterType: "Module Type",
      filterTime: "Added Time",
      filterOpt: "Mission Stage",
      other: "Others",
    },
    equipString: {
      mission: "Module Missions",
      nomission: "This module has no module missions",
      condition: "Unlock Conditions & Materials",
      upgrade: "Upgrade Materials",
      condTrust: "Trust (%)",
      condLv: "Lv. (Elite 2)",
      condMission: "Complete all Module Missions",
      latest: "New Module",
    },
    tableTitle: {
      name: "Module",
      data: "Stats",
    },
    loading: "Loading",
  },
  ja: {
    pagination: customPages.jaJP,
    emptyDesc: "結果なし",
    typeLabel: "クラス",
    filterTitle: "オペレーター絞り込み",
    rarityLabel: "レアリティ",
    tableSortLabel: "並べ替え",
    tableFilterLabel: "絞り込み",
    tableCollapse: "モジュール並べ替えと絞り込み",
    subPlaceholder: "入力または選択してください",
    subtypeLabel: "クラス細分",
    subtypeMap: customSubtype.zh,
    typeOptions: [
      "先鋒",
      "近衛",
      "重装",
      "狙撃",
      "術師",
      "医療",
      "補助",
      "特殊",
    ],
    statsMap: [
      ["hp", "最大HP"],
      ["atk", "攻撃力"],
      ["def", "防御力"],
      ["res", "術耐性"],
      ["time", "再配置"],
      ["cost", "コスト"],
      ["block", "ブロック数"],
      ["atkspd", "攻撃速度"],
    ],
    sortOptions: {
      yes: "あり",
      no: "なし",
      asc: "追加時間昇順",
      desc: "追加時間降順",
      all: "すべて",
      default: "オペレーターレアリティ",
      filterTalent: "素質開放",
      filterTrait: "特性追加",
      filterType: "タイプ",
      filterTime: "追加時間",
      filterOpt: "任務ステージ",
      other: "その他",
    },
    equipString: {
      mission: "モジュール開放任務",
      nomission: "このモジュールは開放任務がありません",
      condition: "開放条件と必要素材",
      upgrade: "モジュール強化素材",
      condTrust: "必要信頼度(%)",
      condLv: "必要レベル(昇進2段階)",
      condMission: "すべての解放任務を完成する",
      latest: "最新追加",
    },
    tableTitle: {
      name: "モジュール",
      data: "ステータス",
    },
    loading: "ロード中",
  },
  // 韩语暂时使用英语本地化
  ko: {
    pagination: customPages.enUS,
    emptyDesc: "No Results",
    typeLabel: "Class",
    filterTitle: "Operators Filter",
    rarityLabel: "Rarity",
    tableSortLabel: "Sort",
    tableFilterLabel: "Filter",
    tableCollapse: "Module Sorting & Filtering",
    subPlaceholder: "Input or choose in menu",
    subtypeLabel: "Branches",
    subtypeMap: customSubtype.zh,
    typeOptions: [
      "Vanguard",
      "Guard",
      "Defender",
      "Sniper",
      "Caster",
      "Medic",
      "Supporter",
      "Specialist",
    ],
    statsMap: [
      ["hp", "HP"],
      ["atk", "ATK"],
      ["def", "DEF"],
      ["res", "RES"],
      ["time", "Rdp."],
      ["cost", "Cost"],
      ["block", "Block"],
      ["atkspd", "ASPD"],
    ],
    sortOptions: {
      yes: "Yes",
      no: "No",
      asc: "Added Time(Asc.)",
      desc: "Added Time(Desc.)",
      all: "All",
      default: "Operator Rarity",
      filterTalent: "New Talent",
      filterTrait: "New Trait",
      filterType: "Module Type",
      filterTime: "Added Time",
      filterOpt: "Mission Stage",
      other: "Others",
    },
    equipString: {
      mission: "Module Missions",
      nomission: "This module has no module missions.",
      condition: "Unlock Conditions & Materials",
      upgrade: "Upgrade Materials",
      condTrust: "Trust (%)",
      condLv: "Lv. (Elite 2)",
      condMission: "Complete all Module Missions\nof this module",
      latest: "New Module",
    },
    tableTitle: {
      name: "Module",
      data: "Stats",
    },
    loading: "Loading",
  },
};

export function getFilterType(locale: LANGUAGES) {
  return {
    title: customLabel[locale].typeLabel,
    options: customLabel[locale].typeOptions,
  };
}

export function getLocaleType(type: string, locale: LANGUAGES) {
  return customLabel[locale].typeOptions[
    customLabel[LANGUAGES.ZH].typeOptions.indexOf(type)
  ];
}

export function getZhType(type: string, locale: LANGUAGES) {
  return customLabel[LANGUAGES.ZH].typeOptions[
    customLabel[locale].typeOptions.indexOf(type)
  ];
}

export function getFilterRarity(locale: LANGUAGES) {
  return {
    title: customLabel[locale].rarityLabel,
    options: ["★4", "★5", "★6"],
  };
}

function stats(locale: LANGUAGES, type: string): string {
  const ele = customLabel[locale].statsMap.find((e) => e[0] === type);
  return ele ? ele[1] : "";
}

export function getSortOptions(locale: LANGUAGES) {
  return [
    {
      label: customLabel[locale].sortOptions.default,
      value: "default",
    },
    {
      label: customLabel[locale].sortOptions.asc,
      value: "asc",
    },
    {
      label: customLabel[locale].sortOptions.desc,
      value: "desc",
    },
    {
      label: stats(locale, "hp"),
      value: "hp",
    },
    {
      label: stats(locale, "atk"),
      value: "atk",
    },
    {
      label: stats(locale, "def"),
      value: "def",
    },
    {
      label: stats(locale, "res"),
      value: "res",
    },
    {
      label: stats(locale, "cost"),
      value: "cost",
    },
    {
      label: stats(locale, "time"),
      value: "time",
    },
    {
      label: stats(locale, "atkspd"),
      value: "atkspd",
    },
  ];
}

export function getFilterOptions(locale: LANGUAGES) {
  return [
    {
      label: customLabel[locale].sortOptions.all,
      value: "all",
    },
    {
      label: customLabel[locale].sortOptions.filterTalent,
      value: "talent",
    },
    {
      label: customLabel[locale].sortOptions.filterTrait,
      value: "trait",
    },
    {
      label: customLabel[locale].sortOptions.filterType,
      value: "type",
    },
    {
      label: customLabel[locale].sortOptions.filterTime,
      value: "addtime",
    },
    {
      label: customLabel[locale].sortOptions.filterOpt,
      value: "mission2opt",
    },
    {
      label: stats(locale, "hp"),
      value: "hp",
    },
    {
      label: stats(locale, "atk"),
      value: "atk",
    },
    {
      label: stats(locale, "def"),
      value: "def",
    },
    {
      label: stats(locale, "res"),
      value: "res",
    },
    {
      label: stats(locale, "cost"),
      value: "cost",
    },
    {
      label: stats(locale, "time"),
      value: "time",
    },
    {
      label: stats(locale, "block"),
      value: "block",
    },
    {
      label: stats(locale, "atkspd"),
      value: "atkspd",
    },
  ];
}

export function getFilterValue(locale: LANGUAGES, option: string = "all") {
  return option === "type"
    ? [
        {
          label: "X",
          value: "x",
        },
        {
          label: "Y",
          value: "y",
        },
        {
          label: "Δ",
          value: "δ",
        },
        {
          label: "α",
          value: "α",
        },
        {
          label: "β",
          value: "β",
        },
      ]
    : [
        {
          label: customLabel[locale].sortOptions.yes,
          value: "yes",
        },
        {
          label: customLabel[locale].sortOptions.no,
          value: "no",
        },
      ];
}
