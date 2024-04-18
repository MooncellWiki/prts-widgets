export interface GachaDBServer {
  gachaPoolClient: Array<GachaPoolClientData>;
}

export interface GachaPoolClientData {
  gachaPoolDetail: GachaDetail;
  gachaPoolId: string;
}

export interface GachaDetail {
  detailInfo: GachaDetailData;
}

export enum RarityRank {
  TIER_1,
  TIER_2,
  TIER_3,
  TIER_4,
  TIER_5,
  TIER_6,
  E_NUM,
}

export enum GachaType {
  TEXT,
  UP_CHAR,
  AVAIL_CHAR,
  PICKUP_WITH_6,
  PICKUP_WITH_56,
  UP_CHAR_WITH_LIMIT,
  ATTAIN_CHAR,
  AVAIL_CHAR_WITHOUT_6,
  AVAIL_PROTRAIT_ONLY_6,
  IMAGE,
  FES_CLASSIC_CHAR,
  FES_CLASSIC_UP_CHAR,
}

export enum GachaTextType {
  NORMAL_HIGHLIGHT,
  NORMAL_GRAY,
  NORMAL_GRAY_UP,
  NEWBEE_HIGHLIGHT,
  NEWBEE_NORMAL_TEXT,
  NORMAL_TEXT,
  ORANGE_HIGHLIGHT,
  RED_HIGHLIGHT,
}

export enum GachaImageType {
  CLASSIC_SHD_RULE,
}

export enum GachaObjGroupType {
  ALL,
  BEFORE_FES_CLASSIC_CHOSEN,
  AFTER_FES_CLASSIC_CHOSEN,
}

export interface GachaDetailText {
  type: number;
  title: string;
  text: string;
}

export interface GachaObject {
  gachaObject: GachaType;
  type: GachaTextType;
  imageType: GachaImageType;
  param: string;
}

export interface GachaWeightUpChar {
  rarityRank: RarityRank;
  charId: string;
  weight: number;
}

export interface GachaPerAvail {
  charIdList: Array<string>;
  rarityRank: number;
  totalPercent: number;
}

export interface GachaAvailChar {
  perAvailList: Array<GachaPerAvail>;
}

export interface GachaPerChar {
  charIdList: string[];
  count: number;
  percent: number;
  rarityRank: number;
}

export interface GachaUpChar {
  perCharList: Array<GachaPerChar>;
}

export interface GachaDetailData {
  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar;
  weightUpCharInfoList: Array<GachaWeightUpChar>;
  limitedChar: Array<string>;
  gachaObjList: Array<GachaObject>;
  gachaObjGroupType: GachaObjGroupType;
}
