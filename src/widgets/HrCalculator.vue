<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, reactive } from 'vue'
import CheckBox from '@/components/Checkbox2.vue'
import FilterRow from '@/components/FilterRow2.vue'
export interface Source {
  profession: string
  position: string
  rarity: number
  tag: string[]
  zh: string
  subset: BitMap[]
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

export default defineComponent({
  components: { CheckBox, FilterRow },
  props: {
    source: Object as PropType<Source[]>,
    profession: { type: Array as PropType<string[]>, default: () => [] },
    position: { type: Array as PropType<string[]>, default: () => [] },
    rarity: { type: Array as PropType<string[]>, default: () => [] },
    tag: { type: Array as PropType<string[]>, default: () => [] },
  },
  setup(props) {
    const { profession, position, rarity, tag } = props
    const all = [...profession, ...position, ...rarity, ...tag]
    const classIndex = profession.length + position.length + rarity.length + tag.length - 1
    const positionIndex = position.length + rarity.length + tag.length - 1
    const rarityIndex = rarity.length + tag.length - 1
    const tagIndex = tag.length - 1
    const value = reactive(new BitMap(0))
    const selected = computed(() => {
      return all.map((v, i) => {
        return value.get(i) !== 0
      })
    })
    function onTagClick(i: number) {
      if (value.get(i) === 0)
        value.set(i)
      else
        value.clear(i)
    }

    function addAll(type: string) {
      if (type === 'class') {
        profession.forEach((v, i) => {
          value.set(classIndex - i)
        })
      }
      if (type === 'position') {
        position.forEach((v, i) => {
          value.set(positionIndex - i)
        })
      }
      if (type === 'rarity') {
        rarity.forEach((v, i) => {
          value.set(rarityIndex - i)
        })
      }
      if (type === 'tag') {
        tag.forEach((v, i) => {
          value.set(tagIndex - i)
        })
      }
    }
    function removeAll(type: string) {
      if (type === 'class') {
        profession.forEach((v, i) => {
          if (value.get(classIndex - i) !== 0)
            value.clear(classIndex - i)
        })
      }
      if (type === 'position') {
        position.forEach((v, i) => {
          if (value.get(positionIndex - i) !== 0)
            value.clear(positionIndex - i)
        })
      }
      if (type === 'rarity') {
        rarity.forEach((v, i) => {
          if (value.get(rarityIndex - i) !== 0)
            value.clear(rarityIndex - i)
        })
      }
      if (type === 'tag') {
        tag.forEach((v, i) => {
          if (value.get(tagIndex - i) !== 0)
            value.clear(tagIndex - i)
        })
      }
    }
    const isClassEmpty = computed(() => {
      return value.range(classIndex - profession.length, classIndex) === 0
    })
    const isPositionEmpty = computed(() => {
      return value.range(positionIndex - position.length, positionIndex) === 0
    })
    const isRarityEmpty = computed(() => {
      return value.range(rarityIndex - rarity.length, rarityIndex) === 0
    })
    const isTagEmpty = computed(() => {
      return value.range(tagIndex - tag.length, tagIndex) === 0
    })
    const list = computed(() => {
      const result: Record<number, { ids: number[]; score: number }> = {}
      const subset = value.getSubSet()

      return result
    })
    // console.log(list)
    return {
      classIndex,
      positionIndex,
      rarityIndex,
      tagIndex,
      selected,
      onTagClick,
      addAll,
      removeAll,
      isClassEmpty,
      isPositionEmpty,
      isRarityEmpty,
      isTagEmpty,
      list,
    }
  },
})
</script>

<template>
  <div>
    {{ list }}
    <FilterRow title="职业" :empty="isClassEmpty" @all="addAll('class')" @clear="removeAll('class')">
      <CheckBox
        v-for="(c, i) in profession"
        :key="c"
        :model-value="selected[classIndex - i]"
        class="m-1"
        @click="onTagClick(classIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="位置" :empty="isPositionEmpty" @all="addAll('position')" @clear="removeAll('position')">
      <CheckBox
        v-for="(c, i) in position"
        :key="c" class="m-1" :model-value="selected[positionIndex - i]"
        @click="onTagClick(positionIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="资历" :empty="isRarityEmpty" @all="addAll('rarity')" @clear="removeAll('rarity')">
      <CheckBox
        v-for="(c, i) in rarity"
        :key="c" class="m-1" :model-value="selected[rarityIndex - i]"
        @click="onTagClick(rarityIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="词缀" :empty="isTagEmpty" @all="addAll('tag')" @clear="removeAll('tag')">
      <CheckBox
        v-for="(c, i) in tag"
        :key="c" class="m-1" :model-value="selected[tagIndex - i]" checkable
        @click="onTagClick(tagIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
  </div>
</template>

<style scoped>
</style>
