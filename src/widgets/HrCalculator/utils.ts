// bitmap的格式是 职业 位置 稀有度 词缀
export const profession = ['先锋', '近卫', '狙击', '重装', '医疗', '辅助', '术师', '特种']
export const position = ['近战位', '远程位']
export const rarity = ['新手', '资深干员', '高级资深干员']
export const tag = ['治疗', '支援', '输出', '群攻', '减速', '生存', '防护', '削弱', '位移', '控场', '爆发', '召唤', '快速复活', '费用回复', '支援机械']
export const all = [...profession, ...position, ...rarity, ...tag]
export const professionIndex = profession.length + position.length + rarity.length + tag.length - 1
export const positionIndex = position.length + rarity.length + tag.length - 1
export const rarityIndex = rarity.length + tag.length - 1
export const tagIndex = tag.length - 1
export interface Source {
  profession: string
  position: string
  rarity: number
  tag: string[]
  zh: string
  subset: number[]
}
export class BitMap {
  value: number
  constructor(value = 0) {
    this.value = value
  }

  get(index: number) {
    return this.value & (1 << index)
  }

  set(index: number) {
    this.value = this.value | (1 << index)
  }

  clear(index: number) {
    this.value = this.value ^ (1 << index)
  }

  range(lo: number, hi: number) {
    const mask = (1 << (hi + 1)) - 1 - ((1 << (lo + 1)) - 1)
    return this.value & mask
  }

  // 计算有多少个1
  count() {
    let res = 0
    let tmp = this.value
    while (tmp !== 0) {
      tmp = tmp & (tmp - 1)
      res++
    }
    return res
  }

  // 获得所有是1的index
  getIndict(): number[] {
    const result = []
    let value = this.value
    let index = 0
    while (value > 0) {
      if ((value & 1) === 1)
        result.push(index)

      index++
      value = value >> 1
    }
    return result
  }

  getSubSet(): number[] {
    const result = []
    const selfIndices = this.getIndict()
    for (let i = new BitMap(0); i.value < (1 << selfIndices.length); i.value++) {
      let tmp = 0
      const indices = i.getIndict()
      indices.forEach((index) => {
        tmp = tmp | (1 << selfIndices[index])
      })
      result.push(tmp)
    }
    return result
  }
}
export class Char {
  bitmap: BitMap
  constructor(i = 0) {
    this.bitmap = new BitMap(i)
  }

  selectAllProfession() {
    profession.forEach((v, i) => {
      this.bitmap.set(professionIndex - i)
    })
  }

  unselectAllProfession() {
    profession.forEach((v, i) => {
      if (this.bitmap.get(professionIndex - i) !== 0)
        this.bitmap.clear(professionIndex - i)
    })
  }

  isProfessionEmpty() {
    return this.bitmap.range(professionIndex - profession.length, professionIndex) === 0
  }

  selectAllPosition() {
    position.forEach((v, i) => {
      this.bitmap.set(positionIndex - i)
    })
  }

  isPositionEmpty() {
    return this.bitmap.range(positionIndex - position.length, positionIndex) === 0
  }

  unselectAllPosition() {
    position.forEach((v, i) => {
      if (this.bitmap.get(positionIndex - i) !== 0)
        this.bitmap.clear(positionIndex - i)
    })
  }

  selectAllRarity() {
    rarity.forEach((v, i) => {
      this.bitmap.set(rarityIndex - i)
    })
  }

  unselectAllRarity() {
    rarity.forEach((v, i) => {
      if (this.bitmap.get(rarityIndex - i) !== 0)
        this.bitmap.clear(rarityIndex - i)
    })
  }

  isRarityEmpty() {
    return this.bitmap.range(rarityIndex - rarity.length, rarityIndex) === 0
  }

  selectAllTag() {
    tag.forEach((v, i) => {
      this.bitmap.set(tagIndex - i)
    })
  }

  unselectAllTag() {
    tag.forEach((v, i) => {
      if (this.bitmap.get(tagIndex - i) !== 0)
        this.bitmap.clear(tagIndex - i)
    })
  }

  isTagEmpty() {
    return this.bitmap.range(tagIndex - tag.length, tagIndex) === 0
  }

  static fromSource(source: Source): Char {
    const char = new Char()
    char.bitmap.value = 0
    char.bitmap.set(professionIndex - profession.indexOf(source.profession))
    char.bitmap.set(positionIndex - position.indexOf(source.position))
    if (source.rarity === 4)
      char.bitmap.set(rarityIndex - rarity.indexOf('资深干员'))
    else if (source.rarity === 5)
      char.bitmap.set(rarityIndex - rarity.indexOf('高级资深干员'))
    source.tag.forEach((v) => {
      if (v === '新手') {
        char.bitmap.set(rarityIndex - rarity.indexOf('新手'))
        return
      }
      char.bitmap.set(tagIndex - tag.indexOf(v))
    })
    return char
  }

  dump() {
    console.log(this.bitmap.value.toString(2).padStart(profession.length + position.length + rarity.length + tag.length, '0'))
    console.log(this.bitmap.getIndict().map((v) => {
      let tmp = v
      if (tmp < tag.length)
        return tag[tmp]
      tmp = tmp - tag.length
      if (tmp < rarity.length)
        return rarity[tmp]
      tmp = tmp - rarity.length
      if (tmp < position.length)
        return position[tmp]
      tmp = tmp - position.length
      if (tmp < profession.length)
        return profession[tmp]
      throw new Error(`unknown: ${v}`)
    }))
  }
}
