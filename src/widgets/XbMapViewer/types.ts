// Type definitions based on FlatBuffer schema from OpenArknightsFBS

export enum BattleFunctionDisableMask {
  NONE = 0,
  CARD_LIST = 1,
  CHARACTER_MENU = 2,
  CHARACTER_INFO = 4,
  SYSTEM_MENU = 8,
  PAUSE_BUTTON = 16,
  SPEED_SWITCHER_BUTTON = 32,
  BATTLE_STATUS = 64,
  COST_PANEL = 128,
  SLOW_MOTION = 256,
  PAUSE_BUTTON_INTERACT = 512,
  SYSTEM_MENU_INTERACT = 1024,
  SPEED_SWITCHER_BUTTON_INTERACT = 2048,
  UNIT_HUD_SKILL_CAST_MASK = 4096,
  WITHDRAWABLE_PANEL = 8192,
  COST_PANEL_KEEP_CHARACTERLIMIT = 16_384,
  CHARACTER_LIMIT = 32_768,
  AUTOCHESS_SELL_OR_DESTORY = 65_536,
  CHARACTER_MENU_PANEL = 131_072,
  ALL = 262_143,
}

export interface BlackboardDataPair {
  key: string;
  value: number;
  valueStr: string | null;
}

export interface LevelDataOptions {
  characterLimit: number;
  maxLifePoint: number;
  initialCost: number;
  maxCost: number;
  costIncreaseTime: number;
  moveMultiplier: number;
  steeringEnabled: boolean;
  isTrainingLevel: boolean;
  isHardTrainingLevel: boolean;
  isPredefinedCardsSelectable: boolean;
  displayRestTime: boolean;
  maxPlayTime: number;
  functionDisableMask: BattleFunctionDisableMask;
  configBlackBoard: BlackboardDataPair[];
}

export interface MapDataInternal {
  row_size: number;
  column_size: number;
  matrix_data: number[];
}

export enum TileDataHeightType {
  LOWLAND = 0,
  HIGHLAND = 1,
  E_NUM = 2,
}

export enum BuildableType {
  NONE = 0,
  MELEE = 1,
  RANGED = 2,
  ALL = 3,
}

// BuildableType can be represented as enum value or string in practice
export type BuildableTypeValue =
  | BuildableType
  | "NONE"
  | "MELEE"
  | "RANGED"
  | "ALL";

export enum MotionMask {
  NONE = 0,
  WALK_ONLY = 1,
  FLY_ONLY = 2,
  ALL = 3,
}

