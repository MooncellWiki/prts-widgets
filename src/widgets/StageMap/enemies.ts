import { TORAPPU_ENDPOINT } from "@/utils/consts";

import ENEMY_PREFABS from "./enemy-prefabs.json";

import type { EnemyDbRef } from "./level";

/** enemy_database 里的字段都包一层：m_defined 为假时沿用 0 级的值（同 LevelData.EnemyData 的 Undefinable<T>） */
interface Undefinable<T> {
  m_defined: boolean;
  m_value: T;
}

interface DbEnemyData {
  name: Undefinable<string>;
  prefabKey: Undefinable<string>;
  levelType: Undefinable<"NORMAL" | "ELITE" | "BOSS">;
  motion: Undefinable<"WALK" | "FLY">;
  notCountInTotal: Undefinable<boolean>;
  attributes: { moveSpeed: Undefinable<number> };
}

interface DbEntry {
  level: number;
  enemyData: DbEnemyData;
}

export interface EnemyDatabase {
  enemies: { Key: string; Value: DbEntry[] }[];
}

export type EnemyRank = "normal" | "elite" | "boss";

/**
 * 敌人预制体上的数值（不在 gamedata 里）：Enemy._delayToBorn / _onlyDelayToBornOnTileStart，
 * MoveController._steeringFactor / _maxSteeringForce。
 * enemy-prefabs.json 是 torappu 从 battle/enm_pfb_*.ab 解出来的快照（客户端 2.7.81、资源 26-10-14），
 * 只存和缺省值不同的预制体：[delayToBorn, onlyDelayToBornOnTileStart, steeringFactor, maxSteeringForce]。
 * 之后的新敌人不在表里就按缺省值算（九成以上的预制体就是缺省值）
 */
export interface EnemyPrefab {
  /** 出生动画的时长：调度时出兵提前这么多秒（Scheduler._CreateEnemyItem） */
  delayToBorn: number;
  /** 站在侵入点 / 空袭侵入点上出生时不提前（Enemy.get_delayToBorn 0xA7C370） */
  noDelayOnStartTile: boolean;
  steeringFactor: number;
  maxSteeringForce: number;
}

const DEFAULT_PREFAB: EnemyPrefab = {
  delayToBorn: 0,
  noDelayOnStartTile: false,
  steeringFactor: 8,
  maxSteeringForce: 10,
};
const PREFABS: Record<string, number[]> = ENEMY_PREFABS;

export function prefabOf(prefabKey: string): EnemyPrefab {
  const p = PREFABS[prefabKey];
  if (!p) return DEFAULT_PREFAB;
  return {
    delayToBorn: p[0],
    noDelayOnStartTile: p[1] === 1,
    steeringFactor: p[2],
    maxSteeringForce: p[3],
  };
}

export interface EnemyInfo {
  id: string;
  name: string;
  rank: EnemyRank;
  motion: "WALK" | "FLY";
  /** 不计入关卡的敌人总数 */
  notCountInTotal: boolean;
  /** 移动速度（属性值，还没乘关卡的 moveMultiplier） */
  moveSpeed: number;
  prefab: EnemyPrefab;
}

const RANKS = { NORMAL: "normal", ELITE: "elite", BOSS: "boss" } as const;

type Layer = Partial<Omit<DbEnemyData, "attributes">> & {
  attributes?: Partial<DbEnemyData["attributes"]>;
};

export class EnemyIndex {
  private readonly entries: Map<string, DbEntry[]>;
  constructor(db: EnemyDatabase) {
    this.entries = new Map(db.enemies.map((e) => [e.Key, e.Value]));
  }

  /** 关卡里的 enemyDbRefs：按 id + level 取，没定义的字段退回 0 级；overwrittenData 再盖一层 */
  resolve(
    id: string,
    ref?: EnemyDbRef & { overwrittenData?: Layer | null },
  ): EnemyInfo {
    const levels = this.entries.get(ref?.id ?? id) ?? [];
    const layers: (Layer | undefined)[] = [
      levels.find((e) => e.level === 0)?.enemyData,
      levels.find((e) => e.level === (ref?.level ?? 0))?.enemyData,
      ref?.overwrittenData ?? undefined,
    ];
    const last = <T>(get: (layer: Layer) => Undefinable<T> | undefined) => {
      let value: T | undefined;
      for (const layer of layers) {
        const field = layer && get(layer);
        if (field?.m_defined) value = field.m_value;
      }
      return value;
    };
    return {
      id,
      name: last((l) => l.name) ?? id,
      rank: RANKS[last((l) => l.levelType) ?? "NORMAL"],
      motion: last((l) => l.motion) ?? "WALK",
      notCountInTotal: last((l) => l.notCountInTotal) ?? false,
      moveSpeed: last((l) => l.attributes?.moveSpeed) ?? 1,
      // BattleFactory.CreateEnemy 按 prefabKey 取预制体；有 28 个敌人和别的敌人共用一个
      prefab: prefabOf(last((l) => l.prefabKey) ?? id),
    };
  }
}

export const enemyIcon = (id: string) =>
  `${TORAPPU_ENDPOINT}/assets/enemy_icon/${id}.png`;

/** 敌人页：站内按名称建页，同敌人一览 */
export const enemyLink = (name: string) =>
  `/w/${encodeURIComponent(name.replaceAll(" ", "_"))}`;
