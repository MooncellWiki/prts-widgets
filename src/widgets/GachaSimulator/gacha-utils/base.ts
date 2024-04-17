import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
} from "../gamedata-types";
import type {
  GachaAvailChar,
  GachaPoolClientData as GachaServerPool,
  GachaUpChar,
} from "../types";

import {
  createGachaState,
  getRandomCharWithRarity,
  getRandomRarity,
  getUpListWithRarity,
  type GachaConfig,
  type GachaState,
} from "./common";
import {
  applyEnsure5StarRule,
  applyEnsureUp6StarRule,
  hasOneOf5StarCharGotten,
  shouldApplyEnsure5StarRule,
  shouldApplyEnsureUp6StarRule,
} from "./rule";

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
      gachaTimes: Number.POSITIVE_INFINITY,
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
