import { isClient } from "@vueuse/core";
import MD5 from "md5";

import { MEDIA_ENDPOINT } from "./consts";

export function getImagePath(filename: string) {
  const md5 = MD5(filename);
  return `${MEDIA_ENDPOINT}/${md5.slice(0, 1)}/${md5.slice(0, 2)}/${filename}`;
}

export async function getImagePathWithRedirect(filename: string) {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "query",
      titles: `File:${filename}`,
      redirects: "1",
      format: "json",
    })}`,
  );
  const data = await resp.json();

  if (data.query?.redirects) {
    filename = (data.query.redirects[0].to || filename)
      .replaceAll(" ", "_")
      .replace("文件:", "");
  }

  return getImagePath(filename);
}

export const professionMap = {
  PIONEER: "先锋",
  WARRIOR: "近卫",
  SNIPER: "狙击",
  SUPPORT: "辅助",
  CASTER: "术师",
  SPECIAL: "特种",
  MEDIC: "医疗",
  TANK: "重装",
};

export function sum(arr: Array<number>) {
  return arr.reduce((acc, cur) => acc + cur, 0);
}

export function isMobile(): boolean {
  if (!isClient) return false;
  return /(phone|pad|pod|iphone|ipod|ios|ipad|android|mobile|blackberry|iemobile|mqqbrowser|juc|fennec|wosbrowser|browserng|webos|symbian|windows phone)/i.test(
    window.navigator.userAgent,
  );
}
export function isMobileSkin(): boolean {
  if (!isClient) return false;
  return !!document.querySelector("body")?.classList.contains("skin-minerva");
}
export function isFirefox(): boolean {
  return window.navigator.userAgent.includes("Firefox");
}

export function downloadBlob(b: Blob, filename: string): void {
  const url = URL.createObjectURL(b);
  const ele = window.document.createElement("a");
  ele.href = url;
  ele.download = `${filename}.webm`;
  ele.click();
}
