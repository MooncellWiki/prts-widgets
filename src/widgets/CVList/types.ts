export enum VoiceLangType {
  NONE = 0,
  CN_MANDARIN = 1,
  CN_TOPOLECT = 2,
  JP = 3,
  EN = 4,
  KR = 5,
  ITA = 6,
  GER = 7,
  RUS = 8,
  LINKAGE = 1000,
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

export async function getCVConfig(): Promise<MedalMetaData> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "配音一览/config",
      action: "raw",
    })}`,
  );
  return await resp.json();
}
