import { WEEDY_ENDPOINT } from "@/utils/consts";

import { parseSkinGallery } from "./utils";

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

// 同一页面上可能同时挂着两个商店小部件，共用的请求只发一次
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= fn().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return pending;
  };
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

export const getSkinShop = once(() =>
  fetchWeedy<SkinShopData>("/shop_skin.json"),
);

export const getHighShop = once(() =>
  fetchWeedy<HighShopData>("/shop_high.json"),
);

export const getSkinGallery = once(
  async (): Promise<Map<string, SkinGalleryEntry>> => {
    const resp = await fetch(
      `/index.php?${new URLSearchParams({
        title: "模板:时装回廊",
        action: "raw",
        maxage: "3600",
        smaxage: "3600",
      })}`,
    );
    if (!resp.ok)
      throw new Error(`模板:时装回廊 请求失败：HTTP ${resp.status}`);
    return parseSkinGallery(await resp.text());
  },
);

const CHAR_ID_RE = /^[\w-]+$/;

export async function getCharInfo(
  charIds: string[],
): Promise<Map<string, CharInfo>> {
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
export async function getKernelSelectCount(now: Date): Promise<number | null> {
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
