<script lang="ts">
import type { PropType } from 'vue'
import { computed, defineComponent, nextTick, reactive, ref, watch } from 'vue'

import type { Source } from './utils'
import { Char, all, can5, number2names, position, positionIndex, profession, professionIndex, rarity, rarityIndex, tag, tagIndex } from './utils'
import Checkbox from '@/components/Checkbox.vue'
import FilterRow from '@/components/FilterRow.vue'
import Avatar from '@/components/Avatar.vue'
export default defineComponent({
  components: { Checkbox, FilterRow, Avatar },
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
      const result: Record<number | string, { charIndict: Set<number> }> = {}
      const subset = value.bitmap.getSubSet()
      props.source.forEach((c, charIndex) => {
        c.subset.forEach((set) => {
          subset.forEach((group) => {
            // 干员的子集中的一个元素 是这个选中的子集中的一个元素 的子集
            if ((group & set) !== group)
              return

            // 6星要有对应的稀有度tag才能出
            if (c.rarity === 5 && !can5(group))
              return

            if (!result[group]) {
              result[group] = {
                charIndict: new Set(),
              }
            }
            result[group].charIndict.add(charIndex)
          })
        })
      })
      const list: Array<{ tags: number; charIndict: number[]; score: number }> = []
      Object.keys(result).forEach((k) => {
        const key = parseInt(k)
        const charIndict = Array.from(result[key].charIndict).sort((a, b) => {
          return props.source[a].rarity - props.source[b].rarity
        })
        list.push({
          tags: key,
          charIndict,
          score: charIndict.reduce((acc, cur) => {
            return acc + props.source[cur].rarity
          }, 0) / charIndict.length,
        })
      })
      list.sort((a, b) => {
        const rarity = b.score - a.score
        if (rarity !== 0)
          return rarity
        return a.charIndict.length - b.charIndict.length
      })
      return list
    }
    const result = ref<Array<{
      tags: number
      charIndict: number[]
      score: number
    }>>([])
    watch(value, () => {
      nextTick(() => {
        result.value = calc()
      })
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
      result,
      number2names,
    }
  },
})
</script>

<template>
  <div>
    <FilterRow title="职业" :some-selected="!isClassEmpty" @all="() => value.selectAllProfession()" @clear="() => value.unselectAllProfession()">
      <Checkbox
        v-for="(c, i) in profession"
        :key="c"
        :model-value="selected[professionIndex - i]"
        class="m-1"
        @click="onTagClick(professionIndex - i)"
      >
        {{ c }}
      </Checkbox>
    </FilterRow>
    <FilterRow title="位置" :some-selected="!isPositionEmpty" @all="() => value.selectAllPosition()" @clear="() => value.unselectAllPosition()">
      <Checkbox
        v-for="(c, i) in position"
        :key="c" class="m-1" :model-value="selected[positionIndex - i]"
        @click="onTagClick(positionIndex - i)"
      >
        {{ c }}
      </Checkbox>
    </FilterRow>
    <FilterRow title="资历" :some-selected="!isRarityEmpty" @all="() => value.selectAllRarity()" @clear="() => value.unselectAllRarity()">
      <Checkbox
        v-for="(c, i) in rarity"
        :key="c" class="m-1" :model-value="selected[rarityIndex - i]"
        @click="onTagClick(rarityIndex - i)"
      >
        {{ c }}
      </Checkbox>
    </FilterRow>
    <FilterRow title="词缀" :some-selected="!isTagEmpty" @all="() => value.selectAllTag()" @clear="() => value.unselectAllTag()">
      <Checkbox
        v-for="(c, i) in tag"
        :key="c" class="m-1" :model-value="selected[tagIndex - i]" checkable
        @click="onTagClick(tagIndex - i)"
      >
        {{ c }}
      </Checkbox>
    </FilterRow>
  </div>
  <div>
    <div v-for="data in result" :key="data.tags">
      <div class="flex flex-wrap">
        <div v-for="name in number2names(data.tags)" :key="name">
          {{ name }}
        </div>
      </div>
      <div class="flex flex-wrap">
        <Avatar v-for="charIndex in data.charIndict" :key="charIndex" :profession="source[charIndex].profession" :rarity="source[charIndex].rarity" :name="source[charIndex].zh" />
      </div>
    </div>
  </div>
</template>

<style scoped>

</style>