export enum PlayerSideMask {
  ALL = 0,
  SIDE_A = 2,
  SIDE_B = 4,
  NONE = 255,
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export enum Direction {
  UP = 0,
  RIGHT = 1,
  DOWN = 2,
  LEFT = 3,
  E_NUM = 4,
}

// INVALID is an alias for E_NUM
export const Direction_INVALID = Direction.E_NUM;

export interface MapEffectData {
  key: string;
  offset: Vector3;
  direction: Direction;
}

export interface TileData {
  tileKey: string;
  heightType: TileDataHeightType;
  buildableType: BuildableTypeValue;
  passableMask: MotionMask;
  playerSideMask: PlayerSideMask;
  blackboard: BlackboardDataPair[];
  effects: MapEffectData[];
}

export interface GridPosition {
  row: number;
  col: number;
}

export interface MapDataEdge {
  pos: GridPosition;
  direction: Direction;
  blockMask: MotionMask;
}

export interface MapData {
  // In practice, map is converted to a 2D array for easier access
  map: number[][];
  tiles: TileData[];
  blockEdges: MapDataEdge[];
  tags: string[];
  effects: MapEffectData[];
  layerRects: string[];
  width?: number;
}

export interface CharacterDataUniqueEquipPair {
  key: string;
  level: number;
}

export interface CharacterDataMasterInfo {
  masterId: string;
  level: number;
}

export enum EvolvePhase {
  PHASE_0 = 0,
  PHASE_1 = 1,
  PHASE_2 = 2,
  PHASE_3 = 3,
  E_NUM = 4,
}

export interface CharacterInstMetadata {
  characterKey: string;
  level: number;
  phase: EvolvePhase;
  favorPoint: number;
  potentialRank: number;
}

export interface PredefinedCharacter {
  position: GridPosition;
  direction: Direction;
  hidden: boolean;
  alias: string;
  uniEquipIds: CharacterDataUniqueEquipPair[];
  showSpIllust: boolean;
  masterInfos: CharacterDataMasterInfo[];
  inst: CharacterInstMetadata;
  skillIndex: number;
  mainSkillLvl: number;
  skinId: string;
  tmplId: string;
  overrideSkillBlackboard: BlackboardDataPair[];
}

export interface PredefinedCard {
  hidden: boolean;
  alias: string;
  uniEquipIds: CharacterDataUniqueEquipPair[];
  showSpIllust: boolean;
  masterInfos: CharacterDataMasterInfo[];
  inst: CharacterInstMetadata;
  skillIndex: number;
  mainSkillLvl: number;
  skinId: string;
  tmplId: string;
  overrideSkillBlackboard: BlackboardDataPair[];
}

export interface PredefinedTokenCard {
  initialCnt: number;
  hidden: boolean;
  alias: string;
  uniEquipIds: CharacterDataUniqueEquipPair[];
  showSpIllust: boolean;
  masterInfos: CharacterDataMasterInfo[];
  inst: CharacterInstMetadata;
  skillIndex: number;
  mainSkillLvl: number;
  skinId: string;
  tmplId: string;
  overrideSkillBlackboard: BlackboardDataPair[];
}

export interface PredefinedData {
  characterInsts: PredefinedCharacter[];
  tokenInsts: PredefinedCharacter[];
  characterCards: PredefinedCard[];
  tokenCards: PredefinedTokenCard[];
}

export enum LevelDataDifficulty {
  NONE = 0,
  NORMAL = 1,
  FOUR_STAR = 2,
  EASY = 4,
  SIX_STAR = 8,
  ALL = 15,
}

export enum ProfessionCategory {
  NONE = 0,
  WARRIOR = 1,
  SNIPER = 2,
  TANK = 4,
  MEDIC = 8,
  SUPPORT = 16,
  CASTER = 32,
  SPECIAL = 64,
  TOKEN = 128,
  TRAP = 256,
  PIONEER = 512,
}

export interface LegacyInLevelRuneData {
  difficultyMask: LevelDataDifficulty;
  key: string;
  professionMask: ProfessionCategory;
  buildableMask: BuildableType;
  blackboard: BlackboardDataPair[];
}

export interface LevelDataGlobalBuffData {
  prefabKey: string;
  blackboard: BlackboardDataPair[];
  overrideCameraEffect: string;
  passProfessionMaskFlag: boolean;
  professionMask: ProfessionCategory;
  playerSideMask: PlayerSideMask;
}

export enum MotionMode {
  WALK = 0,
  FLY = 1,
  E_NUM = 2,
}

export interface Vector2 {
  x: number;
  y: number;
}

export enum CheckpointType {
  MOVE = 0,
  WAIT_FOR_SECONDS = 1,
  WAIT_FOR_PLAY_TIME = 2,
  WAIT_CURRENT_FRAGMENT_TIME = 3,
  WAIT_CURRENT_WAVE_TIME = 4,
  DISAPPEAR = 5,
  APPEAR_AT_POS = 6,
  ALERT = 7,
  PATROL_MOVE = 8,
  WAIT_BOSSRUSH_WAVE = 9,
  MAP_OFFSET_MOVE = 10,
  INVALID = 11,
}

export interface RouteDataCheckpointData {
  type: CheckpointType;
  time: number;
  position: GridPosition;
  reachOffset: Vector2;
  randomizeReachOffset: boolean;
  reachDistance: number;
}

export interface RouteData {
  motionMode: MotionMode;
  startPosition: GridPosition;
  endPosition: GridPosition;
  spawnRandomRange: Vector2;
  spawnOffset: Vector2;
  checkpoints: RouteDataCheckpointData[];
  allowDiagonalMove: boolean;
  visitEveryTileCenter: boolean;
  visitEveryNodeCenter: boolean;
  visitEveryCheckPoint: boolean;
}

export enum SourceApplyWay {
  NONE = 0,
  MELEE = 1,
  RANGED = 2,
  ALL = 3,
}

export enum EnemyLevelType {
  NORMAL = 0,
  ELITE = 1,
  BOSS = 2,
  E_NUM = 3,
}

export interface LevelDataEnemyDataESkillData {
  prefabKey: string;
  priority: number;
  cooldown: number;
  initCooldown: number;
  spCost: number;
  blackboard: BlackboardDataPair[];
}

export enum SpType {
  NONE = 0,
  INCREASE_WITH_TIME = 1,
  INCREASE_WHEN_ATTACK = 2,
  INCREASE_WHEN_TAKEN_DAMAGE = 4,
  ATTACK_OR_DAMAGE = 6,
  ALL = 7,
}

export interface LevelDataEnemyDataESpData {
  spType: SpType;
  maxSp: number;
  initSp: number;
  increment: number;
}

export interface AttributesData {
  maxHp: number;
  atk: number;
  def: number;
  magicResistance: number;
  cost: number;
  blockCnt: number;
  moveSpeed: number;
  attackSpeed: number;
  baseAttackTime: number;
  respawnTime: number;
  hpRecoveryPerSec: number;
  spRecoveryPerSec: number;
  maxDeployCount: number;
  maxDeckStackCnt: number;
  tauntLevel: number;
  massLevel: number;
  baseForceLevel: number;
  stunImmune: boolean;
  silenceImmune: boolean;
  sleepImmune: boolean;
  frozenImmune: boolean;
  levitateImmune: boolean;
  disarmedCombatImmune: boolean;
  fearedImmune: boolean;
  palsyImmune: boolean;
  attractImmune: boolean;
}

export interface LevelDataEnemyData {
  name: string;
  description: string;
  key: string;
  attributes: AttributesData;
  applyWay: SourceApplyWay;
  motion: MotionMode;
  enemyTags: string[];
  notCountInTotal: boolean;
  alias: string;
  lifePointReduce: number;
  rangeRadius: number;
  numOfExtraDrops: number;
  viewRadius: number;
  levelType: EnemyLevelType;
  talentBlackboard: BlackboardDataPair[];
  skills: LevelDataEnemyDataESkillData[];
  spData: LevelDataEnemyDataESpData;
}

export interface UndefinableString {
  m_defined: boolean;
  m_value: string;
}

export interface UndefinableInt32 {
  m_defined: boolean;
  m_value: number;
}

export interface UndefinableSingle {
  m_defined: boolean;
  m_value: number;
}

export interface UndefinableBoolean {
  m_defined: boolean;
  m_value: boolean;
}

export interface EnemyDatabaseAttributesData {
  maxHp: UndefinableInt32;
  atk: UndefinableInt32;
  def: UndefinableInt32;
  magicResistance: UndefinableSingle;
  cost: UndefinableInt32;
  blockCnt: UndefinableInt32;
  moveSpeed: UndefinableSingle;
  attackSpeed: UndefinableSingle;
  baseAttackTime: UndefinableSingle;
  respawnTime: UndefinableInt32;
  hpRecoveryPerSec: UndefinableSingle;
  spRecoveryPerSec: UndefinableSingle;
  maxDeployCount: UndefinableInt32;
  massLevel: UndefinableInt32;
  baseForceLevel: UndefinableInt32;
  tauntLevel: UndefinableInt32;
  epDamageResistance: UndefinableSingle;
  epResistance: UndefinableSingle;
  damageHitratePhysical: UndefinableSingle;
  damageHitrateMagical: UndefinableSingle;
  epBreakRecoverSpeed: UndefinableSingle;
  stunImmune: UndefinableBoolean;
  silenceImmune: UndefinableBoolean;
  sleepImmune: UndefinableBoolean;
  frozenImmune: UndefinableBoolean;
  levitateImmune: UndefinableBoolean;
  disarmedCombatImmune: UndefinableBoolean;
  fearedImmune: UndefinableBoolean;
  palsyImmune: UndefinableBoolean;
  attractImmune: UndefinableBoolean;
}

export interface UndefinableSourceApplyWay {
  m_defined: boolean;
  m_value: SourceApplyWay;
}

export interface UndefinableMotionMode {
  m_defined: boolean;
  m_value: MotionMode;
}

export interface UndefinableStringArray {
  m_defined: boolean;
  m_value: string[];
}

export interface UndefinableEnemyLevelType {
  m_defined: boolean;
  m_value: EnemyLevelType;
}

export interface EnemyDatabaseEnemyData {
  name: UndefinableString;
  description: UndefinableString;
  prefabKey: UndefinableString;
  attributes: EnemyDatabaseAttributesData;
  applyWay: UndefinableSourceApplyWay;
  motion: UndefinableMotionMode;
  enemyTags: UndefinableStringArray;
  lifePointReduce: UndefinableInt32;
  levelType: UndefinableEnemyLevelType;
  rangeRadius: UndefinableSingle;
  numOfExtraDrops: UndefinableInt32;
  viewRadius: UndefinableSingle;
  notCountInTotal: UndefinableBoolean;
  talentBlackboard: BlackboardDataPair[];
  skills: LevelDataEnemyDataESkillData[];
  spData: LevelDataEnemyDataESpData;
}

export interface LevelDataEnemyDataDbReference {
  useDb: boolean;
  id: string;
  level: number;
  overwrittenData: EnemyDatabaseEnemyData;
}

export enum LevelDataWaveDataFragmentDataActionDataActionType {
  SPAWN = 0,
  PREVIEW_CURSOR = 1,
  STORY = 2,
  TUTORIAL = 3,
  PLAY_BGM = 4,
  DISPLAY_ENEMY_INFO = 5,
  ACTIVATE_PREDEFINED = 6,
  PLAY_OPERA = 7,
  TRIGGER_PREDEFINED = 8,
  BATTLE_EVENTS = 9,
  WITHDRAW_PREDEFINED = 10,
  DIALOG = 11,
  SHOW_ALL_HIDDEN_CARDS = 12,
  EMPTY = 13,
  E_NUM = 14,
}

export enum LevelDataWaveDataFragmentDataActionDataRandomType {
  ALWAYS = 0,
  PER_DAY = 1,
  NEVER = 2,
  PER_SETTLE_DAY = 3,
  PER_SEASON = 4,
}

export enum LevelDataWaveDataFragmentDataActionDataRefreshType {
  ALWAYS = 0,
  PER_DAY = 1,
  NEVER = 2,
  PER_SETTLE_DAY = 3,
  PER_SEASON = 4,
}

export interface LevelDataWaveDataFragmentDataActionData {
  actionType: LevelDataWaveDataFragmentDataActionDataActionType;
  managedByScheduler: boolean;
  key: string;
  count: number;
  preDelay: number;
  interval: number;
  routeIndex: number;
  blockFragment: boolean;
  autoPreviewRoute: boolean;
  autoDisplayEnemyInfo: boolean;
  isUnharmfulAndAlwaysCountAsKilled: boolean;
  hiddenGroup: string;
  randomSpawnGroupKey: string;
  randomSpawnGroupPackKey: string;
  randomType: LevelDataWaveDataFragmentDataActionDataRandomType;
  refreshType: LevelDataWaveDataFragmentDataActionDataRefreshType;
  weight: number;
  dontBlockWave: boolean;
  forceBlockWaveInBranch: boolean;
}

export interface LevelDataWaveDataFragmentData {
  preDelay: number;
  actions: LevelDataWaveDataFragmentDataActionData[];
}

export interface LevelDataWaveData {
  preDelay: number;
  postDelay: number;
  maxTimeWaitingForNextWave: number;
  fragments: LevelDataWaveDataFragmentData[];
  advancedWaveTag: string;
}

export interface LevelDataBranchDataPhaseData {
  preDelay: number;
  actions: LevelDataWaveDataFragmentDataActionData[];
}

export interface LevelDataBranchData {
  phases: LevelDataBranchDataPhaseData[];
}

export interface LevelData {
  options: LevelDataOptions;
  levelId: string;
  mapId: string;
  bgmEvent: string;
  environmentSe: string;
  mapData: MapData;
  tilesDisallowToLocate: GridPosition[];
  runes: LegacyInLevelRuneData[];
  optionalRunes: Record<string, LegacyInLevelRuneData[]>;
  globalBuffs: LevelDataGlobalBuffData[];
  routes: RouteData[];
  extraRoutes: RouteData[];
  enemies: LevelDataEnemyData[];
  enemyDbRefs: LevelDataEnemyDataDbReference[];
  waves: LevelDataWaveData[];
  branches: Record<string, LevelDataBranchData>;
  predefines: PredefinedData;
  hardPredefines: PredefinedData;
  excludeCharIdList: string[];
  randomSeed: number;
  operaConfig: string;
  cameraPlugin: string;
}
