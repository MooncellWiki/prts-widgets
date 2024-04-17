import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
} from "./gamedata-types";
import type {
  GachaAvailChar,
  GachaPerAvail,
  GachaPerChar,
  GachaPoolClientData as GachaServerPool,
  GachaUpChar,
} from "./types";

export function weightedRandom<T>(
  items: T[],
  weights: number[],
): { item: T | null; index: number } {
  if (items.length !== weights.length)
    throw new Error("Items and weights must be of the same size");
  if (items.length === 0 || weights.length === 0)
    throw new Error("Items or Weights must not be empty");
  if (weights.length !== items.length)
    throw new Error("Each item should have a weight");

  const cumulativeWeights: Array<number> = [];
  for (const [i, weight] of weights.entries()) {
    cumulativeWeights[i] = weight + (cumulativeWeights[i - 1] || 0);
  }
  const maxCumulativeWeight = cumulativeWeights.at(-1);
  if (!maxCumulativeWeight) {
    throw new Error("Got falsy maxCumulativeWeight");
  }

  const randomNumber = maxCumulativeWeight * Math.random();
  for (const [itemIndex, item] of items.entries()) {
    if (cumulativeWeights[itemIndex] >= randomNumber) {
      return {
        item: item,
        index: itemIndex,
      };
    }
  }

  return { item: null, index: -1 };
}

export function getRandomRarity(
  state: GachaState,
  perAvailList: GachaPerAvail[],
) {
  const items = perAvailList.map((avails) => avails.rarityRank);
  const weights = [];
  for (const availList of perAvailList) {
    let finalPercent = availList.totalPercent * 100;
    if (state.non6StarCount >= 50 && availList.rarityRank === 5) {
      const bonusCount = state.non6StarCount - 50 + 1;
      finalPercent += bonusCount * 0.02 * 100;
    }
    weights.push(finalPercent);
  }
  console.log(weights);

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

export function getUpListWithRarity(upCharInfo: GachaUpChar, rarity: number) {
  return (
    upCharInfo.perCharList.find((charList) => charList.rarityRank === rarity) ||
    null
  );
}

export function calculateCharWeights(
  availList: GachaPerAvail,
  upList: GachaPerChar | null,
) {
  const charWeights: Record<string, number> = {};

  let upSumWeight = 0;
  if (upList !== null) {
    for (const upCharId of upList.charIdList) {
      const percentage = upList.percent * 100;
      charWeights[upCharId] = percentage;
      upSumWeight += percentage;
    }
  }

  const remainingWeight = (100 - upSumWeight) / availList.charIdList.length;
  for (const charId of availList.charIdList) {
    if (charWeights[charId]) continue;
    charWeights[charId] = remainingWeight;
  }

  return charWeights;
}

export function getRandomCharWithRarity(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar,
  rarity: number,
) {
  const availList = getAvailListWithRarity(perAvailList, rarity);
  const upList = getUpListWithRarity(upCharInfo, rarity);
  const charWeights = calculateCharWeights(availList, upList);

  const { item: charId } = weightedRandom(
    Object.keys(charWeights),
    Object.values(charWeights),
  );

  return { charId, rarity };
}

export function applyTenthFiveStarRule(
  state: GachaState,
  perAvailList: GachaPerAvail[],
  upCharInfo: GachaUpChar,
  rarity: number,
) {
  if (state.counter < state.guarantee5Count && rarity === 4) {
    state.guarantee5Avail--;
    console.log(`在第 ${state.guarantee5Count} 抽前已有五星，跳过保底`);
  }

  if (state.counter === state.guarantee5Count) {
    console.log("触发保底");
    state.guarantee5Avail--;
    return getRandomCharWithRarity(state, perAvailList, upCharInfo, 4);
  }
}

export class GachaState {
  counter: number;
  non6StarCount: number;
  guarantee5Avail: number;
  guarantee5Count: number;

  constructor(guarantee5Avail: number, guarantee5Count: number) {
    this.counter = 0;
    this.non6StarCount = 0;
    this.guarantee5Avail = guarantee5Avail;
    this.guarantee5Count = guarantee5Count;
  }
}

export class GachaExecutor {
  gachaRuleType: GachaRuleType;

  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar;

  state: GachaState;

  constructor(
    gachaClientPool: GachaClientPool,
    gachaServerPool: GachaServerPool,
  ) {
    this.availCharInfo =
      gachaServerPool.gachaPoolDetail.detailInfo.availCharInfo;
    this.upCharInfo = gachaServerPool.gachaPoolDetail.detailInfo.upCharInfo;
    this.gachaRuleType = gachaClientPool.gachaRuleType;

    this.state = new GachaState(
      gachaClientPool.guarantee5Avail,
      gachaClientPool.guarantee5Count,
    );
  }

  resetState() {
    this.state = new GachaState(
      this.state.guarantee5Avail,
      this.state.guarantee5Count,
    );
  }

  doGachaOnce() {
    const rarity = getRandomRarity(this.state, this.availCharInfo.perAvailList);
    if (rarity === null) throw new Error("rarity is null");

    const { charId } = getRandomCharWithRarity(
      this.state,
      this.availCharInfo.perAvailList,
      this.upCharInfo,
      rarity,
    );
    if (charId === null) throw new Error("charId is null");

    this.state.counter++;

    // 6星计数
    if (rarity === 5) {
      this.state.non6StarCount = 0;
    } else {
      this.state.non6StarCount++;
    }

    // 前10次抽卡5星保底
    if (this.state.guarantee5Count && this.state.guarantee5Avail > 0) {
      const applied = applyTenthFiveStarRule(
        this.state,
        this.availCharInfo.perAvailList,
        this.upCharInfo,
        rarity,
      );
      if (applied) return applied;
    }

    return { charId, rarity };
  }
}
