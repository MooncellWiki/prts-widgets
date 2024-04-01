import hmacSHA256 from "crypto-js/hmac-sha256";
import md5 from "crypto-js/md5";

const host = "https://zonai.skland.com";
// const playerInfoAPI = '/api/v1/game/player/info'
// const playerBindingAPI = '/api/v1/game/player/binding'

function getSign(path: string, requestParam = "", secret: string) {
  const timestamp = Math.floor(Date.now() / 1000 - 1).toString();

  const headers = {
    platform: "3",
    timestamp: timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
  };
  const message = path + requestParam + timestamp + JSON.stringify(headers);
  const sign = md5(hmacSHA256(message, secret).toString()).toString();
  return { timestamp, sign };
}
export interface BindingListItem {
  uid: string;
  isOfficial: boolean;
  isDelete: boolean;
  nickName: string;
  channelName: string;
  channelMasterId: string;
}
interface PlayerBindingResp {
  code: number;
  data: {
    list: Array<{
      appCode: string;
      appName: string;
      bindingList: BindingListItem[];
    }>;
  };
}
export interface CharInfo {
  id: string;
  name: string;
  nationId: string;
  /**
   * GroupID
   * @enum {string}
   */
  groupId:
    | ""
    | "lgd"
    | "elite"
    | "penguin"
    | "dublinn"
    | "abyssal"
    | "rhine"
    | "blacksteel"
    | "glasgow"
    | "babel"
    | "sweep"
    | "karlan"
    | "sui"
    | "siesta"
    | "pinus";
  displayNumber: string;
  rarity: number;
  /**
   * Profession
   * @enum {string}
   */
  profession:
    | "CASTER"
    | "MEDIC"
    | "WARRIOR"
    | "SUPPORT"
    | "SNIPER"
    | "SPECIAL"
    | "PIONEER"
    | "TANK";
  subProfessionId: string;
}
export interface Char {
  /**
   * @description In-game Operator (干员) ID.
   * @example char_1028_texas2
   */
  charId: string;
  /**
   * @description In-game Skin (干员服装) ID.
   * @example char_1028_texas2#2
   */
  skinId: string;
  /** @description Operator's level (干员等级). Maximum value depends on the rarity of the operator. */
  level: number;
  /**
   * @description Operator's current evolution phase (精英化等级). Maximum value depends on the rarity of the operator.
   * @enum {integer}
   */
  evolvePhase: 0 | 1 | 2;
  /**
   * @description Operator's potential rank (潜能等级). Maximum value is 6. Initial value is 1 (right after the user acquired the operator).
   * @enum {integer}
   */
  potentialRank: 1 | 2 | 3 | 4 | 5 | 6;
  /** @description Operator's current skill (技能) level (技能等级). This level does not include the "specialize" level (专精等级). */
  mainSkillLvl: number;
  /** @description All available skills (技能) of the operator. */
  skills: {
    /** @description In-game Skill (技能) ID. */
    id: string;
    /** @description Operator's current skill (技能) specialize level (专精等级). */
    specializeLevel: number;
  }[];
  /** @description All available equipments (模组) of the operator. */
  equip: {
    /** @description In-game Equipment (模组) ID. */
    id: string;
    /** @description Equipment's level (模组等级). */
    level: number;
  }[];
  /** @description Operator's favor (信赖值) percentage. Maximum value is 200. Initial value is 0 (right after the user acquired the operator). */
  favorPercent: number;
  /**
   * @description Operator's default skill (默认技能) ID.
   * @example skchr_texas2_1
   */
  defaultSkillId: string;
  /**
   * @description Timestamp (in seconds) when the user acquired the operator.
   * @example 1609459200
   */
  gainTime: number;
  /**
   * @description Operator's default equipment (默认模组) ID.
   * @example equip_1028_texas2
   */
  defaultEquipId: string;
}
export interface EquipInfo {
  id: string;
  name: string;
  desc: string;
  typeIcon: string;
  typeName1: string;
  /**
   * ShiningColor
   * @enum {string}
   */
  shiningColor: "grey" | "red" | "yellow" | "blue" | "green";
  /**
   * TypeName2
   * @enum {string}
   */
  typeName2?: "X" | "Y";
}
export interface PlayerInfo {
  /**
   * Status
   * @description User profile and status
   */
  status: {
    /**
     * Format: integer
     * @description In-game ID. Also found at the home page of the game, located at the left of the screen.
     */
    uid: string;
    /** @description In-game nickname. Also found at the home page of the game, located at the left of the screen. */
    name: string;
    /** @description Current level of the user. Maximum level is 120. */
    level: number;
    /** Avatar */
    avatar: {
      /** @enum {string} */
      type: "ICON";
      /**
       * @description In-game avatar ID.
       * @example avatar_special_06
       */
      id: string;
    };
    /**
     * @description Timestamp (in seconds) of the in-game account creation time.
     * @example 1584537600
     */
    registerTs: number;
    /**
     * @description Current progress of the main story. Value is a stageId string.
     * @example main_01-01
     */
    mainStageProgress: string;
    /**
     * Secretary
     * @description User's secretary (助理).
     */
    secretary: {
      /**
       * @description In-game character ID.
       * @example char_002_amiya
       */
      charId: string;
      /**
       * @description In-game skin ID.
       * @example char_002_amiya_1
       */
      skinId: string;
    };
    /**
     * @description User's biography (签名).
     * @default 相关功能优化中，签名暂无法保存，请等待后续开放。（修改任务不受影响）
     */
    resume: string;
    /**
     * @description Timestamp (in seconds) of the monthly subscription (月卡) end time. Unsure about the scenario where the user does not have a monthly subscription.
     * @example 1584537600
     */
    subscriptionEnd: number;
    /**
     * Ap
     * @description User's AP (理智).
     */
    ap: {
      /**
       * @description Current AP (理智).
       * @example 28
       */
      current: number;
      /**
       * @description Maximum AP (理智). The maximum AP depends on the user's level.
       * @example 135
       */
      max: number;
      /**
       * @description Timestamp (in seconds) of the last AP (理智) addition time.
       * @example 1584537600
       */
      lastApAddTime: number;
      /**
       * @description Timestamp (in seconds) of when the AP (理智) will be fully recovered to the current maximum AP (理智) of the user.
       * @example 1584537600
       */
      completeRecoveryTime: number;
    };
    storeTs: number;
    /**
     * @description Timestamp (in seconds) of the last online time.
     * @example 1584537600
     */
    lastOnlineTs: number;
    /**
     * @description Total number of characters (干员) owned by the user. However, this value is currently always 0.
     * @example 0
     */
    charCnt: number;
    /**
     * @description Total number of furniture (家具) owned by the user. However, this value is currently always 0.
     * @example 0
     */
    furnitureCnt: number;
    /**
     * @description Total number of skins (服装) owned by the user. However, this value is currently always 0.
     * @example 0
     */
    skinCnt: number;
  };
  /** EquipmentInfoMap */
  equipmentInfoMap: Record<string, EquipInfo>;
  /** @description List of operators (干员) the user owns. */
  chars: Char[];
  /** CharInfoMap */
  charInfoMap: Record<string, CharInfo>;
}
interface PlayerInfoResp {
  code: number;
  data: PlayerInfo;
}
export async function getPlayerBinding(
  requestParam = "",
  secret: string,
  cred: string,
) {
  const path = "/api/v1/game/player/binding";
  cred = cred.replaceAll(/\s+/g, "");
  cred = cred.replaceAll(/["']/g, "");

  secret = secret.replaceAll(/\s+/g, "");
  secret = secret.replaceAll(/["']/g, "");

  const { timestamp, sign } = getSign(path, requestParam, secret);

  const url = `${host}${path}`;
  const headers = {
    platform: "3",
    timestamp: timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
    cred: cred,
    sign: sign,
  };

  const resp = await fetch(url, {
    headers: headers,
    method: "get",
  });
  const data: PlayerBindingResp = await resp.json();
  if (data.code !== 0) {
    throw new Error("查询森空岛api失败");
  }
  const list = data.data.list;

  const bindingList =
    list.find((v) => v.appCode === "arknights")?.bindingList || [];
  if (bindingList.length === 0) {
    throw new Error("未绑定账号");
  }
  // 有官服用官服
  const official = bindingList.find((v) => v.isOfficial);
  if (official) {
    const { uid, nickName, channelMasterId } = official;
    return {
      bindingList,
      uid,
      nickName,
      server: channelMasterId,
    };
  }
  // 没有就用第一个
  const { uid, nickName, channelMasterId } = bindingList[0];
  return {
    bindingList,
    uid,
    nickName,
    server: channelMasterId,
  };
}

export async function getPlayerInfo(
  requestParam = "",
  secret: string,
  cred: string,
  uid: string,
) {
  const path = "/api/v1/game/player/info";
  const { timestamp, sign } = getSign(path, requestParam, secret);
  const url = `${host}${path}?${requestParam}`;
  // console.log(url)
  const headers = {
    platform: "3",
    timestamp: timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
    cred: cred,
    sign: sign,
  };

  const resp = await fetch(url, {
    headers: headers,
    method: "get",
  });
  const json: PlayerInfoResp = await resp.json();
  const { data, code } = json;
  if (code !== 0) {
    throw new Error("查询森空岛api失败");
  }
  const {
    charInfoMap,
    equipmentInfoMap,
    chars,
    status: { name: nickName, avatar, level },
  } = data;
  return {
    nickName,
    avatar,
    level,
    uid,
    chars,
    charInfoMap,
    equipmentInfoMap,
  };
}
