export enum VoiceLangType {
  NONE = 0,
  JP = 1,
  CN_MANDARIN = 2,
  EN = 3,
  KR = 4,
  CN_TOPOLECT = 5,
  LINKAGE = 6,
  ITA = 7,
  GER = 8,
  RUS = 9,
}

export type VoiceLangInfoData = {
  [K in keyof typeof VoiceLangType]: {
    wordkey: string;
    voiceLangType: VoiceLangType;
    cvName: [string];
    voicePath: string;
  };
};

export interface VoiceLangData {
  [K: string]: {
    wordkeys: [string];
    charId: string;
    dict: VoiceLangInfoData;
  };
}

export type VoiceLangTypeData = {
  [K in keyof typeof VoiceLangType]: {
    name: string;
    groupType: keyof typeof VoiceLangType;
  };
};

export interface CharWordTable {
  voiceLangTypeDict: VoiceLangTypeData;
  voiceLangDict: VoiceLangData;
}

export enum SkinVoiceType {
  NONE = 0,
  ILLUST = 1,
  ALL = 2,
}

export interface TokenSkinInfo {
  tokenId: string;
  tokenSkinId: string;
}

export interface BattleSkin {
  overwritePrefab: boolean;
  skinOrPrefabId: string;
}

export interface DisplaySkin {
  skinName: string;
  colorList: [string];
  titleList: [string];
  modelName: string;
  drawerList: [string];
  designerList: [string];
  skinGroupId: string;
  skinGroupName: string;
  skinGroupSortIndex: number;
  content: string;
  dialog: string;
  usage: string;
  description: string;
  obtainApproach: string;
  sortId: number;
  displayTagId: string;
  getTime: number;
  onYear: number;
  onPeriod: number;
}

export interface CharSkinData {
  [K: string]: {
    skinId: string;
    charId: string;
    tokenSkinMap: [TokenSkinInfo];
    illustId: string;
    dynIllustId: string;
    avatarId: string;
    portraitId: string;
    dynPortraitId: string;
    dynEntranceId: string;
    buildingId: string;
    battleSkin: BattleSkin;
    isBuySkin: boolean;
    tmplId: string;
    voiceId: string;
    voiceType: SkinVoiceType;
    displaySkin: DisplaySkin;
  };
}

export interface SkinTable {
  charSkins: CharSkinData;
  buildinPatchMap: Record<string, Record<string, string>>;
}
