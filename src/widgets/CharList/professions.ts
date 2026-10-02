/** 职业、分支归属与图标 key 的唯一来源；数组次序即筛选与排序的次序。 */
export const PROFESSIONS = [
  {
    name: "先锋",
    iconKey: "pioneer",
    branches: [
      { name: "尖兵", iconKey: "pioneer" },
      { name: "冲锋手", iconKey: "charger" },
      { name: "战术家", iconKey: "tactician" },
      { name: "执旗手", iconKey: "bearer" },
      { name: "情报官", iconKey: "agent" },
      { name: "策士", iconKey: "counsellor" },
    ],
  },
  {
    name: "近卫",
    iconKey: "warrior",
    branches: [
      { name: "强攻手", iconKey: "centurion" },
      { name: "斗士", iconKey: "fighter" },
      { name: "术战者", iconKey: "artsfghter" },
      { name: "教官", iconKey: "instructor" },
      { name: "领主", iconKey: "lord" },
      { name: "剑豪", iconKey: "sword" },
      { name: "武者", iconKey: "musha" },
      { name: "无畏者", iconKey: "fearless" },
      { name: "收割者", iconKey: "reaper" },
      { name: "解放者", iconKey: "librator" },
      { name: "重剑手", iconKey: "crusher" },
      { name: "撼地者", iconKey: "hammer" },
      { name: "本源近卫", iconKey: "primguard" },
      { name: "佣兵", iconKey: "mercenary" },
    ],
  },
  {
    name: "重装",
    iconKey: "tank",
    branches: [
      { name: "铁卫", iconKey: "protector" },
      { name: "守护者", iconKey: "guardian" },
      { name: "不屈者", iconKey: "unyield" },
      { name: "驭法铁卫", iconKey: "artsprotector" },
      { name: "决战者", iconKey: "duelist" },
      { name: "要塞", iconKey: "fortress" },
      { name: "哨戒铁卫", iconKey: "shotprotector" },
      { name: "本源铁卫", iconKey: "primprotector" },
    ],
  },
  {
    name: "狙击",
    iconKey: "sniper",
    branches: [
      { name: "速射手", iconKey: "fastshot" },
      { name: "重射手", iconKey: "closerange" },
      { name: "炮手", iconKey: "aoesniper" },
      { name: "神射手", iconKey: "longrange" },
      { name: "散射手", iconKey: "reaperrange" },
      { name: "攻城手", iconKey: "siegesniper" },
      { name: "投掷手", iconKey: "bombarder" },
      { name: "猎手", iconKey: "hunter" },
      { name: "回环射手", iconKey: "loopshooter" },
      { name: "裂空炮手", iconKey: "skybreaker" },
    ],
  },
  {
    name: "术师",
    iconKey: "caster",
    branches: [
      { name: "中坚术师", iconKey: "corecaster" },
      { name: "扩散术师", iconKey: "splashcaster" },
      { name: "驭械术师", iconKey: "funnel" },
      { name: "阵法术师", iconKey: "phalanx" },
      { name: "秘术师", iconKey: "mystic" },
      { name: "链术师", iconKey: "chain" },
      { name: "轰击术师", iconKey: "blastcaster" },
      { name: "本源术师", iconKey: "primcaster" },
      { name: "塑灵术师", iconKey: "soulcaster" },
    ],
  },
  {
    name: "医疗",
    iconKey: "medic",
    branches: [
      { name: "医师", iconKey: "physician" },
      { name: "群愈师", iconKey: "ringhealer" },
      { name: "疗养师", iconKey: "healer" },
      { name: "行医", iconKey: "wandermedic" },
      { name: "咒愈师", iconKey: "incantationmedic" },
      { name: "链愈师", iconKey: "chainhealer" },
      { name: "守望者", iconKey: "watchman" },
    ],
  },
  {
    name: "辅助",
    iconKey: "support",
    branches: [
      { name: "凝滞师", iconKey: "slower" },
      { name: "削弱者", iconKey: "underminer" },
      { name: "吟游者", iconKey: "bard" },
      { name: "护佑者", iconKey: "blessing" },
      { name: "召唤师", iconKey: "summoner" },
      { name: "工匠", iconKey: "craftsman" },
      { name: "巫役", iconKey: "ritualist" },
      { name: "游击手", iconKey: "supportiveranger" },
    ],
  },
  {
    name: "特种",
    iconKey: "special",
    branches: [
      { name: "处决者", iconKey: "executor" },
      { name: "推击手", iconKey: "pusher" },
      { name: "伏击客", iconKey: "stalker" },
      { name: "钩索师", iconKey: "hookmaster" },
      { name: "怪杰", iconKey: "geek" },
      { name: "行商", iconKey: "merchant" },
      { name: "陷阱师", iconKey: "traper" },
      { name: "傀儡师", iconKey: "dollkeeper" },
      { name: "炼金师", iconKey: "alchemist" },
      { name: "巡空者", iconKey: "skywalker" },
    ],
  },
] as const;

export const PROFESSION_ORDER = PROFESSIONS.map((p) => p.name);

export const PROFESSION_ICONS: ReadonlyMap<string, string> = new Map(
  PROFESSIONS.map((p) => [p.name, p.iconKey]),
);

export const BRANCHES = PROFESSIONS.flatMap((p) =>
  p.branches.map((b) => ({ ...b, profession: p.name })),
);

export const BRANCH_BY_NAME: ReadonlyMap<string, (typeof BRANCHES)[number]> =
  new Map(BRANCHES.map((b) => [b.name, b]));
