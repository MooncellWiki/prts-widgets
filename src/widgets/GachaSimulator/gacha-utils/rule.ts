import { GachaPerAvail, GachaUpChar } from "../types";

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
  const up5StarUpList = getUpListWithRarity(upCharInfo, 4);
  if (up5StarUpList === null) return false;

  return Object.entries(state.results).some(([charId, count]) => {
    return up5StarUpList?.charIdList.includes(charId) && count >= 1;
  });
}

export function applyEnsure5StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  if (state.counter < state.guarantee5Count && rarity >= 4) {
    state.guarantee5Avail--;
    console.log(`在第 ${state.guarantee5Count} 抽前已有五星及以上，已完成保底`);
  }

  if (state.counter === state.guarantee5Count) {
    console.log(`触发 ${state.guarantee5Count} 抽内五星保底`);
    state.guarantee5Avail--;
    return getRandomCharWithRarity(perAvailList, upCharInfo, 4);
  }
}

export function applyEnsure6StarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  if (state.counter < state.guarantee6Count && rarity === 5) {
    state.guarantee6Avail--;
    console.log(`在第 ${state.guarantee6Count} 抽前已有六星，已完成保底`);
  }

  if (state.counter === state.guarantee6Count) {
    console.log(`触发 ${state.guarantee6Count} 抽内六星保底`);
    state.guarantee6Avail--;
    return getRandomCharWithRarity(perAvailList, upCharInfo, 5);
  }
}

export function applyEnsureUp6StarRule(state: GachaState, charId: string) {
  if (state.counter < state.guarantee6Up6Count && state.results[charId] >= 1) {
    state.guarantee6Up6Avail--;
    console.log(
      `在第 ${state.guarantee6Up6Count} 抽前已有对应六星 UP，已完成保底`,
    );
  }

  if (state.counter === state.guarantee6Up6Count) {
    console.log("触发保底");
    state.guarantee6Up6Avail--;
    return { charId, rarity: 5 };
  }
}
