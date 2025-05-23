import { weightedRandom } from "./math";

import type {
  GachaPerAvail,
  GachaPerChar,
  GachaUpChar,
  GachaWeightUpChar,
} from "../types";

export interface GachaConfig {
  guarantee5Avail: number;
  guarantee5Count: number;
  guarantee6Up6Avail: number;
  guarantee6Up6Count: number;
  guarantee6DoubleUp6Count: number;
  guarantee6Avail: number;
  guarantee6Count: number;
  gachaTimes: number;
}

export interface GachaState extends GachaConfig {
  counter: number;
  non6StarCount: number;
  results: Record<string, number>;
}

export function createGachaState(config: GachaConfig): GachaState {
  return {
    ...config,
    counter: 0,
    results: {},
    non6StarCount: 0,
  };
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

export function getUpListWithRarity(rarity: number, upCharInfo?: GachaUpChar) {
  return upCharInfo?.perCharList.find(
    (charList) => charList.rarityRank === rarity,
  );
}

export function calculateCharWeights(
  availList: GachaPerAvail,
  upList?: GachaPerChar,
  weightUpCharInfoList: GachaWeightUpChar[] | null = null,
) {
  const charWeights: Record<string, number> = {};
  const weightUpCharInfoMap: Record<string, number> = {};
  if (weightUpCharInfoList) {
    for (const weightUpCharInfo of weightUpCharInfoList) {
      weightUpCharInfoMap[weightUpCharInfo.charId] = weightUpCharInfo.weight;
    }
  }

  let upSumWeight = 0;
  let upCount = 0;
  if (upList) {
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

  for (const [charId, weight] of Object.entries(weightUpCharInfoMap)) {
    const factor = weight / 100; // 限定池过往六星 UP 5 倍权重 (500)
    if (charWeights[charId]) {
      charWeights[charId] = charWeights[charId] * factor;
    }
  }

  return charWeights;
}

export function getRandomCharWithRarity(
  perAvailList: GachaPerAvail[],
  rarity: number,
  upCharInfo?: GachaUpChar,
  weightUpCharInfoList: GachaWeightUpChar[] | null = null,
) {
  const availList = getAvailListWithRarity(perAvailList, rarity);
  const upList = getUpListWithRarity(rarity, upCharInfo);
  const charWeights = calculateCharWeights(
    availList,
    upList,
    weightUpCharInfoList,
  );

  const { item: charId } = weightedRandom(
    Object.keys(charWeights),
    Object.values(charWeights),
  );

  return { charId, rarity };
}
