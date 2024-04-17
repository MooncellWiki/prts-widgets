import {
  GachaRuleType,
  NewbeeGachaPoolClientData,
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
  // 6 星 50 抽概率增加
  for (const availList of perAvailList) {
    let finalPercent = availList.totalPercent * 100;
    if (state.non6StarCount >= 50 && availList.rarityRank === 5) {
      const bonusCount = state.non6StarCount - 50 + 1;
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
  if (state.counter < state.guarantee6Count && rarity >= 5) {
    state.guarantee6Avail--;
    console.log(`在第 ${state.guarantee6Count} 抽前已有六星及以上，已完成保底`);
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

function createGachaState(config: GachaConfig) {
  return { ...config, counter: 0, results: {}, non6StarCount: 0 };
}

export class GachaExecutor {
  gachaRuleType: GachaRuleType = GachaRuleType.NORMAL;
  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar;
  state: GachaState;
  config: GachaConfig;

  constructor(
    gachaClientPool: GachaClientPool | null,
    gachaServerPool: GachaServerPool,
  ) {
    if (!gachaClientPool) throw new Error("gachaClientPool is null");

    this.availCharInfo =
      gachaServerPool.gachaPoolDetail.detailInfo.availCharInfo;
    this.upCharInfo = gachaServerPool.gachaPoolDetail.detailInfo.upCharInfo;
    this.gachaRuleType = gachaClientPool.gachaRuleType;

    let guarantee6Up6Avail = 0;
    let guarantee6Up6Count = 0;

    if (this.gachaRuleType === GachaRuleType.SINGLE) {
      guarantee6Up6Avail = 1;
      guarantee6Up6Count = 150;
    }

    if (this.gachaRuleType === GachaRuleType.LINKAGE) {
      guarantee6Up6Avail = 1;
      guarantee6Up6Count =
        gachaClientPool.linkageParam.guaranteeTarget6Count || 120;
    }

    this.config = {
      guarantee5Avail: gachaClientPool.guarantee5Avail,
      guarantee5Count: gachaClientPool.guarantee5Count,
      guarantee6Up6Avail: guarantee6Up6Avail,
      guarantee6Up6Count: guarantee6Up6Count,
      guarantee6Avail: -1,
      guarantee6Count: -1,
      gachaTimes: -1,
    };

    this.state = createGachaState(this.config);
  }

  resetState() {
    this.state = createGachaState(this.config);
  }

  doGachaOnce() {
    const rarity = getRandomRarity(this.state, this.availCharInfo.perAvailList);
    if (rarity === null) throw new Error("rarity is null");

    const { charId } = getRandomCharWithRarity(
      this.availCharInfo.perAvailList,
      this.upCharInfo,
      rarity,
    );
    if (charId === null) throw new Error("charId is null");

    if (this.state.counter >= this.config.gachaTimes) {
      return null;
    }

    this.state.counter++;

    // 6星计数
    if (rarity === 5) this.state.non6StarCount = 0;
    else this.state.non6StarCount++;

    let result = { charId, rarity };

    // 前10次抽卡5星保底
    if (shouldApplyEnsure5StarRule(this.state)) {
      const ruleResult = applyEnsure5StarRule(
        this.state,
        this.availCharInfo.perAvailList,
        this.upCharInfo,
        rarity,
      );
      if (ruleResult) result = ruleResult;
    }

    // gachaRuleType: SINGLE 150 抽保底单 UP 六星
    if (
      (this.gachaRuleType === GachaRuleType.SINGLE ||
        this.gachaRuleType === GachaRuleType.LINKAGE) &&
      shouldApplyEnsureUp6StarRule(this.state)
    ) {
      const up6StarCharId = getUpListWithRarity(this.upCharInfo, 5)
        ?.charIdList[0];
      if (!up6StarCharId)
        throw new Error(
          `Empty 6 star upCharId when applying ensureUp6StarRule for gacha rule type ${this.gachaRuleType}`,
        );

      const ruleResult = applyEnsureUp6StarRule(this.state, up6StarCharId);
      if (ruleResult) result = ruleResult;
    }

    if (
      this.gachaRuleType === GachaRuleType.LINKAGE &&
      rarity === 4 &&
      hasOneOf5StarCharGotten(this.state, this.upCharInfo)
    ) {
      // 保底单角色
    }

    if (this.state.results[result.charId]) this.state.results[result.charId]++;
    else this.state.results[result.charId] = 1;

    return result;
  }
}

export class NewbeeGachaExecutor {
  gachaRuleType: GachaRuleType = GachaRuleType.NEWBEE;

  availCharInfo: GachaAvailChar;
  upCharInfo: GachaUpChar | null;

  state: GachaState;
  config: GachaConfig;

  newbeeClientPool: NewbeeGachaPoolClientData;

  constructor(
    gachaClientPool: NewbeeGachaPoolClientData | null,
    gachaServerPool: GachaServerPool,
  ) {
    if (gachaClientPool === null) throw new Error("gachaClientPool is null");

    this.availCharInfo =
      gachaServerPool.gachaPoolDetail.detailInfo.availCharInfo;
    this.upCharInfo = gachaServerPool.gachaPoolDetail.detailInfo.upCharInfo;
    this.newbeeClientPool = gachaClientPool;

    this.config = {
      guarantee5Avail: 1,
      guarantee5Count: gachaClientPool.gachaTimes,
      guarantee6Up6Avail: -1,
      guarantee6Up6Count: -1,
      guarantee6Avail: 1,
      guarantee6Count: gachaClientPool.gachaTimes,
      gachaTimes: gachaClientPool.gachaTimes,
    };
    this.state = createGachaState(this.config);
  }

  resetState() {
    this.state = createGachaState(this.config);
  }

  doGachaOnce() {
    const rarity = getRandomRarity(this.state, this.availCharInfo.perAvailList);
    if (rarity === null) throw new Error("rarity is null");

    const { charId } = getRandomCharWithRarity(
      this.availCharInfo.perAvailList,
      this.upCharInfo,
      rarity,
    );
    if (charId === null) throw new Error("charId is null");

    if (this.state.counter >= this.config.gachaTimes) {
      return null;
    }

    this.state.counter++;

    // 6星计数
    if (rarity === 5) this.state.non6StarCount = 0;
    else this.state.non6StarCount++;

    let result = { charId, rarity };

    // 前10次抽卡5星保底
    if (shouldApplyEnsure5StarRule(this.state)) {
      const ruleResult = applyEnsure5StarRule(
        this.state,
        this.availCharInfo.perAvailList,
        this.upCharInfo,
        rarity,
      );
      if (ruleResult) result = ruleResult;
    }

    if (shouldApplyEnsure6StarRule(this.state)) {
      const ruleResult = applyEnsure6StarRule(
        this.state,
        this.availCharInfo.perAvailList,
        this.upCharInfo,
        rarity,
      );
      if (ruleResult) result = ruleResult;
    }

    if (this.state.results[result.charId]) this.state.results[result.charId]++;
    else this.state.results[result.charId] = 1;

    return result;
  }
}
