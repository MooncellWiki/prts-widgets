import { BRANCHES, PROFESSION_ORDER } from "./professions";

import type { Char } from "./utils";

export interface FilterOption {
  /** 旧链接使用的值；独立于显示文字。 */
  readonly id: string;
  readonly label: string;
  readonly matches: (char: Char) => boolean;
}

export interface FilterDef {
  readonly title: string;
  readonly options: readonly FilterOption[];
  readonly canAnd?: boolean;
}

/** 普通选项与别名合并；是否提供「其他」由调用处明确指定。 */
function valueOptions(
  getValues: (char: Char) => readonly string[],
  entries: readonly (string | { label: string; values: readonly string[] })[],
  other = false,
): FilterOption[] {
  const groups = entries.map((entry) =>
    typeof entry === "string" ? { label: entry, values: [entry] } : entry,
  );
  const options: FilterOption[] = groups.map(({ label, values }) => ({
    id: label,
    label,
    matches: (char) => getValues(char).some((value) => values.includes(value)),
  }));
  if (other) {
    const known = new Set(groups.flatMap((group) => group.values));
    options.push({
      id: "其他",
      label: "其他",
      // 数组中只要有未知值就匹配，即使同时也有已知值；空数组不匹配。
      matches: (char) => getValues(char).some((value) => !known.has(value)),
    });
  }
  return options;
}

const SIX_GRADES = ["卓越", "优良", "标准", "普通", "缺陷"];
const gradeFilter = (
  title: string,
  getValue: (char: Char) => string,
): FilterDef => ({
  title,
  options: valueOptions((char) => [getValue(char)], SIX_GRADES, true),
});

/** 固定筛选规则。键名沿用旧 URL；新增分支在 professions.ts 的所属职业下维护。 */
export const FILTERS = {
  profession: {
    title: "职业",
    options: valueOptions((c) => [c.profession], PROFESSION_ORDER),
  },
  subProfession: {
    title: "分支",
    options: valueOptions(
      (c) => [c.subProfession],
      BRANCHES.map((b) => b.name),
    ),
  },
  rarity: {
    title: "稀有度",
    options: [1, 2, 3, 4, 5, 6].map((stars) => ({
      id: String(stars),
      label: `★${stars}`,
      matches: (c: Char) => c.stars === stars,
    })),
  },
  position: {
    title: "位置",
    options: valueOptions((c) => [c.position], ["近战位", "远程位"]),
  },
  sex: {
    title: "性别",
    options: [
      { id: "男性", label: "男性", matches: (c: Char) => c.sex === "男" },
      { id: "女性", label: "女性", matches: (c: Char) => c.sex === "女" },
      {
        id: "其他",
        label: "其他",
        matches: (c: Char) => c.sex !== "男" && c.sex !== "女",
      },
    ],
  },
  obtainMethod: {
    title: "获取途径",
    options: valueOptions(
      (c) => c.obtainMethod,
      [
        "公开招募",
        "标准寻访",
        "限定寻访",
        "中坚寻访",
        {
          label: "活动获得",
          values: ["活动获得", "记录修复奖励"],
        },
      ],
      true,
    ),
  },
  tag: {
    title: "词缀",
    options: valueOptions(
      (c) => c.tag,
      [
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
    ),
    canAnd: true,
  },
  phy: gradeFilter("物理强度", (c) => c.phy),
  flex: gradeFilter("战场机动", (c) => c.flex),
  tolerance: gradeFilter("生理耐受", (c) => c.tolerance),
  plan: gradeFilter("战术规划", (c) => c.plan),
  skill: gradeFilter("战斗技巧", (c) => c.skill),
  adapt: gradeFilter("源石技艺适应性", (c) => c.adapt),
  force: {
    title: "势力",
    options: valueOptions(
      (c) => c.force,
      [
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
    ),
  },
  birthPlace: {
    title: "出身地",
    options: valueOptions(
      (c) => [c.birthPlace],
      [
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
          values: ["汐斯塔", "汐斯塔（独立城邦）"],
        },
        "拉特兰",
        "哥伦比亚",
        "叙拉古",
        "卡西米尔",
        "卡兹戴尔",
        {
          label: "伊比利亚",
          values: ["阿戈尔地区", "伊比利亚"],
        },
        "乌萨斯",
        {
          label: "东",
          values: ["东", "东国"],
        },
        "杜林",
        {
          label: "未公开/不公开",
          values: ["未公开", "因经纪公司要求不公开"],
        },
        {
          label: "未知",
          values: ["不明", "未知"],
        },
      ],
      true,
    ),
  },
  race: {
    title: "种族",
    options: valueOptions(
      (c) => c.race,
      [
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
          values: ["未公开", "因经纪公司要求不公开"],
        },
        {
          label: "未知",
          values: ["未知", "不明", "未知（疑似黎博利）"],
        },
      ],
      true,
    ),
  },
} satisfies Record<string, FilterDef>;

export type FilterId = keyof typeof FILTERS;

export interface AdvancedTab {
  id: string;
  title: string;
  fields: readonly FilterId[];
  /** 选项多的类带一个「找选项」输入框 */
  find?: boolean;
}

/** 常用筛选在 FilterPanel 中明确排布，其余固定分到以下页签。 */
export const ADVANCED_TABS: readonly AdvancedTab[] = [
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
