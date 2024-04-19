import { RarityRank } from "./types";

/**
 * https://prts.wiki/id/52144 寻访规则
 */
export enum GachaRuleType {
  /**
   * 通用规则：
   * 如果连续50次没有获得6★干员，则下一次获得6★干员的概率将从原本的2%提升至4%，如果该次还没有寻访到6★干员，则下一次寻访获得6★的概率由4%提升到6%。
   * 依此类推，每次提高2%获得6★干员的概率，直至达到100%时必定获得6★干员。
   * 任何时候在【标准寻访】中获得一位6★干员，则下一次在【标准寻访】中获得6★干员的概率将恢复到2%。
   * 每开启一个新的寻访池，在其中的前10次寻访内必定获得一名5★或以上的干员，每个寻访池限一次。
   */

  /**
   * 常驻标准寻访
   */
  NORMAL = "NORMAL",
  /**
   * 限时标准寻访 规则同常驻标准寻访
   */
  SINGLE = "SINGLE",
  /**
   * 联动寻访
   * 前120次寻访必定能够获得联动6★干员，仅限一次。
   * 如果该寻访池拥有2名联动5★干员，则在首次获得其中1名联动5★干员后，下次获得5★干员时必定为另一名联动5★干员，仅限一次。
   */
  LINKAGE = "LINKAGE",

  /**
   * 常驻中坚寻访
   */
  CLASSIC = "CLASSIC",
  /**
   * 中坚甄选
   */
  FESCLASSIC = "FESCLASSIC",

  /**
   * 限定
   */
  LIMITED = "LIMITED",

  /**
   * 跨年欢庆寻访
   * 带仓检的标准寻访
   */
  ATTAIN = "ATTAIN",
  /**
   * 跨年欢庆（中坚）寻访
   * 带仓检的中坚寻访
   */
  CLASSIC_ATTAIN = "CLASSIC_ATTAIN",

  /**
   * 新人特惠寻访
   * 只能抽取21次 必定至少获得1名6★干员，次数内必定获得至少1名5★以上干员
   */
  NEWBEE = "NEWBEE",
}

export interface GachaPoolClientData {
  gachaPoolId: string;
  gachaIndex: number;
  openTime: number;
  endTime: number;
  gachaPoolName: string;
  gachaPoolSummary: string;
  gachaPoolDetail: string;
  guarantee5Avail: number;
  guarantee5Count: number;
  LMTGSID: string;
  CDPrimColor: string;
  CDSecColor: string;
  gachaRuleType: GachaRuleType;
  dynMeta?: {
    rarityPickCharDict: Record<keyof typeof RarityRank, string[]>;
  };
  linkageRuleId: string;
  linkageParam: Record<string, any>;
}

export interface NewbeeGachaPoolClientData {
  gachaPoolId: string;
  gachaIndex: number;
  gachaPoolName: string;
  gachaPoolDetail: string;
  gachaPrice: number;
  gachaTimes: number;
  gachaOffset: string;
}

