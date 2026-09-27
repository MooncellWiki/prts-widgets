// weedy.prts.wiki 的 shop_skin.json / shop_high.json 是游戏 getGoodList 接口的原样转存，
// 这里只声明组件用到的字段。时间戳单位为秒，-1 表示不限时。

export interface ShopGoodItem {
  id: string;
  count: number;
  type: string;
}

export interface SkinGood {
  goodId: string;
  skinName: string;
  skinId: string;
  charId: string;
  currencyUnit: string;
  originPrice: number;
  price: number;
  discount: number;
  startDateTime: number;
  endDateTime: number;
}

export interface SkinShopData {
  goodList: SkinGood[];
}

export interface HighGood {
  goodId: string;
  displayName: string | null;
  priority: number;
  number: number;
  goodType: string;
  item: ShopGoodItem | null;
  progressGoodId: string | null;
  price: number;
  originPrice: number;
  discount: number;
  /** -1 表示不限量 */
  availCount: number;
  goodStartTime: number;
  goodEndTime: number;
}

export interface ProgressStep {
  order: number;
  price: number;
  displayName: string;
  item: ShopGoodItem;
}

export interface HighShopData {
  goodList: HighGood[];
  progressGoodList: Record<string, ProgressStep[]>;
}

/** 模板:时装回廊 里一条 {{时装回廊/半身像}} 的参数 */
export interface SkinGalleryEntry {
  skinName: string;
  charName: string;
  skinIndex: string;
  series: string;
  anchor: string;
  tag: string;
}

export interface CharInfo {
  name: string;
  /** 0 起算，与 招聘合同_N.png 的 N 一致 */
  rarity: number;
}
