import { getImagePath } from "@/utils/utils";

import type {
  HighGood,
  HighShopData,
  ProgressStep,
  ShopGoodItem,
  SkinGalleryEntry,
  SkinGood,
} from "./types";

const CST_OFFSET_SECONDS = 8 * 3600;

export function wikiImage(filename: string): string {
  return getImagePath(filename.replaceAll(" ", "_"));
}

export function wikiLink(title: string, anchor?: string): string {
  return `/w/${title}${anchor ? `#${anchor.replaceAll(" ", "_")}` : ""}`;
}

/** 秒级时间戳按 UTC+8 格式化为 YYYY-MM-DD HH:mm；负数表示不限时，返回空串 */
export function formatCstTime(timestamp: number): string {
  if (timestamp < 0) return "";
  const date = new Date((timestamp + CST_OFFSET_SECONDS) * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

/**
 * 同 模板:倒计时/CN 的格式：满一天才显示天，满一小时才显示小时，分钟总是显示。
 * 原模板用的是严格大于，恰好 86400 秒时会显示成「0小时0分钟」，这里改为大于等于
 */
export function formatRemaining(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${seconds >= 86400 ? `${days}天` : ""}${seconds >= 3600 ? `${hours}小时` : ""}${minutes}分钟`;
}

const SKIN_GALLERY_RE = /\{\{\s*时装回廊\/半身像\s*\|([^{}]*)\}\}/g;

/** 解析 模板:时装回廊 源码，按时装名索引；同名时取第一条，与原 模块:SkinShop 的匹配行为一致 */
export function parseSkinGallery(
  source: string,
): Map<string, SkinGalleryEntry> {
  const result = new Map<string, SkinGalleryEntry>();
  for (const [, body] of source.matchAll(SKIN_GALLERY_RE)) {
    const params: Record<string, string> = {};
    for (const part of body.split("|")) {
      const eq = part.indexOf("=");
      if (eq !== -1)
        params[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
    const {
      时装名: skinName,
      干员名: charName = "",
      时装序号: skinIndex,
      时装系列: series = "",
      锚点: anchor,
      时装注释: tag = "",
    } = params;
    if (!skinName || result.has(skinName)) continue;
    result.set(skinName, {
      skinName,
      charName,
      skinIndex: skinIndex || "1",
      series,
      anchor: anchor || skinName,
      tag,
    });
  }
  return result;
}

/**
 * 在售时装：价格为 0 的是商店里的占位商品（原模板的 ignore 参数），
 * 已过结束时间的是 weedy 还没刷新到的下架商品，两者都不展示。
 */
export function getOnSaleSkins(goods: SkinGood[], now: number): SkinGood[] {
  return goods.filter(
    (good) =>
      good.price > 0 && (good.endDateTime < 0 || good.endDateTime >= now),
  );
}

export interface Ladder {
  good: HighGood;
  steps: ProgressStep[];
  total: number;
}

export interface HighShopView {
  /** 当期常驻标准寻访的 6★ / 5★ 合同 */
  standard: HighGood[];
  /** 当期中坚寻访的合同（或中坚甄选），没有中坚池时为空 */
  kernel: HighGood[];
  kernelSelect: boolean;
  ladders: Ladder[];
  materials: HighGood[];
  total: number;
  hasUnlimited: boolean;
  reeditionOperators: Ladder[];
  reeditionSkins: HighGood[];
  reeditionOperatorTotal: number;
  reeditionSkinTotal: number;
}

export function isKernelSelectGood(good: HighGood): boolean {
  return !!good.item?.type.includes("CLASSIC_FES_PICK");
}

function goodTotal(good: HighGood): number {
  return good.availCount < 0 ? 0 : good.price * good.availCount;
}

function sum(values: number[]): number {
  return values.reduce((acc, cur) => acc + cur, 0);
}

/**
 * 按商品类型给高级凭证区分组。原 模块:WeedyJsonDecode 按 goodList 下标取值，
 * 这里改按类型判断，商品顺序变动时不会错位：
 * - 阶梯商品首档是干员的，是常驻往期复刻的危机合约干员，其余阶梯是当期的凭证/许可阶梯
 * - CHAR_SKIN 是常驻往期复刻的时装
 * - CHAR / CLASSIC_FES_PICK 是当期干员合同，前两个是标准池，其余是中坚池（与原模块一致）
 * - 剩下的是通用信物与养成材料
 */
export function buildHighShopView(data: HighShopData): HighShopView {
  const contracts: HighGood[] = [];
  const ladders: Ladder[] = [];
  const materials: HighGood[] = [];
  const reeditionOperators: Ladder[] = [];
  const reeditionSkins: HighGood[] = [];

  for (const good of data.goodList) {
    if (good.goodType === "PROGRESS") {
      const steps = good.progressGoodId
        ? (data.progressGoodList[good.progressGoodId] ?? [])
        : [];
      if (steps.length === 0) continue;
      const ladder = { good, steps, total: sum(steps.map((s) => s.price)) };
      if (steps[0].item.type === "CHAR") reeditionOperators.push(ladder);
      else ladders.push(ladder);
    } else if (!good.item) {
      continue;
    } else if (good.item.type === "CHAR_SKIN") {
      reeditionSkins.push(good);
    } else if (good.item.type === "CHAR" || isKernelSelectGood(good)) {
      contracts.push(good);
    } else {
      materials.push(good);
    }
  }

  const standard = contracts.slice(0, 2);
  const kernel = contracts.slice(2);

  return {
    standard,
    kernel,
    kernelSelect: kernel.some(isKernelSelectGood),
    ladders,
    materials,
    total:
      sum(contracts.map(goodTotal)) +
      sum(ladders.map((l) => l.total)) +
      sum(materials.map(goodTotal)),
    hasUnlimited: materials.some((good) => good.availCount < 0),
    reeditionOperators,
    reeditionSkins,
    reeditionOperatorTotal: sum(reeditionOperators.map((l) => l.total)),
    reeditionSkinTotal: sum(reeditionSkins.map(goodTotal)),
  };
}

// 商店显示名与站内道具名不一致的道具，按道具类型换成站内名，图标和链接都用它
const WIKI_ITEM_NAME_BY_TYPE: Record<string, string> = {
  TKT_GACHA_10: "十连寻访凭证",
  CLASSIC_TKT_GACHA_10: "十连中坚寻访凭证",
};

export function wikiItemName(item: ShopGoodItem, displayName: string): string {
  return WIKI_ITEM_NAME_BY_TYPE[item.type] ?? displayName;
}

/** 中坚甄选商品没有对应的干员，按名称里的星级取 道具_带框_中坚甄选N星干员.png */
export function kernelSelectIconName(good: HighGood): string {
  const isSix = /6星|六星/.test(good.displayName ?? "") || good.price >= 100;
  return isSix ? "中坚甄选6星干员" : "中坚甄选5星干员";
}