export enum ItemType {
  NONE = 0,
  CHAR = 1,
  CARD_EXP = 2,
  MATERIAL = 3,
  GOLD = 4,
  EXP_PLAYER = 5,
  TKT_TRY = 6,
  TKT_RECRUIT = 7,
  TKT_INST_FIN = 8,
  TKT_GACHA = 9,
  ACTIVITY_COIN = 10,
  DIAMOND = 11,
  DIAMOND_SHD = 12,
  HGG_SHD = 13,
  LGG_SHD = 14,
  FURN = 15,
  AP_GAMEPLAY = 16,
  AP_BASE = 17,
  SOCIAL_PT = 18,
  CHAR_SKIN = 19,
  TKT_GACHA_10 = 20,
  TKT_GACHA_PRSV = 21,
  AP_ITEM = 22,
  AP_SUPPLY = 23,
  RENAMING_CARD = 24,
  RENAMING_CARD_2 = 25,
  ET_STAGE = 26,
  ACTIVITY_ITEM = 27,
  VOUCHER_PICK = 28,
  VOUCHER_CGACHA = 29,
  VOUCHER_MGACHA = 30,
  CRS_SHOP_COIN = 31,
  CRS_RUNE_COIN = 32,
  LMTGS_COIN = 33,
  EPGS_COIN = 34,
  LIMITED_TKT_GACHA_10 = 35,
  LIMITED_FREE_GACHA = 36,
  REP_COIN = 37,
  ROGUELIKE = 38,
  LINKAGE_TKT_GACHA_10 = 39,
  VOUCHER_ELITE_II_5 = 40,
  VOUCHER_ELITE_II_6 = 41,
  VOUCHER_SKIN = 42,
  RETRO_COIN = 43,
  PLAYER_AVATAR = 44,
  UNI_COLLECTION = 45,
  VOUCHER_FULL_POTENTIAL = 46,
  RL_COIN = 47,
  RETURN_CREDIT = 48,
  MEDAL = 49,
  CHARM = 50,
  HOME_BACKGROUND = 51,
  EXTERMINATION_AGENT = 52,
  OPTIONAL_VOUCHER_PICK = 53,
  ACT_CART_COMPONENT = 54,
  VOUCHER_LEVELMAX_6 = 55,
  VOUCHER_LEVELMAX_5 = 56,
  ACTIVITY_POTENTIAL = 57,
  ITEM_PACK = 58,
  SANDBOX = 59,
  FAVOR_ADD_ITEM = 60,
  CLASSIC_SHD = 61,
  CLASSIC_TKT_GACHA = 62,
  CLASSIC_TKT_GACHA_10 = 63,
  LIMITED_BUFF = 64,
  CLASSIC_FES_PICK_TIER_5 = 65,
  CLASSIC_FES_PICK_TIER_6 = 66,
  RETURN_PROGRESS = 67,
  NEW_PROGRESS = 68,
  MCARD_VOUCHER = 69,
  MATERIAL_ISSUE_VOUCHER = 70,
  CRS_SHOP_COIN_V2 = 71,
  HOME_THEME = 72,
  SANDBOX_PERM = 73,
  SANDBOX_TOKEN = 74,
  TEMPLATE_TRAP = 75,
  NAME_CARD_SKIN = 76,
  EXCLUSIVE_TKT_GACHA = 77,
  EXCLUSIVE_TKT_GACHA_10 = 78,
}

export interface ItemBundle {
  id: string;
  count: number;
  type: ItemType;
}

export interface SpecialRecruitCostData {
  timeLength: number;
  recruitPrice: number;
  itemCosts: [ItemBundle];
}

export interface RecruitConstants {
  tagPriceList: Record<number, number>;
  maxRecruitTime: number;
}

export interface SpecialRecruitPool {
  recruitId: string;
  tagName: string;
  tagId: number;
  order: number;
  startDateTime: number;
  endDateTime: number;
  recruitTimeTable: [SpecialRecruitCostData];
  recruitConstants: RecruitConstants;
}

export interface GachaTag {
  tagId: number;
  tagName: string;
  tagGroup: number;
}

export interface RecruitTime {
  timeLength: number;
  recruitPrice: number;
}

export interface RecruitPool {
  recruitTimeTable: [RecruitTime];
  recruitConstants: RecruitConstants;
}

export interface PotentialMaterialConverterConfig {
  items: Record<number, ItemBundle>;
}

export interface RecruitRange {
  rarityStart: number;
  rarityEnd: number;
}

export interface CarouselData {
  poolId: string;
  index: number;
  startTime: number;
  endTime: number;
  spriteId: string;
}

export interface FreeLimitGachaData {
  poolId: string;
  openTime: number;
  endTime: number;
  freeCount: number;
}

export interface LimitTenGachaTkt {
  itemId: string;
  endTime: number;
}

export interface LinkageTenGachaTkt {
  itemId: string;
  endTime: number;
  gachaPoolId: string;
}

export interface NormalGachaTkt {
  itemId: string;
  endTime: number;
  gachaPoolId: string;
  isTen: boolean;
}

export interface FesGachaPoolRelateItem {
  rarityRank5ItemId: string;
  rarityRank6ItemId: string;
}

export interface GachaData {
  gachaPoolClient: [GachaPoolClientData];
  newbeeGachaPoolClient: [NewbeeGachaPoolClientData];
  specialRecruitPool: [SpecialRecruitPool];
  gachaTags: [GachaTag];
  recruitPool: RecruitPool;
  potentialMaterialConverter: PotentialMaterialConverterConfig;
  classicPotentialMaterialConverter: PotentialMaterialConverterConfig;
  recruitRarityTable: [Record<number, RecruitRange>];
  specialTagRarityTable: [Record<number, Array<number>>];
  recruitDetail: string;
  carousel: [CarouselData];
  freeGacha: [FreeLimitGachaData];
  limitTenGachaItem: [LimitTenGachaTkt];
  linkageTenGachaItem: [LinkageTenGachaTkt];
  normalGachaItem: [NormalGachaTkt];
  fesGachaPoolRelateItem: [Record<string, FesGachaPoolRelateItem>];
  dicRecruit6StarHint: [Record<string, string>];
}
