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
