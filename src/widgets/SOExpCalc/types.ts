export const SpecialOperatorTargetType = {
  NONE: 0,
  ROGUE: 1,
} as const;
export type SpecialOperatorTargetType =
  (typeof SpecialOperatorTargetType)[keyof typeof SpecialOperatorTargetType];

export interface SpecialOperatorBasicData {
  soCharId: string;
  sortId: number;
  targetType: SpecialOperatorTargetType;
  targetId: string;
  targetTopicName: string;
  bgId: string;
  bgEffectId: string;
  charEffectId: string;
  typeIconId: string;
}

export interface SpecialOperatorDetailConstData {
  nextRoundBuffToast: string;
}

export const SpecialOperatorDetailNodeType = {
  NONE: 0,
  EVOLVE: 1,
  SKILL: 2,
  TALENT: 3,
  MASTER: 4,
  UNIEQUIP: 5,
} as const;
export type SpecialOperatorDetailNodeType =
  (typeof SpecialOperatorDetailNodeType)[keyof typeof SpecialOperatorDetailNodeType];

export interface SpecialOperatorDetailTabData {
  soTabId: string;
  soTabName: string;
  soTabSortId: number;
  nodeType: SpecialOperatorDetailNodeType;
}

export const EvolvePhase = {
  PHASE_0: 0,
  PHASE_1: 1,
  PHASE_2: 2,
  PHASE_3: 3,
  E_NUM: 4,
} as const;
export type EvolvePhase = (typeof EvolvePhase)[keyof typeof EvolvePhase];

export const SpecialOperatorConditionViewType = {
  TASK: 0,
  EVOLVEPHASE: 1,
} as const;
export type SpecialOperatorConditionViewType =
  (typeof SpecialOperatorConditionViewType)[keyof typeof SpecialOperatorConditionViewType];

export interface SpecialOperatorDetailNodeUnlockData {
  nodeId: string;
  nodeType: SpecialOperatorDetailNodeType;
  isInGameMechanics: boolean;
  unlockEvolvePhase: EvolvePhase;
  unlockLevel: number;
  unlockTaskId: string;
  frontNodeId: string;
  ifAutoUnlock: boolean;
  conditionViewType: SpecialOperatorConditionViewType;
  topoOrder: number;
}

export interface SpecialOperatorDetailEvolveNodeData {
  nodeId: string;
  toEvolvePhase: EvolvePhase;
}

export interface SpecialOperatorDetailSkillNodeData {
  nodeId: string;
  skillKey: string;
  skillLevel: number;
  skillSpLevel: number;
}

export interface SpecialOperatorDetailTalentNodeData {
  nodeId: string;
  talentIndex: number;
  updateCount: number;
}

export interface SpecialOperatorDetailMasterNodeData {
  nodeId: string;
  masterId: string;
  level: number;
}

