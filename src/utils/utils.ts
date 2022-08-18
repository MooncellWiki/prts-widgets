import MD5 from "md5";
export const apiEndPoint = "https://api.prts.wiki";
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
