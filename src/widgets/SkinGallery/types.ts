/** 一张半身像卡片的全部展示字段：由 skin_table 推导，见 model.ts 的 buildCards */
export interface GalleryCard {
  /** skinId；wiki 有而游戏没有的条目为 `wiki-{序号}` */
  id: string;
  skinId: string;
  portraitId?: string;
  /** 游戏内干员 ID，给半身像按 ID 取图用 */
  charId: string;
  skinName: string;
  /** 中文名，含职业后缀（阿米娅(近卫)） */
  charName: string;
  /** 外文名，取 displaySkin.modelName */
  charNameEn: string;
  /** 半身像失败时回退的 `半身像_{中文名}_skin{N}.png` 里的 N */
  skinIndex: string;
  /** 品牌展示名，与 `Skin brand {系列}.png` 一致 */
  series: string;
  /** 系列页内的锚点，等于时装名，空格在拼接链接时换成下划线 */
  anchor: string;
  tag: string;
  /** `Y-7 20` 之类；未编入期号的为新时装 */
  period: string;
  brandId: string;
  brandCapitalName: string;
  skinGroupId: string;
}

export interface Skin {
  skinId: string;
  charId: string;
  portraitId: string;
  displaySkin: {
    skinName: string | null;
    skinGroupId: string;
    skinGroupName: string;
    modelName: string;
    displayTagId: string | null;
    sortId: number;
    getTime: number;
    /** 老时装没有期号，为 0；`skinGroupSortIndex` 与 wiki 期号无关 */
    onYear: number;
    onPeriod: number;
  };
}

/** cargo `chara` 表：charId → 中文名，含 `阿米娅(近卫)` 这类职业后缀 */
export type CharNames = Record<string, string>;

export interface Brand {
  brandId: string;
  brandName: string;
  brandCapitalName: string;
  description: string;
  sortId: number;
  groupList: { skinGroupId: string; publishTime: number }[];
  kvImgIdList: { kvImgId: string; linkedSkinGroupId: string }[];
}

export interface SkinTable {
  charSkins: Record<string, Skin>;
  brandList: Record<string, Brand>;
}

export interface GalleryData {
  table: SkinTable;
  cards: GalleryCard[];
}