export interface SpecialOperatorDetailUniEquipNodeData {
  nodeId: string;
  uniEquipId: string;
  equipLevel: number;
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface SpecialOperatorPointPosData {
  pos: Vector2;
}

export interface SpecialOperatorNodePointData {
  nodeId: string;
}

export interface SpecialOperatorElitePointData {
  evolvePhase: EvolvePhase;
}

export interface SpecialOperatorLevelPointData {
  evolvePhase: EvolvePhase;
  level: number;
}

export interface SpecialOperatorLinePosData {
  startPos: Vector2;
  endPos: Vector2;
}

export interface SpecialOperatorLineRelationData {
  startPointList: string[];
  endPointList: string[];
}

export interface SpecialOperatorDiagramData {
  width: number;
  height: number;
  pointPosDataMap: Record<string, SpecialOperatorPointPosData>;
  nodePointDataMap: Record<string, SpecialOperatorNodePointData>;
  elitePointDataMap: Record<string, SpecialOperatorElitePointData>;
  levelPointDataMap: Record<string, SpecialOperatorLevelPointData>;
  linePosDataMap: Record<string, SpecialOperatorLinePosData>;
  lineRelationDataMap: Record<string, SpecialOperatorLineRelationData>;
}

export interface SpecialOperatorDetailData {
  specialOperatorExpMap: number[][];
  detailConstData: SpecialOperatorDetailConstData;
  tabData: Record<string, SpecialOperatorDetailTabData>;
  nodeUnlockData: Record<string, SpecialOperatorDetailNodeUnlockData>;
  evolveNodeData: Record<string, SpecialOperatorDetailEvolveNodeData>;
  skillNodeData: Record<string, SpecialOperatorDetailSkillNodeData>;
  talentNodeData: Record<string, SpecialOperatorDetailTalentNodeData>;
  masterNodeData: Record<string, SpecialOperatorDetailMasterNodeData>;
  uniEquipNodeData: Record<string, SpecialOperatorDetailUniEquipNodeData>;
  nodeDiagramMap: Record<string, SpecialOperatorDiagramData>;
}

export interface SpecialOperatorModeData {
  type: SpecialOperatorTargetType;
  typeName: string;
}

export const MissionType = {
  UNKNOWN: 0,
  MAIN: 1,
  DAILY: 2,
  WEEKLY: 3,
  GUIDE: 4,
  SUB: 5,
  ACTIVITY: 6,
  OPENSERVER: 7,
  TOWERSEASON: 8,
  RETRO: 9,
  SPECIAL_OPERATOR: 10,
  SPECIAL_OPERATOR_WEEKLY: 11,
} as const;
export type MissionType = (typeof MissionType)[keyof typeof MissionType];

export const MissionItemBgType = {
  COMMON: 0,
  Equipment: 1,
  Char: 2,
} as const;
export type MissionItemBgType =
  (typeof MissionItemBgType)[keyof typeof MissionItemBgType];

export const ItemType = {
  NONE: 0,
  CHAR: 1,
  CARD_EXP: 2,
  MATERIAL: 3,
  GOLD: 4,
  EXP_PLAYER: 5,
  TKT_TRY: 6,
  TKT_RECRUIT: 7,
  TKT_INST_FIN: 8,
  TKT_GACHA: 9,
  ACTIVITY_COIN: 10,
  DIAMOND: 11,
  DIAMOND_SHD: 12,
  HGG_SHD: 13,
  LGG_SHD: 14,
  FURN: 15,
  AP_GAMEPLAY: 16,
  AP_BASE: 17,
  SOCIAL_PT: 18,
  CHAR_SKIN: 19,
  TKT_GACHA_10: 20,
  TKT_GACHA_PRSV: 21,
  AP_ITEM: 22,
  AP_SUPPLY: 23,
  RENAMING_CARD: 24,
  RENAMING_CARD_2: 25,
  ET_STAGE: 26,
  ACTIVITY_ITEM: 27,
  VOUCHER_PICK: 28,
  VOUCHER_CGACHA: 29,
  VOUCHER_MGACHA: 30,
  CRS_SHOP_COIN: 31,
  CRS_RUNE_COIN: 32,
  LMTGS_COIN: 33,
  EPGS_COIN: 34,
  LIMITED_TKT_GACHA_10: 35,
  LIMITED_FREE_GACHA: 36,
  REP_COIN: 37,
  ROGUELIKE: 38,
  LINKAGE_TKT_GACHA_10: 39,
  VOUCHER_ELITE_II_4: 40,
  VOUCHER_ELITE_II_5: 41,
  VOUCHER_ELITE_II_6: 42,
  VOUCHER_SKIN: 43,
  RETRO_COIN: 44,
  PLAYER_AVATAR: 45,
  UNI_COLLECTION: 46,
  VOUCHER_FULL_POTENTIAL: 47,
  RL_COIN: 48,
  RETURN_CREDIT: 49,
  MEDAL: 50,
  CHARM: 51,
  HOME_BACKGROUND: 52,
  EXTERMINATION_AGENT: 53,
  OPTIONAL_VOUCHER_PICK: 54,
  ACT_CART_COMPONENT: 55,
  VOUCHER_LEVELMAX_6: 56,
  VOUCHER_LEVELMAX_5: 57,
  VOUCHER_LEVELMAX_4: 58,
  VOUCHER_SKILL_SPECIALLEVELMAX_6: 59,
  VOUCHER_SKILL_SPECIALLEVELMAX_5: 60,
  VOUCHER_SKILL_SPECIALLEVELMAX_4: 61,
  ACTIVITY_POTENTIAL: 62,
  ITEM_PACK: 63,
  SANDBOX: 64,
  FAVOR_ADD_ITEM: 65,
  CLASSIC_SHD: 66,
  CLASSIC_TKT_GACHA: 67,
  CLASSIC_TKT_GACHA_10: 68,
  LIMITED_BUFF: 69,
  CLASSIC_FES_PICK_TIER_5: 70,
  CLASSIC_FES_PICK_TIER_6: 71,
  RETURN_PROGRESS: 72,
  NEW_PROGRESS: 73,
  MCARD_VOUCHER: 74,
  MATERIAL_ISSUE_VOUCHER: 75,
  CRS_SHOP_COIN_V2: 76,
  HOME_THEME: 77,
  SANDBOX_PERM: 78,
  SANDBOX_TOKEN: 79,
  TEMPLATE_TRAP: 80,
  NAME_CARD_SKIN: 81,
  EMOTICON_SET: 82,
  EXCLUSIVE_TKT_GACHA: 83,
  EXCLUSIVE_TKT_GACHA_10: 84,
  SO_CHAR_EXP: 85,
} as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export interface MissionDisplayRewards {
  type: ItemType;
  id: string;
  count: number;
}

export interface MissionData {
  id: string;
  sortId: number;
  description: string;
  type: MissionType;
  itemBgType: MissionItemBgType;
  preMissionIds: string[];
  template: string;
  templateType: string;
  param: string[];
  unlockCondition: string;
  unlockParam: string[];
  missionGroup: string;
  toPage: string;
  periodicalPoint: number;
  rewards: MissionDisplayRewards[];
  backImagePath: string;
  foldId: string;
  haveSubMissionToUnlock: boolean;
  countEndTs: number;
}

export interface MissionGroup {
  id: string;
  title: string;
  type: MissionType;
  preMissionGroup: string;
  period: number[];
  rewards: MissionDisplayRewards[];
  missionIds: string[];
  startTs: number;
  endTs: number;
}

export interface SpecialOperatorConstData {
  weeklyTaskBoardUnlock: string;
  taskPinOnToast: string;
  noFrontNodeToast: string;
  noFrontTaskToast: string;
  skillGotoToast: string;
  evolveTabExpNotice: string;
  pinnedSpecialOperator: string;
}

export interface SpecialOperatorTable {
  operatorBasicData: Record<string, SpecialOperatorBasicData>;
  operatorDetailData: Record<string, SpecialOperatorDetailData>;
  modeData: SpecialOperatorModeData[];
  nodeUnlockMissionData: Record<string, MissionData>;
  nodeUnlockMissionGroup: Record<string, MissionGroup>;
  constData: SpecialOperatorConstData;
}
