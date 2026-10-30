/**
 * 关卡文件（torappu gamedata/latest/levels/**.json，即游戏的 Torappu.LevelData）里用得到的字段。
 * 枚举在 JSON 里都是字符串（"WALK" / "HIGHLAND" …），声明对着 2.7.81 dump.cs 的同名类型。
 */

/** GridPosition：row 从下往上数（mapData.map 的第 0 行是最上面一行），col 从左往右 */
export interface GridPos {
  row: number;
  col: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type MotionMode = "WALK" | "FLY" | "E_NUM";
export type MotionMask = "NONE" | "WALK_ONLY" | "FLY_ONLY" | "ALL";
export type Direction = "UP" | "RIGHT" | "DOWN" | "LEFT";

export interface TileData {
  tileKey: string;
  heightType: "LOWLAND" | "HIGHLAND";
  buildableType: "NONE" | "MELEE" | "RANGED" | "ALL";
  passableMask: MotionMask;
  playerSideMask?: string;
  blackboard?: BlackboardPair[] | null;
}

/** MapData.Edge：pos 那格朝 direction 的那条边，对 blockMask 里的移动方式不通（反方向同样不通） */
export interface BlockEdge {
  pos: GridPos;
  direction: Direction;
  blockMask: MotionMask;
}

export interface MapData {
  map: number[][];
  tiles: TileData[];
  blockEdges?: BlockEdge[] | null;
}

export type CheckpointType =
  | "MOVE"
  | "WAIT_FOR_SECONDS"
  | "WAIT_FOR_PLAY_TIME"
  | "WAIT_CURRENT_FRAGMENT_TIME"
  | "WAIT_CURRENT_WAVE_TIME"
  | "DISAPPEAR"
  | "APPEAR_AT_POS"
  | "ALERT"
  | "PATROL_MOVE"
  | "WAIT_BOSSRUSH_WAVE"
  | "MAP_OFFSET_MOVE";

export interface CheckpointData {
  type: CheckpointType;
  time: number;
  position: GridPos;
  reachOffset: Vec2;
  randomizeReachOffset?: boolean;
  reachDistance?: number;
}

export interface RouteData {
  motionMode: MotionMode;
  startPosition: GridPos;
  endPosition: GridPos;
  spawnRandomRange?: Vec2;
  spawnOffset?: Vec2;
  checkpoints: CheckpointData[] | null;
  allowDiagonalMove: boolean;
  visitEveryTileCenter?: boolean;
  visitEveryNodeCenter?: boolean;
  visitEveryCheckPoint?: boolean;
}

export interface BlackboardPair {
  key: string;
  value: number;
  valueStr: string | null;
}

export type Difficulty = "NORMAL" | "FOUR_STAR" | "EASY" | "SIX_STAR";

export interface RuneData {
  difficultyMask: Difficulty | "ALL" | "NONE";
  key: string;
  blackboard: BlackboardPair[] | null;
}

export type ActionType =
  | "SPAWN"
  | "PREVIEW_CURSOR"
  | "STORY"
  | "TUTORIAL"
  | "PLAY_BGM"
  | "DISPLAY_ENEMY_INFO"
  | "ACTIVATE_PREDEFINED"
  | "PLAY_OPERA"
  | "TRIGGER_PREDEFINED"
  | "BATTLE_EVENTS"
  | "WITHDRAW_PREDEFINED"
  | "DIALOG"
  | "SHOW_ALL_HIDDEN_CARDS"
  | "EMPTY";

export interface ActionData {
  actionType: ActionType;
  managedByScheduler: boolean;
  key: string;
  count: number;
  preDelay: number;
  interval: number;
  routeIndex: number;
  useExtraRoute?: boolean;
  blockFragment: boolean;
  autoPreviewRoute?: boolean;
  isUnharmfulAndAlwaysCountAsKilled: boolean;
  hiddenGroup: string | null;
  randomSpawnGroupKey: string | null;
  randomSpawnGroupPackKey: string | null;
  weight: number;
  dontBlockWave: boolean;
  forceBlockWaveInBranch?: boolean;
  notCountInTotal?: boolean;
}

export interface FragmentData {
  preDelay: number;
  actions: ActionData[];
}

export interface WaveData {
  preDelay: number;
  postDelay: number;
  maxTimeWaitingForNextWave: number;
  fragments: FragmentData[];
  advancedWaveTag?: string | null;
}

export interface BranchData {
  phases: FragmentData[];
}

export interface PredefinedInst {
  position: GridPos;
  direction: Direction;
  hidden: boolean;
  alias: string | null;
  inst: { characterKey: string; level: number; phase: string };
}

export interface PredefinedData {
  characterInsts: PredefinedInst[] | null;
  tokenInsts: PredefinedInst[] | null;
}

export interface EnemyDbRef {
  useDb: boolean;
  id: string;
  level: number;
}

export interface LevelOptions {
  characterLimit: number;
  maxLifePoint: number;
  initialCost: number;
  maxCost: number;
  costIncreaseTime: number;
  /** 敌人移速的倍率（BattleOptions.MOVE_MULTIPLIER） */
  moveMultiplier: number;
  /** 转向是否平滑（BattleOptions.STEERING_ENABLED；现有关卡都开着） */
  steeringEnabled?: boolean;
}

export interface LevelData {
  options: LevelOptions;
  mapData: MapData;
  routes: (RouteData | null)[] | null;
  /** 分支（branches）里的出兵走的路线 */
  extraRoutes?: (RouteData | null)[] | null;
  enemyDbRefs: EnemyDbRef[] | null;
  waves: WaveData[] | null;
  branches: Record<string, BranchData> | null;
  predefines: PredefinedData | null;
  runes: RuneData[] | null;
}

/** 地图的行列与格子：row 从下往上数，所以 mapData.map 要倒过来取 */
export class Board {
  readonly width: number;
  readonly height: number;
  readonly blockEdges: BlockEdge[];
  constructor(private readonly data: MapData) {
    this.height = data.map.length;
    this.width = data.map[0]?.length ?? 0;
    this.blockEdges = data.blockEdges ?? [];
  }

  /** Map.CheckGridValid */
  contains({ row, col }: GridPos) {
    return row >= 0 && row < this.height && col >= 0 && col < this.width;
  }

  tile(row: number, col: number): TileData | undefined {
    const index = this.data.map[this.height - 1 - row]?.[col];
    return index === undefined ? undefined : this.data.tiles[index];
  }
}

export const samePos = (a: GridPos, b: GridPos) =>
  a.row === b.row && a.col === b.col;

/** 地图标注：行从下往上 A、B、C…，列从左往右 1、2、3…（同 map.ark-nights.com 的写法） */
export function gridLabel({ row, col }: GridPos) {
  let letters = "";
  for (let n = row; n >= 0; n = Math.floor(n / 26) - 1)
    letters = String.fromCharCode(65 + (n % 26)) + letters;
  return `${letters}${col + 1}`;
}
