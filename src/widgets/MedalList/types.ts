export interface Medal {
  name: string;
  alias: string;
  rarity: number;
  desc: string;
  method: string;
  decrypt?: string;
  isHidden: boolean;
  isTrim: boolean;
  trimMethod?: string;
  reward?: string;
}

export interface MedalGroup {
  name: string;
  desc: string;
  color: string;
  bindEvent: Array<string>;
  alias: string;
  deprecateType?: string;
  hasChangedInRetro?: boolean;
  medal: Array<string>;
  isTrim: boolean;
  background?: string;
  textStyle?: string;
  customText?: string;
}

export interface MedalMetaData {
  medal: {
    [key: string]: Medal;
  };
  medalGroup: {
    [key: string]: MedalGroup;
  };
  category: {
    [key: string]: {
      name: string;
      desc: string;
      extraDesc?: string;
      subCategory?: Array<string>;
      medalGroup: Array<string>;
      medal: Array<string>;
    };
  };
}
