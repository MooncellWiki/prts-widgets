import { RarityRank } from "../consts";
import {
  GachaRuleType,
  type NewbeeGachaPoolClientData,
} from "../gamedata-types";

import {
  type GachaConfig,
  type GachaState,
  createGachaState,
  getRandomCharWithRarity,
  getRandomRarity,
} from "./common";
import {
  applyEnsure5StarRule,
  applyEnsure6StarRule,
  shouldApplyEnsure5StarRule,
  shouldApplyEnsure6StarRule,
} from "./rule";

import type {
  GachaAvailChar,
  GachaPoolClientData as GachaServerPool,
  GachaUpChar,
} from "../types";

export class NewbeeGachaExecutor {
  gachaRuleType: GachaRuleType = GachaRuleType.NEWBEE;

  availCharInfo: GachaAvailChar;
  upCharInfo?: GachaUpChar;

  state: GachaState;
  config: GachaConfig;

  newbeeClientPool: NewbeeGachaPoolClientData;

  constructor(
    gachaServerPool: GachaServerPool,
    gachaClientPool?: NewbeeGachaPoolClientData,
  ) {
    if (!gachaClientPool) throw new Error("gachaClientPool is null");

    this.availCharInfo =
      gachaServerPool.gachaPoolDetail.detailInfo.availCharInfo;
    this.upCharInfo = gachaServerPool.gachaPoolDetail.detailInfo.upCharInfo;
    this.newbeeClientPool = gachaClientPool;

    this.config = {
      guarantee5Avail: 1,
      guarantee5Count: gachaClientPool.gachaTimes,
      guarantee6Up6Avail: -1,
      guarantee6Up6Count: -1,
      guarantee6DoubleUp6Count: -1,
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

    const { charId } = getRandomCharWithRarity(
      this.availCharInfo.perAvailList,
      rarity,
      this.upCharInfo,
    );

    if (this.state.counter >= this.config.gachaTimes) {
      return null;
    }

    this.state.counter++;

    let result = { charId, rarity };

    // 前 10 次抽卡 5 星保底
    if (shouldApplyEnsure5StarRule(this.state)) {
      const ruleResult = applyEnsure5StarRule(
        this.state,
        this.availCharInfo.perAvailList,
        rarity,
        this.upCharInfo,
      );
      if (ruleResult) result = ruleResult;
    }

    // 21 抽 6 星保底
    if (shouldApplyEnsure6StarRule(this.state)) {
      const ruleResult = applyEnsure6StarRule(
        this.state,
        this.availCharInfo.perAvailList,
        rarity,
        this.upCharInfo,
      );
      if (ruleResult) result = ruleResult;
    }

    if (this.state.results[result.charId]) this.state.results[result.charId]++;
    else this.state.results[result.charId] = 1;

    // 6 星计数
    if (result.rarity === RarityRank.TIER_6) this.state.non6StarCount = 0;
    else this.state.non6StarCount++;

    return result;
  }
}
