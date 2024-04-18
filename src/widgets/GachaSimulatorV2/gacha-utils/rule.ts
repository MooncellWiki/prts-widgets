import { GachaPerAvail, GachaUpChar, RarityRank } from "../types";

import {
  GachaState,
  getRandomCharWithRarity,
  getUpListWithRarity,
} from "./common";

export function shouldApplyEnsure5StarRule(state: GachaState) {
  return state.guarantee5Count && state.guarantee5Avail > 0;
}

export function shouldApplyEnsureUp6StarRule(state: GachaState) {
  return state.guarantee6Up6Count && state.guarantee6Up6Avail > 0;
}

export function shouldApplyEnsure6StarRule(state: GachaState) {
  return state.guarantee6Count && state.guarantee6Avail > 0;
}

export function hasOneOf5StarCharGotten(
  state: GachaState,
  upCharInfo: GachaUpChar,
) {
  const up5StarUpList = getUpListWithRarity(upCharInfo, RarityRank.TIER_5);
  if (up5StarUpList === null) return false;

  for (const charId of up5StarUpList.charIdList) {
    if (state.results[charId] && state.results[charId] >= 1) {
      return true;
    }
  }
}

export function getUp5StarUngottenList(
  state: GachaState,
  upCharInfo: GachaUpChar,
) {
  const up5StarUpList = getUpListWithRarity(upCharInfo, RarityRank.TIER_5);
  if (up5StarUpList === null) return [];

  const ungottenList = up5StarUpList.charIdList.filter(
    (charId) => !state.results[charId],
  );

  return ungottenList;
}

export function applyEnsure5StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  if (state.counter < state.guarantee5Count && rarity >= RarityRank.TIER_5) {
    state.guarantee5Avail--;
    console.log(
      `在第 ${state.guarantee5Count} 抽前已有 5 星及以上，已完成保底`,
    );
  }

  if (state.counter === state.guarantee5Count) {
    console.log(`触发 ${state.guarantee5Count} 抽内 5 星保底`);
    state.guarantee5Avail--;
    return getRandomCharWithRarity(perAvailList, upCharInfo, RarityRank.TIER_5);
  }
}

export function applyEnsure6StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  if (state.counter < state.guarantee6Count && rarity === RarityRank.TIER_6) {
    state.guarantee6Avail--;
    console.log(`在第 ${state.guarantee6Count} 抽前已有 6 星，已完成保底`);
  }

  if (state.counter === state.guarantee6Count) {
    console.log(`触发 ${state.guarantee6Count} 抽内 6 星保底`);
    state.guarantee6Avail--;
    return getRandomCharWithRarity(perAvailList, upCharInfo, RarityRank.TIER_6);
  }
}

export function applyEnsureUp6StarRule(state: GachaState, charId: string) {
  if (state.counter < state.guarantee6Up6Count && state.results[charId] >= 1) {
    state.guarantee6Up6Avail--;
    console.log(
      `在第 ${state.guarantee6Up6Count} 抽前已有对应 UP 6 星，已完成保底`,
    );
  }

  if (state.counter === state.guarantee6Up6Count) {
    console.log("触发 Up 6 星保底");
    state.guarantee6Up6Avail--;
    return { charId, rarity: RarityRank.TIER_6 };
  }
}
