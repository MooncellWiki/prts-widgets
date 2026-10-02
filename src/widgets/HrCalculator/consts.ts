/**
 * 旧版 Widget 的四组标签及组内次序：地址栏 ?filter= 按它编码（现网分享出去的链接都是这个写法），一个字都不能动。
 * 面板上怎么摆看 TAG_GROUPS，两边互不影响。
 */
export const LIVE_GROUPS: Record<
  "profession" | "position" | "rarity" | "tag",
  readonly string[]
> = {
  profession: ["近卫", "狙击", "重装", "医疗", "辅助", "术师", "特种", "先锋"],
  position: ["近战位", "远程位"],
  rarity: ["高级资深干员", "资深干员", "新手"],
  tag: [
    "支援机械",
    "控场",
    "爆发",
    "治疗",
    "支援",
    "费用回复",
    "输出",
    "生存",
    "群攻",
    "防护",
    "减速",
    "削弱",
    "快速复活",
    "位移",
    "召唤",
    "元素",
  ],
};

export const TOP = "高级资深干员";
export const SENIOR = "资深干员";
export const ROBOT = "支援机械";
export const NOVICE = "新手";

/**
 * 面板上的四行：社区通行的归类（游戏数据 gachaTags 自己不分组，友站也是这四类）。
 * 旧版把「支援机械」放在词缀里、「新手」放在资历里，这里两个都归资质。
 */
export const TAG_GROUPS: readonly { title: string; tags: readonly string[] }[] =
  [
    { title: "资质", tags: [TOP, SENIOR, NOVICE, ROBOT] },
    { title: "位置", tags: ["近战位", "远程位"] },
    {
      title: "职业",
      tags: ["先锋", "近卫", "重装", "狙击", "术师", "医疗", "辅助", "特种"],
    },
    {
      title: "词缀",
      tags: [
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
        "元素",
      ],
    },
  ];
export const ALL_TAGS = TAG_GROUPS.flatMap((g) => g.tags);

/** 两个稀有标签（specialTagRarityTable 的键）：另一套皮 */
export const isSenior = (tag: string) => tag === TOP || tag === SENIOR;

/** 游戏：至多选 3 个标签（RecruitBuildConfigStateBean.MAX_TAG_SELECT_NUM） */
export const MAX_PICK = 3;

/**
 * 不选招募时限，一律按 9:00 算：可能出现 3–5★（gacha_table.recruitRarityTable 7:40–9:00 那一段），两个稀有标签此时锁定。
 * 6★ 只在组合含【高级资深干员】时算（specialTagRarityTable）；1★ 只在组合含【支援机械】时算（时限压到 3:50 以内才出），见 recruit.ts 的 combosOf。
 */
export const MIN_STAR = 3;
