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

export class GachaState {}

export class GachaExecutor {
  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar;
  counter: number = 0;
  isGotFirst5Star: boolean = false;

  constructor(availCharInfo: GachaAvailChar, upCharInfo: GachaUpChar) {
    this.availCharInfo = availCharInfo;
    this.upCharInfo = upCharInfo;
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

    this.counter++;
    if (!this.isGotFirst5Star) {
      // 5 星保底
      if (this.counter <= 10 && rarity == 4) {
        this.isGotFirst5Star = true;
        console.log("在第 10 抽前已有五星，跳过保底");
      }

      if (this.counter === 10) {
        console.log("触发保底");
        return this.doRarityGachaOnce(4);
      }
    }

    return { charId, rarity };
  }
}
