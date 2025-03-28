import { RarityRank } from "../consts";
import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
} from "../gamedata-types";
import {
  type GachaAvailChar,
  type GachaPoolClientData as GachaServerPool,
  type GachaUpChar,
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
  applyEnsureDoubleUp6StarRule,
  applyEnsureUp6StarRule,
  getUp5StarUngottenList,
  hasOneOf5StarCharGotten,
  hasOneOfUp6StarCharUngotten,
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
    gachaServerPool: GachaServerPool,
    gachaClientPool?: GachaClientPool,
  ) {
    if (!gachaClientPool) throw new Error("gachaClientPool is null");

    this.availCharInfo =
      gachaServerPool.gachaPoolDetail.detailInfo.availCharInfo;
    this.upCharInfo = gachaServerPool.gachaPoolDetail.detailInfo.upCharInfo;
    this.gachaRuleType = gachaClientPool.gachaRuleType;

    let guarantee6Up6Avail = 0;
    let guarantee6Up6Count = 0;
    let guarantee6DoubleUp6Count = 0;

    if (this.gachaRuleType === GachaRuleType.SINGLE) {
      guarantee6Up6Avail = 1;
      guarantee6Up6Count = 150;
    }

    if (
      this.gachaRuleType === GachaRuleType.DOUBLE ||
      this.gachaRuleType === GachaRuleType.CLASSIC_DOUBLE
    ) {
      guarantee6Up6Avail = 2;
      guarantee6Up6Count = 150;
      guarantee6DoubleUp6Count = 300;
    }

    if (this.gachaRuleType === GachaRuleType.LINKAGE) {
      guarantee6Up6Avail = 1;
      guarantee6Up6Count =
        gachaClientPool.linkageParam.guaranteeTarget6Count || 120;
    }

    this.config = {
      guarantee5Avail: gachaClientPool.guarantee5Avail,
      guarantee5Count: gachaClientPool.guarantee5Count,
      guarantee6Up6Avail,
      guarantee6Up6Count,
      guarantee6DoubleUp6Count,
      guarantee6Avail: 0,
      guarantee6Count: 0,
      gachaTimes: Number.POSITIVE_INFINITY,
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

    // SINGLE 150 抽保底单 UP 六星
    if (
      (this.gachaRuleType === GachaRuleType.SINGLE ||
        this.gachaRuleType === GachaRuleType.LINKAGE) &&
      shouldApplyEnsureUp6StarRule(this.state)
    ) {
      const up6StarCharId = getUpListWithRarity(
        RarityRank.TIER_6,
        this.upCharInfo,
      )?.charIdList[0];
      if (!up6StarCharId)
        throw new Error(
          `[doGachaOnce] Empty 6 star upCharId when applying ensureUp6StarRule for gacha rule type ${this.gachaRuleType}`,
        );

      const ruleResult = applyEnsureUp6StarRule(this.state, up6StarCharId);
      if (ruleResult) result = ruleResult;
    }

    // DOUBLE 150 抽、300 抽保底双 UP 六星
    if (
      this.gachaRuleType === GachaRuleType.DOUBLE ||
      this.gachaRuleType === GachaRuleType.CLASSIC_DOUBLE
    ) {
      const up6StarCharIds = getUpListWithRarity(
        RarityRank.TIER_6,
        this.upCharInfo,
      )?.charIdList;
      if (!up6StarCharIds)
        throw new Error(
          `[doGachaOnce] Empty 6 star upCharId when applying ensureDoubleUp6StarRule for gacha rule type ${this.gachaRuleType}`,
        );

      if (hasOneOfUp6StarCharUngotten(this.state, up6StarCharIds)) {
        const ruleResult = applyEnsureDoubleUp6StarRule(
          this.state,
          up6StarCharIds,
        );
        if (ruleResult) result = ruleResult;
      }
    }

    // LINKAGE 联动多 Up 5 星保底另一 Up 5 星角色
    if (
      this.gachaRuleType === GachaRuleType.LINKAGE &&
      rarity === RarityRank.TIER_5 &&
      hasOneOf5StarCharGotten(this.state, this.upCharInfo)
    ) {
      const up5StarUngottenList = getUp5StarUngottenList(
        this.state,
        this.upCharInfo,
      );
      if (up5StarUngottenList.length > 0) {
        const charId = up5StarUngottenList[0];
        console.log("[doGachaOnce]", "联动保底 5 星角色", charId);
        result = { charId, rarity: RarityRank.TIER_5 };
      }
    }

    if (this.state.results[result.charId]) this.state.results[result.charId]++;
    else this.state.results[result.charId] = 1;

    // 6 星计数
    if (result.rarity === RarityRank.TIER_6) this.state.non6StarCount = 0;
    else this.state.non6StarCount++;

    return result;
  }
}
