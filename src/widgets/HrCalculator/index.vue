<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, reactive, ref, watch } from 'vue'

import type { Source } from './utils'
import { Char, all, position, positionIndex, profession, professionIndex, rarity, rarityIndex, tag, tagIndex } from './utils'
import CheckBox from '@/components/Checkbox2.vue'
import FilterRow from '@/components/FilterRow2.vue'
import Avatar from '@/components/head/Avatar.vue'
import Pagination from '@/components/Pagination.vue'
export default defineComponent({
  components: { CheckBox, FilterRow, Avatar, Pagination },
  props: {
    source: { type: Array as PropType<Source[]>, default: () => [] },
  },
  setup(props) {
    const value = reactive(new Char(0))
    const selected = computed(() => {
      return all.map((v, i) => {
        return value.bitmap.get(i) !== 0
      })
    })
    function onTagClick(i: number) {
      if (value.bitmap.get(i) === 0)
        value.bitmap.set(i)
      else
        value.bitmap.clear(i)
    }

    const isClassEmpty = computed(() => {
      return value.isProfessionEmpty()
    })
    const isPositionEmpty = computed(() => {
      return value.isPositionEmpty()
    })
    const isRarityEmpty = computed(() => {
      return value.isRarityEmpty()
    })
    const isTagEmpty = computed(() => {
      return value.isTagEmpty()
    })
    function calc() {
      const result: Record<number | string, { charIndict: number[] }> = {}
      const subset = value.bitmap.getSubSet()
      props.source.forEach((c, charIndex) => {
        c.subset.forEach((set) => {
          subset.forEach((group) => {
            // 干员的子集中的一个元素 是这个选中的子集中的一个元素 的子集
            if ((group & set) === group) {
              if (!result[group]) {
                result[group] = {
                  charIndict: [],
                }
              }
              result[group].charIndict.push(charIndex)
            }
          })
        })
      })
      const list: Array<{ tags: number; charIndict: number[]; score: number }> = []
      Object.keys(result).forEach((k) => {
        const key = parseInt(k)
        list.push({
          tags: key,
          charIndict: result[key].charIndict,
          score: result[key].charIndict.reduce((acc, cur) => {
            return acc + props.source[cur].rarity
          }, 0) / result[key].charIndict.length,
        })
      })
      list.sort((a, b) => {
        return b.score - a.score
      })
      return list
    }
    const page = ref({ cur: 1, size: 50, total: 0 })
    const result = ref<Array<{
      tags: number
      charIndict: number[]
      score: number
    }>>([])
    watch(value, () => {
      result.value = calc()
      page.value.total = result.value.length
      page.value.cur = 1
    })
    const list = computed(() => {
      return result.value.slice((page.value.cur - 1) * page.value.size, page.value.cur * page.value.size)
    })
    return {
      value,
      profession,
      position,
      rarity,
      tag,
      professionIndex,
      positionIndex,
      rarityIndex,
      tagIndex,
      selected,
      onTagClick,
      isClassEmpty,
      isPositionEmpty,
      isRarityEmpty,
      isTagEmpty,
      list,
      page,
    }
  },
})
</script>

<template>
  <div>
    <FilterRow title="职业" :empty="isClassEmpty" @all="value.selectAllProfession" @clear="value.unselectAllProfession">
      <CheckBox
        v-for="(c, i) in profession"
        :key="c"
        :model-value="selected[professionIndex - i]"
        class="m-1"
        @click="onTagClick(professionIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="位置" :empty="isPositionEmpty" @all="value.selectAllPosition" @clear="value.unselectAllPosition">
      <CheckBox
        v-for="(c, i) in position"
        :key="c" class="m-1" :model-value="selected[positionIndex - i]"
        @click="onTagClick(positionIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="资历" :empty="isRarityEmpty" @all="value.selectAllRarity" @clear="value.unselectAllRarity">
      <CheckBox
        v-for="(c, i) in rarity"
        :key="c" class="m-1" :model-value="selected[rarityIndex - i]"
        @click="onTagClick(rarityIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
    <FilterRow title="词缀" :empty="isTagEmpty" @all="value.selectAllTag" @clear="value.unselectAllTag">
      <CheckBox
        v-for="(c, i) in tag"
        :key="c" class="m-1" :model-value="selected[tagIndex - i]" checkable
        @click="onTagClick(tagIndex - i)"
      >
        {{ c }}
      </CheckBox>
    </FilterRow>
  </div>
  <div>
    <Pagination
      v-model:index="page.cur"
      v-model:step="page.size"
      :length="page.total"
    />
    <div v-for="data in list" :key="data.tags">
      <div>data.tags</div>
      <div>
        <Avatar v-for="charIndex in data.charIndict" :key="charIndex" :class_="source[charIndex].profession" :rarity="source[charIndex].rarity" :zh="source[charIndex].zh" />
      </div>
    </div>
    <Pagination
      v-model:index="page.cur"
      v-model:step="page.size"
      :length="page.total"
    />
  </div>
</template>

<style scoped>

</style>
