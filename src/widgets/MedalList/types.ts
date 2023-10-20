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

export interface MedalMetaData {
  medal: {
    [key: string]: Medal;
  };
  medalGroup: {
    [key: string]: {
      name: string;
      desc: string;
      color: string;
      bindEvent: Array<string>;
      deprecateType?: string;
      hasChangedInRetro?: boolean;
      medal: Array<string>;
    };
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
