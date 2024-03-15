import MD5 from "md5";

export const charListData = {
  uhs: "7/7f/干员图鉴_uh_阴影.png",
  lh: (r: number) => {
    const _lh = [
      "0/0b/干员图鉴_lh_0%2C1%2C2.png",
      "a/a5/干员图鉴_lh_3.png",
      "9/9e/干员图鉴_lh_4.png",
      "a/a5/干员图鉴_lh_5.png",
    ];
    return r < 3 ? _lh[0] : _lh[r - 2];
  },
  bg: (r: number) => {
    const _bg = [
      "2/25/干员图鉴_背景_0%2C1%2C2.png",
      "b/b1/干员图鉴_背景_3.png",
      "a/ad/干员图鉴_背景_4.png",
      "c/c9/干员图鉴_背景_5.png",
    ];
    return r < 3 ? _bg[0] : _bg[r - 2];
  },
  patch: "2/20/干员图鉴_补丁.png",
};

export function getImagePath(filename: string) {
  const md5 = MD5(filename);
  return `${md5.slice(0, 1)}/${md5.slice(0, 2)}/${filename}`;
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
  return /(phone|pad|pod|iphone|ipod|ios|ipad|android|mobile|blackberry|iemobile|mqqbrowser|juc|fennec|wosbrowser|browserng|webos|symbian|windows phone)/i.test(
    window.navigator.userAgent,
  );
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
