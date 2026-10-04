import { convertAbility } from "./ability";
import { STAT_COLS, type StatKey } from "./consts";

/** 「敌人一览/数据」里的一条（机器人按游戏数据维护的 JSON） */
export interface EnemyData extends Record<StatKey, string> {
  enemyIndex: string;
  sortId: number;
  name: string;
  enemyLink: string;
  enemyRace: string;
  /** 普通 / 精英 / 领袖 */
  enemyLevel: string;
  /** 空格分开：近战 / 远程 / 不攻击 */
  attackType: string;
  /** 空格分开：物理 / 法术 / 治疗 / 无 */
  damageType: string;
  /** 地面 / 飞行 */
  motion: string;
  ability: string;
}

export type EnemyRank = "normal" | "elite" | "boss";

const RANKS: Record<string, EnemyRank> = { 精英: "elite", 领袖: "boss" };

const words = (s: string | undefined) => (s ?? "").split(/\s+/).filter(Boolean);

/** 页面名里的空格是下划线，/ 是子页面分隔，不转义 */
const wikiLink = (title: string) =>
  `/w/${encodeURIComponent(title.replaceAll(" ", "_")).replaceAll("%2F", "/")}`;

/** 一个敌人：数据原样拆好，能力转成能直接输出的 HTML */
export interface Enemy {
  /** 图鉴编号（B1 / SP18），有重复 */
  index: string;
  /** 图鉴顺序，唯一 */
  sortId: number;
  name: string;
  href: string;
  race: string;
  level: string;
  rank: EnemyRank;
  attackType: string[];
  damageType: string[];
  motion: string;
  /** 八项属性的等级（SS … E，游戏里隐藏数值的是 ?） */
  stats: Record<StatKey, string>;
  abilityHtml: string;
  plainAbility: string;
}

export function toEnemy(data: EnemyData): Enemy {
  const ability = convertAbility(data.ability ?? "");
  return Object.freeze({
    index: data.enemyIndex ?? "",
    sortId: Number(data.sortId),
    name: data.name,
    href: wikiLink(data.enemyLink || data.name),
    race: data.enemyRace ?? "",
    level: data.enemyLevel ?? "",
    rank: RANKS[data.enemyLevel] ?? "normal",
    attackType: words(data.attackType),
    damageType: words(data.damageType),
    motion: data.motion ?? "",
    stats: Object.fromEntries(
      STAT_COLS.map(({ key }) => [key, data[key] ?? "?"]),
    ) as Record<StatKey, string>,
    abilityHtml: ability.html,
    plainAbility: ability.plain,
  });
}
