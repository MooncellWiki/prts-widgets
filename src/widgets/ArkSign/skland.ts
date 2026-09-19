import md5 from "md5";

import type { PlayerBindingResp, PlayerInfoResp } from "./types";

const host = "https://zonai.skland.com";
// const playerInfoAPI = '/api/v1/game/player/info'
// const playerBindingAPI = '/api/v1/game/player/binding'

async function hmacSHA256Hex(message: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(message),
  );
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

async function getSign(path: string, requestParam = "", secret: string) {
  const timestamp = Math.floor(Date.now() / 1000 - 1).toString();

  const headers = {
    platform: "3",
    timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
  };
  const message = path + requestParam + timestamp + JSON.stringify(headers);
  const sign = md5(await hmacSHA256Hex(message, secret));
  return { timestamp, sign };
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

  const { timestamp, sign } = await getSign(path, requestParam, secret);

  const url = `${host}${path}`;
  const headers = {
    platform: "3",
    timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
    cred,
    sign,
  };

  const resp = await fetch(url, {
    headers,
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
  const { timestamp, sign } = await getSign(path, requestParam, secret);
  const url = `${host}${path}?${requestParam}`;
  // console.log(url)
  const headers = {
    platform: "3",
    timestamp,
    dId: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    vName: "1.2.0",
    cred,
    sign,
  };

  const resp = await fetch(url, {
    headers,
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
