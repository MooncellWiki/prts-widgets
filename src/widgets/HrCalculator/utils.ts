import { makeJsonEncoder, makeJsonDecoder } from "@urlpack/json";
// bitmap的格式是 职业 位置 稀有度 词缀
export const profession = [
  "近卫",
  "狙击",
  "重装",
  "医疗",
  "辅助",
  "术师",
  "特种",
  "先锋",
];
export const position = ["近战位", "远程位"];
export const rarity = ["高级资深干员", "资深干员", "新手"];
export const tag = [
  "支援机械",
  "控场",
  "爆发",
  "治疗",
  "支援",
  "费用回复",
  "输出",
  "生存",
  "群攻",
  "防护",
  "减速",
  "削弱",
  "快速复活",
  "位移",
  "召唤",
];
export const all = [...profession, ...position, ...rarity, ...tag];
export const professionIndex =
  profession.length + position.length + rarity.length + tag.length - 1;
export const positionIndex = position.length + rarity.length + tag.length - 1;
export const rarityIndex = rarity.length + tag.length - 1;
export const tagIndex = tag.length - 1;
export interface Source {
  profession: string;
  position: string;
  rarity: number;
  tag: string[];
  zh: string;
  subset: number[];
  obtainMethod: string[];
}
export class BitMap {
  value: number;
  constructor(value = 0) {
    this.value = value;
  }

  get(index: number) {
    return this.value & (1 << index);
  }

  set(index: number) {
    this.value = this.value | (1 << index);
  }

  clear(index: number) {
    this.value = this.value ^ (1 << index);
  }

  range(lo: number, hi: number) {
    const mask = (1 << (hi + 1)) - 1 - ((1 << (lo + 1)) - 1);
    return this.value & mask;
  }

  // 计算有多少个1
  count() {
    let res = 0;
    let tmp = this.value;
    while (tmp !== 0) {
      tmp = tmp & (tmp - 1);
      res++;
    }
    return res;
  }

  // 获得所有是1的index
  getIndict(): number[] {
    const result = [];
    let value = this.value;
    let index = 0;
    while (value > 0) {
      if ((value & 1) === 1) result.push(index);

      index++;
      value = value >> 1;
    }
    return result;
  }

  // 不包过空集
  getSubSet(): number[] {
    const result = [];
    const selfIndices = this.getIndict();
    for (let i = new BitMap(0); i.value < 1 << selfIndices.length; i.value++) {
      let tmp = 0;
      const indices = i.getIndict();
      for (const index of indices) {
        tmp = tmp | (1 << selfIndices[index]);
      }
      if (tmp !== 0) result.push(tmp);
    }
    return result;
  }
}
export class Char {
  bitmap: BitMap;
  constructor(i = 0) {
    this.bitmap = new BitMap(i);
  }

  selectAllProfession() {
    for (const [i] of profession.entries()) {
      this.bitmap.set(professionIndex - i);
    }
  }

  unselectAllProfession() {
    for (const [i] of profession.entries()) {
      if (this.bitmap.get(professionIndex - i) !== 0)
        this.bitmap.clear(professionIndex - i);
    }
  }

  isProfessionEmpty() {
    return (
      this.bitmap.range(
        professionIndex - profession.length,
        professionIndex,
      ) === 0
    );
  }

  selectAllPosition() {
    for (const [i] of position.entries()) {
      this.bitmap.set(positionIndex - i);
    }
  }

  isPositionEmpty() {
    return (
      this.bitmap.range(positionIndex - position.length, positionIndex) === 0
    );
  }

  unselectAllPosition() {
    for (const [i] of position.entries()) {
      if (this.bitmap.get(positionIndex - i) !== 0)
        this.bitmap.clear(positionIndex - i);
    }
  }

  selectAllRarity() {
    for (const [i] of rarity.entries()) {
      this.bitmap.set(rarityIndex - i);
    }
  }

  unselectAllRarity() {
    for (const [i] of rarity.entries()) {
      if (this.bitmap.get(rarityIndex - i) !== 0)
        this.bitmap.clear(rarityIndex - i);
    }
  }

  isRarityEmpty() {
    return this.bitmap.range(rarityIndex - rarity.length, rarityIndex) === 0;
  }

  selectAllTag() {
    for (const [i] of tag.entries()) {
      this.bitmap.set(tagIndex - i);
    }
  }

  unselectAllTag() {
    for (const [i] of tag.entries()) {
      if (this.bitmap.get(tagIndex - i) !== 0) this.bitmap.clear(tagIndex - i);
    }
  }

  isTagEmpty() {
    return this.bitmap.range(tagIndex - tag.length, tagIndex) === 0;
  }

  static fromSource(source: Source): Char {
    const char = new Char();
    char.bitmap.value = 0;
    char.bitmap.set(professionIndex - profession.indexOf(source.profession));
    char.bitmap.set(positionIndex - position.indexOf(source.position));
    if (source.rarity === 4)
      char.bitmap.set(rarityIndex - rarity.indexOf("资深干员"));
    else if (source.rarity === 5)
      char.bitmap.set(rarityIndex - rarity.indexOf("高级资深干员"));
    for (const v of source.tag) {
      if (v === "新手") {
        char.bitmap.set(rarityIndex - rarity.indexOf("新手"));
        continue;
      }
      char.bitmap.set(tagIndex - tag.indexOf(v));
    }
    return char;
  }

  dump(): string {
    const encoder = makeJsonEncoder();
    const professionState = this.bitmap.range(
      professionIndex - profession.length,
      professionIndex,
    );
    const positionState = this.bitmap.range(
      positionIndex - position.length,
      positionIndex,
    );
    const rarityState = this.bitmap.range(
      rarityIndex - rarity.length,
      rarityIndex,
    );
    const tagState = this.bitmap.range(tagIndex - tag.length, tagIndex);
    const payload = {
      profession:
        professionState >> (position.length + rarity.length + tag.length),
      position: positionState >> (rarity.length + tag.length),
      rarity: rarityState >> tag.length,
      tag: tagState,
    };

    return encoder.encode(payload);
  }

  load(encoded: string) {
    const decoder = makeJsonDecoder();
    const indexes = {
      profession: position.length + rarity.length + tag.length,
      position: rarity.length + tag.length,
      rarity: tag.length,
      tag: 0,
    };
    for (const [k, v] of Object.entries(
      decoder.decode(encoded) as Record<string, number>,
    )) {
      const index = indexes[k as "profession" | "position" | "rarity" | "tag"];
      const binaryString = (v >>> 0).toString(2);
      let loopCount = 0;
      for (const c of [...binaryString].reverse()) {
        if (c !== "0") this.bitmap.set(index + loopCount);
        loopCount++;
      }
    }
  }
}

export function can5(num: number) {
  const bm = new BitMap(num);
  return bm.get(rarityIndex - rarity.indexOf("高级资深干员")) !== 0;
}
export function number2names(num: number): string[] {
  const bitmap = new BitMap(num);
  return bitmap.getIndict().map((v) => {
    if (v <= tagIndex) return tag[tagIndex - v];
    if (v <= rarityIndex) return rarity[rarityIndex - v];
    if (v <= positionIndex) return position[positionIndex - v];
    if (v <= professionIndex) return profession[professionIndex - v];
    throw new Error(`unknown: ${v}`);
  });
}
