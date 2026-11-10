import { defineQueryOptions } from "@pinia/colada";

import { WEEDY_ENDPOINT } from "@/utils/consts";

import { buildHighShopView, getOnSaleSkins, parseSkinGallery } from "./utils";

import type {
  CharInfo,
  HighShopData,
  SkinGalleryEntry,
  SkinShopData,
} from "./types";

export interface WeedyPayload<T> {
  data: T;
  /** weedy 每天拉取商店后落盘的时间，取自 Last-Modified */
  updatedAt: Date | null;
}

async function fetchWeedy<T>(path: string): Promise<WeedyPayload<T>> {
  // weedy 的响应不带 Cache-Control，no-cache 让浏览器每次用 If-Modified-Since
  // 复核，避免启发式缓存在每日刷新后仍然返回旧商店
  const resp = await fetch(new URL(path, WEEDY_ENDPOINT), {
    cache: "no-cache",
  });
  if (!resp.ok) throw new Error(`${path} 请求失败：HTTP ${resp.status}`);
  const lastModified = resp.headers.get("Last-Modified");
  return {
    data: (await resp.json()) as T,
    updatedAt: lastModified ? new Date(lastModified) : null,
  };
}

async function getSkinGallery(): Promise<Map<string, SkinGalleryEntry>> {
  const resp = await fetch(
    `/index.php?${new URLSearchParams({
      title: "模板:时装回廊",
      action: "raw",
      maxage: "3600",
      smaxage: "3600",
    })}`,
  );
  if (!resp.ok) throw new Error(`模板:时装回廊 请求失败：HTTP ${resp.status}`);
  return parseSkinGallery(await resp.text());
}

const CHAR_ID_RE = /^[\w-]+$/;

async function getCharInfo(charIds: string[]): Promise<Map<string, CharInfo>> {
  const ids = [...new Set(charIds)].filter((id) => CHAR_ID_RE.test(id));
  const result = new Map<string, CharInfo>();
  if (ids.length === 0) return result;

  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "chara",
      fields: "charId,cn,rarity",
      where: `charId IN (${ids.map((id) => `"${id}"`).join(",")})`,
      limit: String(ids.length),
    })}`,
  );
  const json: {
    cargoquery?: { title: { charId: string; cn: string; rarity: string } }[];
  } = await resp.json();
  for (const { title } of json.cargoquery ?? []) {
    result.set(title.charId, {
      name: title.cn,
      rarity: Number.parseInt(title.rarity),
    });
  }
  return result;
}

/** 当前中坚甄选池可兑换的干员数，对应原模板里的 {{#arraysize:k_exchange}} */
async function getKernelSelectCount(now: Date): Promise<number | null> {
  const time = now.toISOString().replace(/\.\d{3}Z$/, "Z");
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "ask",
      format: "json",
      api_version: "2",
      query: `[[分类:国服寻访]][[分类:中坚寻访]][[寻访关闭时间cn::>${time}]][[寻访开启时间cn::<${time}]]|?商店兑换干员|limit=1`,
    })}`,
  );
  const json: {
    query?: {
      results?: Record<string, { printouts: { 商店兑换干员?: string[] } }>;
    };
  } = await resp.json();
  const [pool] = Object.values(json.query?.results ?? {});
  const chars = pool?.printouts.商店兑换干员;
  return chars?.length ? chars.length : null;
}

/*
 * 下面是交给 Pinia Colada 的请求。同一页面上可能同时挂着两个商店小部件，
 * 入口都装整页共用的 pinia（pagePinia），共用的请求只发一次；失败的下次用到时重取。
 */

function logError<T>(pending: Promise<T>): Promise<T> {
  return pending.catch((error: unknown) => {
    console.error("[Shop]", error);
    throw error;
  });
}

// 整理数据也放在 query 里：weedy 返回的结构不对（如维护时的 {}）时抛的错落到 error 上，显示加载失败

/** 在售的时装 */
export const skinShopQuery = defineQueryOptions({
  key: ["shop", "skin"],
  query: () =>
    logError(
      fetchWeedy<SkinShopData>("/shop_skin.json").then(
        ({ data, updatedAt }) => ({
          goods: getOnSaleSkins(data.goodList, Date.now() / 1000),
          updatedAt,
        }),
      ),
    ),
});

export const highShopQuery = defineQueryOptions({
  key: ["shop", "high"],
  query: () =>
    logError(
      fetchWeedy<HighShopData>("/shop_high.json").then(
        ({ data, updatedAt }) => ({
          view: buildHighShopView(data),
          updatedAt,
        }),
      ),
    ),
});

/** 模板:时装回廊：只用来配半身像，拿不到时退化成占位图，不影响商店本身 */
export const skinGalleryQuery = defineQueryOptions({
  key: ["shop", "skin-gallery"],
  query: () => logError(getSkinGallery()),
});

/** 合约干员的名字和稀有度：只影响头像稀有度，拿不到时按价格兜底 */
export const charInfoQuery = defineQueryOptions((charIds: string[]) => ({
  key: ["shop", "char-info", charIds],
  query: () => logError(getCharInfo(charIds)),
}));

/** 中坚甄选的干员数：拿不到时不显示人数 */
export const kernelSelectCountQuery = defineQueryOptions({
  key: ["shop", "kernel-select-count"],
  query: () => logError(getKernelSelectCount(new Date())),
});
