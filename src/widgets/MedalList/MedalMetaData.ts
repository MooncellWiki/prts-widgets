export interface Medal {
  name: string;
  alias: string;
  rarity?: number;
  desc: string;
  method: string;
  decrypt?: string;
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
      subCategory?: Array<string>;
      medalGroup: Array<string>;
      medal: Array<string>;
    };
  };
}

export async function getMedalMetaData(): Promise<MedalMetaData> {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "parse",
      format: "json",
      page: "光荣之路/data",
      prop: "wikitext",
      utf8: "1",
      disablelimitreport: "1",
      disableeditsection: "1",
      disabletoc: "1",
    })}`,
  );
  const json = await resp.json();

  return JSON.parse(json.parse.wikitext["*"]);
}
