import { LANGUAGES } from "@/utils/i18n";

export const customSubtype: Record<string, Record<string, string>> = {
  zh: {},
  "zh-tw": {},
  en: {
    先锋: "Vangurad",
    近卫: "Guard",
    重装: "Defender",
    狙击: "Sniper",
    术师: "Caster",
    医疗: "Medic",
    辅助: "Supporter",
    特种: "Specialist",
    尖兵: "Pioneer",
    冲锋手: "Charger",
    执旗手: "Standard Bearer",
    战术家: "Tactician",
    情报官: "Agent",
    无畏者: "Dreadnought",
    强攻手: "Centurion",
    领主: "Lord",
    术战者: "Arts Fighter",
    教官: "Instructor",
    斗士: "Fighter",
    剑豪: "Swordmaster",
    武者: "Monoblade",
    解放者: "Liberator",
    收割者: "Reaper",
    重剑手: "Crusher",
    撼地者: "Earthshaker",
    铁卫: "Protector",
    守护者: "Guardian",
    不屈者: "Juggernaut",
    驭法铁卫: "Arts Protector",
    决战者: "Duelist",
    要塞: "Fortress",
    哨戒铁卫: "Sentinel Protector",
    速射手: "Marksman",
    炮手: "Artilleryman",
    神射手: "Deadeye Sniper",
    重射手: "Heavyshooter",
    散射手: "Spreadshooter",
    攻城手: "Besieger",
    投掷手: "Flinger",
    中坚术师: "Core Caster",
    扩散术师: "Splash Caster",
    轰击术师: "Blast Caster",
    链术师: "Chain Caster",
    驭械术师: "Mech-Accord Caster",
    阵法术师: "Phalanx Caster",
    秘术师: "Mystic Caster",
    本源术师: "Primal Caster",
    医师: "Medic",
    群愈师: "Multi-target Medic",
    疗养师: "Therapist",
    行医: "Wandering Medic",
    咒愈师: "Incantation Medic",
    链愈师: "Chain Medic",
    凝滞师: "Decel Binder",
    召唤师: "Summoner",
    削弱者: "Hexer",
    吟游者: "Bard",
    护佑者: "Abjurer",
    工匠: "Artificer",
    巫役: "Ritualist",
    推击手: "Push Stroker",
    钩索师: "Hookmaster",
    处决者: "Executor",
    伏击客: "Ambusher",
    怪杰: "Geek",
    行商: "Merchant",
    陷阱师: "Trapmaster",
    傀儡师: "Dollkeeper",
    猎手: "Hunter",
    回环射手: "Loopshooter",
  },
  ja: {
    先锋: "先鋒",
    近卫: "近衛",
    重装: "重装",
    狙击: "狙撃",
    术师: "術師",
    医疗: "医療",
    辅助: "補助",
    特种: "特殊",
    尖兵: "先駆兵",
    冲锋手: "突擊兵",
    执旗手: "旗手",
    战术家: "戦術家",
    情报官: "偵察兵",
    无畏者: "勇士",
    强攻手: "強襲者",
    领主: "領主",
    术战者: "術戰士",
    教官: "教官",
    斗士: "闘士",
    剑豪: "剣豪",
    武者: "武者",
    解放者: "解放者",
    收割者: "鐮擊士",
    重剑手: "重剣士",
    //撼地者: "Earthshaker",
    铁卫: "重盾衛士",
    守护者: "庇護衛士",
    不屈者: "破壞者",
    驭法铁卫: "術技衛士",
    决战者: "決闘者",
    要塞: "堅城砲手",
    哨戒铁卫: "哨戒衛士",
    速射手: "速射手",
    炮手: "榴弾射手",
    神射手: "戦術射手",
    重射手: "精密射手",
    散射手: "散弾射手",
    攻城手: "破城射手",
    投掷手: "投擲手",
    中坚术师: "中堅術師",
    扩散术师: "拡散術師",
    轰击术师: "爆擊術師",
    链术师: "連鎖術師",
    驭械术师: "操機術師",
    阵法术师: "法陣術師",
    秘术师: "秘術師",
    //本源术师: "Primal Caster",
    医师: "医師",
    群愈师: "群癒師",
    疗养师: "療養師",
    行医: "放浪医",
    咒愈师: "呪癒師",
    链愈师: "連鎖癒師",
    凝滞师: "緩速師",
    召唤师: "召喚師",
    削弱者: "呪詛師",
    吟游者: "吟遊者",
    护佑者: "祈祷師",
    工匠: "工匠",
    //巫役: "Ritualist",
    推击手: "推擊手",
    钩索师: "鉤縄師",
    处决者: "執行者",
    伏击客: "潜伏者",
    怪杰: "鬼才",
    行商: "行商人",
    陷阱师: "罠師",
    傀儡师: "傀儡師",
  },
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
    subtypeMap: customSubtype["zh"],
    tableCollapse: "排序和筛选",
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
      asc: "升序",
      desc: "降序",
      all: "全部",
      default: "默认",
      filterTalent: "新增天赋",
      filterTrait: "特性追加",
    },
    equipString: {
      mission: "模组解锁任务",
      condition: "解锁需求与材料消耗",
      upgrade: "模组升级消耗",
      condStats: [
        "完成该模组所有模组解锁任务",
        "达到精英阶段2",
        "级",
        "信赖值达到",
        "%",
      ],
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
    tableCollapse: "排序和篩選",
    subPlaceholder: "鍵入或在選單中選擇",
    subtypeLabel: "職業分支",
    subtypeMap: customSubtype["zh-tw"],
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
      asc: "遞增",
      desc: "遞減",
      all: "全部",
      default: "預設",
      filterTalent: "新增天賦",
      filterTrait: "特性追加",
    },
    equipString: {
      mission: "模組解鎖任務",
      condition: "解鎖需求與材料消耗",
      upgrade: "模組升級消耗",
      condStats: [
        "完成該模組所有模組解鎖任務",
        "達到精英階段2",
        "級",
        "信賴值達到",
        "%",
      ],
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
    tableCollapse: "Sorting & Filtering",
    subPlaceholder: "Input or choose from menu",
    subtypeLabel: "Branches",
    subtypeMap: customSubtype["en"],
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
      asc: "Ascending",
      desc: "Descending",
      all: "All",
      default: "Default",
      filterTalent: "New Talent",
      filterTrait: "New Trait",
    },
    equipString: {
      mission: "Module Missions",
      condition: "Unlock Conditions & Materials",
      upgrade: "Upgrade Materials",
      condStats: [
        "Complete all Module Missions",
        "Raise to Elite 2, Level",
        "",
        "Have at least",
        "% Trust",
      ],
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
    tableCollapse: "並べ替えと絞り込み",
    subPlaceholder: "入力または選択してください",
    subtypeLabel: "クラス細分",
    subtypeMap: customSubtype["ja"],
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
      asc: "昇順",
      desc: "降順",
      all: "すべて",
      default: "デフォルト",
      filterTalent: "素質開放",
      filterTrait: "特性追加",
    },
    equipString: {
      mission: "モジュール開放任務",
      condition: "開放条件と必要素材",
      upgrade: "モジュール強化素材",
      condStats: [
        "すべての開放任務を完了",
        "昇進段階2 Lv.",
        "に到達",
        "信頼度",
        "%に到達",
      ],
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
    tableCollapse: "Sorting & Filtering",
    subPlaceholder: "Input or choose in menu",
    subtypeLabel: "Branches",
    subtypeMap: customSubtype["en"],
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
      asc: "Ascending",
      desc: "Descending",
      all: "All",
      default: "Default",
      filterTalent: "New Talent",
      filterTrait: "New Trait",
    },
    equipString: {
      mission: "Module Missions",
      condition: "Unlock Conditions & Materials",
      upgrade: "Upgrade Materials",
      condStats: [
        "Complete all Module Missions",
        "Raise to Elite 2, Level",
        "",
        "Have at least",
        "% Trust",
      ],
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
  const ele = customLabel[locale].statsMap.find((e) => e[0] == type);
  return ele ? ele[1] : "";
}

export function getSortOptions(locale: LANGUAGES) {
  return [
    {
      label: customLabel[locale].sortOptions.default,
      value: "default",
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

export function getSortValue(locale: LANGUAGES) {
  return [
    {
      label: customLabel[locale].sortOptions.asc,
      value: "asc",
    },
    {
      label: customLabel[locale].sortOptions.desc,
      value: "desc",
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

export function getFilterValue(locale: LANGUAGES) {
  return [
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
