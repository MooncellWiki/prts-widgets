import { defineQueryOptions } from "@pinia/colada";

import { TORAPPU_ENDPOINT, WEEDY_ENDPOINT } from "@/utils/consts";

import {
  GachaRuleType,
  type GachaData,
  type GachaPoolClientData as GachaClientPool,
} from "./gamedata-types";

import type {
  GachaDBServer,
  GachaPoolClientData as GachaServerPool,
} from "./types";

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname} ${response.status}`);
  return response.json();
}

/** 一个卡池在 weedy（服务端，含 UP 与可出干员）和 torappu gamedata（客户端，含规则）里的两份数据 */
export const gachaPoolQuery = defineQueryOptions((gachaPoolId: string) => ({
  key: ["gacha-simulator", gachaPoolId],
  query: async () => {
    try {
      const [server, client] = await Promise.all([
        fetchJson<GachaDBServer>(new URL("/gacha_table.json", WEEDY_ENDPOINT)),
        fetchJson<GachaData>(
          new URL("/gamedata/latest/excel/gacha_table.json", TORAPPU_ENDPOINT),
        ),
      ]);
      const gachaServerPool = server.gachaPoolClient.find(
        (pool) => pool.gachaPoolId === gachaPoolId,
      );
      if (!gachaServerPool) throw new Error(`没有卡池 ${gachaPoolId}`);
      return {
        gachaServerPool,
        gachaClientPool: client.gachaPoolClient.find(
          (pool) => pool.gachaPoolId === gachaPoolId,
        ),
        newbeeClientPool: client.newbeeGachaPoolClient.find(
          (pool) => pool.gachaPoolId === gachaPoolId,
        ),
      };
    } catch (error) {
      console.error("[GachaSimulatorV2]", error);
      throw error;
    }
  },
}));

/**
 * 数据还没到时（含外壳预渲染）先拿常驻池的初始状态画出模拟器的样子：
 * 让 GachaExecutor 能完成构造，画面不会在数据到了以后整块跳动。
 */
export const EMPTY_POOLS = {
  gachaServerPool: {
    gachaPoolDetail: {
      detailInfo: {
        availCharInfo: { perAvailList: [] },
        upCharInfo: { perCharList: [] },
        weightUpCharInfoList: null,
      },
    },
  } as unknown as GachaServerPool,
  gachaClientPool: {
    gachaRuleType: GachaRuleType.NORMAL,
    guarantee5Avail: 1,
    guarantee5Count: 10,
  } as unknown as GachaClientPool,
};
