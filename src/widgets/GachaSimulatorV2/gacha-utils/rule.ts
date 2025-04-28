import { RarityRank } from "../consts";

import {
  type GachaState,
  getRandomCharWithRarity,
  getUpListWithRarity,
} from "./common";

import type { GachaPerAvail, GachaUpChar } from "../types";

export function shouldApplyEnsure5StarRule(state: GachaState) {
  return state.guarantee5Count && state.guarantee5Avail > 0;
}

export function shouldApplyEnsureUp6StarRule(state: GachaState) {
  return state.guarantee6Up6Count && state.guarantee6Up6Avail > 0;
}

export function shouldApplyEnsure6StarRule(state: GachaState) {
  return state.guarantee6Count && state.guarantee6Avail > 0;
}

export function hasOneOfUp6StarCharUngotten(
  state: GachaState,
  charIds: string[],
) {
  return charIds.some((charId) => (state.results[charId] || 0) < 1);
}

export function hasOneOf5StarCharGotten(
  state: GachaState,
  upCharInfo?: GachaUpChar,
) {
  const up5StarUpList = getUpListWithRarity(RarityRank.TIER_5, upCharInfo);
  if (!up5StarUpList) return false;

  return up5StarUpList.charIdList.some(
    (charId) => state.results[charId] && state.results[charId] >= 1,
  );
}

export function getUp5StarUngottenList(
  state: GachaState,
  upCharInfo?: GachaUpChar,
) {
  const up5StarUpList = getUpListWithRarity(RarityRank.TIER_5, upCharInfo);
  if (!up5StarUpList) return [];

  const ungottenList = up5StarUpList.charIdList.filter(
    (charId) => !state.results[charId],
  );

  return ungottenList;
}

export function applyEnsure5StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  rarity: number,
  upCharInfo?: GachaUpChar,
) {
  if (state.counter < state.guarantee5Count && rarity >= RarityRank.TIER_5) {
    state.guarantee5Avail--;
  }

  if (state.counter === state.guarantee5Count) {
    state.guarantee5Avail--;
    return getRandomCharWithRarity(perAvailList, RarityRank.TIER_5, upCharInfo);
  }
}

export function applyEnsure6StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  rarity: number,
  upCharInfo?: GachaUpChar,
) {
  if (state.counter < state.guarantee6Count && rarity === RarityRank.TIER_6) {
    state.guarantee6Avail--;
  }

  if (state.counter === state.guarantee6Count) {
    state.guarantee6Avail--;
    return getRandomCharWithRarity(perAvailList, RarityRank.TIER_6, upCharInfo);
  }
}

export function applyEnsureUp6StarRule(state: GachaState, charId: string) {
  if (state.counter < state.guarantee6Up6Count && state.results[charId] >= 1) {
    state.guarantee6Up6Avail--;
  }

  if (state.counter === state.guarantee6Up6Count) {
    state.guarantee6Up6Avail--;
    return { charId, rarity: RarityRank.TIER_6 };
  }
}

export function applyEnsureDoubleUp6StarRule(
  state: GachaState,
  charIds: string[],
) {
  for (const charId of charIds) {
    if ((state.results[charId] || 0) >= 1) continue;

    if (state.counter >= state.guarantee6Up6Count)
      return { charId, rarity: RarityRank.TIER_6 };
  }
}
