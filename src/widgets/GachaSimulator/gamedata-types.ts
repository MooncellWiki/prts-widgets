export enum GachaRuleType {
  NORMAL = "NORMAL",
  LIMITED = "LIMITED",
  LINKAGE = "LINKAGE",
  ATTAIN = "ATTAIN",
  CLASSIC = "CLASSIC",
  SINGLE = "SINGLE",
  FESCLASSIC = "FESCLASSIC",
  CLASSIC_ATTAIN = "CLASSIC_ATTAIN",
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
  dynMeta: Record<string, any>;
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
