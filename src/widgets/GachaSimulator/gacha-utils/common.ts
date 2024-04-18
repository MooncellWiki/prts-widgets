import { GachaPerAvail, GachaPerChar, GachaUpChar } from "../types";

import { weightedRandom } from "./math";

export interface GachaConfig {
  guarantee5Avail: number;
  guarantee5Count: number;
  guarantee6Up6Avail: number;
  guarantee6Up6Count: number;
  guarantee6Avail: number;
  guarantee6Count: number;
  gachaTimes: number;
}

export interface GachaState extends GachaConfig {
  counter: number;
  non6StarCount: number;
  results: Record<string, number>;
}

export function createGachaState(config: GachaConfig) {
  return { ...config, counter: 0, results: {}, non6StarCount: 0 };
}

export function getRandomRarity(
  state: GachaState,
  perAvailList: GachaPerAvail[],
) {
  const items = perAvailList.map((avails) => avails.rarityRank);
  const weights = [];
  // 6 星 50 抽概率增加
  for (const availList of perAvailList) {
    let finalPercent = availList.totalPercent * 100;
    if (state.non6StarCount >= 50 && availList.rarityRank === 5) {
      const bonusCount = state.non6StarCount - 50 + 1;
      // 每抽 0.02 概率增加
      finalPercent += bonusCount * 0.02 * 100;
    }
    weights.push(finalPercent);
  }

  const { item: rarity } = weightedRandom(items, weights);

  return rarity;
}

export function getAvailListWithRarity(
  perAvailList: GachaPerAvail[],
  rarity: number,
) {
  const availList = perAvailList.find(
    (availList) => availList.rarityRank === rarity,
  );
  if (!availList) throw new Error("availList is null");

  return availList;
}

export function getUpListWithRarity(
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  return (
    upCharInfo?.perCharList.find(
      (charList) => charList.rarityRank === rarity,
    ) || null
  );
}

export function calculateCharWeights(
  availList: GachaPerAvail,
  upList: GachaPerChar | null,
) {
  const charWeights: Record<string, number> = {};

  let upSumWeight = 0;
  let upCount = 0;
  if (upList !== null) {
    for (const upCharId of upList.charIdList) {
      const percentage = upList.percent * 100;
      charWeights[upCharId] = percentage;
      upSumWeight += percentage;
      upCount++;
    }
  }

  const remainingWeight =
    (100 - upSumWeight) / (availList.charIdList.length - upCount);
  for (const charId of availList.charIdList) {
    if (charWeights[charId]) continue;
    charWeights[charId] = remainingWeight;
  }

  return charWeights;
}

export function getRandomCharWithRarity(
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar | null,
  rarity: number,
) {
  const availList = getAvailListWithRarity(perAvailList, rarity);
  const upList = getUpListWithRarity(upCharInfo, rarity);
  const charWeights = calculateCharWeights(availList, upList);

  const { item: charId } = weightedRandom(
    Object.keys(charWeights),
    Object.values(charWeights),
  );

  if (charId === null) throw new Error("charId is null");

  return { charId, rarity };
}
