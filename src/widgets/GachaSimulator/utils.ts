import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
} from "./gamedata-types";
import type { GachaAvailChar, GachaUpChar } from "./types";

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

export class GachaState {
  counter: number;
  guarantee5Avail: number;
  non6StarCount: number;

  constructor(guarantee5Avail: number) {
    this.counter = 0;
    this.guarantee5Avail = guarantee5Avail;
    this.non6StarCount = 0;
  }
}

export class GachaExecutor {
  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar;
  state: GachaState;
  gachaClientPool: GachaClientPool;
  gachaRuleType: GachaRuleType;

  constructor(
    availCharInfo: GachaAvailChar,
    upCharInfo: GachaUpChar,
    gachaClientPool: GachaClientPool,
  ) {
    this.availCharInfo = availCharInfo;
    this.upCharInfo = upCharInfo;
    this.gachaClientPool = gachaClientPool;
    this.gachaRuleType = gachaClientPool.gachaRuleType;
    const { guarantee5Avail } = gachaClientPool;
    this.state = new GachaState(guarantee5Avail);
  }

  getRandomRarity() {
    const items = this.availCharInfo.perAvailList.map(
      (availList) => availList.rarityRank,
    );
    const weights = this.availCharInfo.perAvailList.map(
      (availList) => availList.totalPercent * 100, // scale up to percentage
    );

    const { item: rarity } = weightedRandom(items, weights);

    return rarity;
  }

  doRarityGachaOnce(rarity: number) {
    const charIdWeights: Record<string, number> = {};
    const rarityAvailList = this.availCharInfo.perAvailList.find(
      (availList) => availList.rarityRank === rarity,
    );
    if (!rarityAvailList) throw new Error("rarityAvailList is empty");

    const rarityUpList = this.upCharInfo.perCharList.find(
      (charList) => charList.rarityRank === rarity,
    );

    // calculate up char weight
    let upSumWeight = 0;
    if (rarityUpList) {
      for (const upCharId of rarityUpList.charIdList) {
        const percentage = rarityUpList.percent * 100; // scale up to percentage
        charIdWeights[upCharId] = percentage;
        upSumWeight += percentage;
      }
    }

    const remainingWeight =
      (100 - upSumWeight) / rarityAvailList.charIdList.length;
    for (const charId of rarityAvailList.charIdList) {
      if (charIdWeights[charId]) continue;
      charIdWeights[charId] = remainingWeight;
    }

    const { item: charId } = weightedRandom(
      Object.keys(charIdWeights),
      Object.values(charIdWeights),
    );

    return { charId, rarity };
  }

  doGachaOnce() {
    const rarity = this.getRandomRarity();
    if (rarity === null) throw new Error("rarity is null");

    const { charId } = this.doRarityGachaOnce(rarity);
    if (charId === null) throw new Error("charId is null");

    this.state.counter++;

    // 6星计数
    if (rarity === 5) {
      this.state.non6StarCount = 0;
    } else {
      this.state.non6StarCount++;
    }

    // 前10次抽卡5星保底
    const { guarantee5Count } = this.gachaClientPool;
    if (guarantee5Count && this.state.guarantee5Avail > 0) {
      if (this.state.counter <= guarantee5Count && rarity == 4) {
        this.state.guarantee5Avail--;
        console.log(`在第 ${guarantee5Count} 抽前已有五星，跳过保底`);
      }

      if (this.state.counter === guarantee5Count) {
        console.log("触发保底");
        return this.doRarityGachaOnce(4);
      }
    }

    return { charId, rarity };
  }
}
