import type { SkinGalleryEntry } from "../Shop/types";

export interface WikiSkin extends SkinGalleryEntry {
  period: string;
  charNameEn: string;
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
  };
}

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

export interface GalleryCard extends WikiSkin {
  id: string;
  portraitId?: string;
  brandId: string;
  brandCapitalName: string;
  skinGroupId: string;
}

export interface GalleryData {
  table: SkinTable;
  cards: GalleryCard[];
}
