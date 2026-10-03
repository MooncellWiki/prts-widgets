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
 * 同旧版：「新手」归资质，「支援机械」归词缀（两个在游戏数据里都同治疗、支援一样写在 tagList 里，只是只有 2★ / 1★ 带）。
 *
 * 次序对齐游戏招募页：招募页照服务器给的 slot.tags 原样一行三个摆（RecruitBuildConfigStateBean.SetData 不排序），
 * 服务器给的是 tagId 升序，即 职业 1–8 → 位置 9–10 → 词缀 12–29，面板照这个从上到下、从左到右排，跟着游戏扫一遍就能选完。
 * 资质三个（高资 11、资深 14、新手 17）在游戏里夹在词缀中间，单独成行放最上（同旧版）。
 */
export const TAG_GROUPS: readonly { title: string; tags: readonly string[] }[] =
  [
    { title: "资质", tags: [TOP, SENIOR, NOVICE] },
    {
      title: "职业",
      tags: ["近卫", "狙击", "重装", "医疗", "辅助", "术师", "特种", "先锋"],
    },
    { title: "位置", tags: ["近战位", "远程位"] },
    {
      title: "词缀",
      tags: [
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
        ROBOT,
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
 * 不按招募时限筛干员，1–5★ 都列；6★ 只在组合含【高级资深干员】时出（specialTagRarityTable）。
 * 保底按 9:00 算：此时只出 3–5★（gacha_table.recruitRarityTable 7:40–9:00 那一段），
 * 低于 MIN_STAR 的（1★ 支援机械、2★ 新手）要把时限压短才出，不拉低保底，见 recruit.ts 的 combosOf。
 */
export const MIN_STAR = 3;
