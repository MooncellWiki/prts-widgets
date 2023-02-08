<script lang="ts">
import type { PropType } from 'vue'
import { defineComponent } from 'vue'
import Avatar from './Avatar.vue'
import type { professionMap } from '@/utils/utils'
import { sum } from '@/utils/utils'
export interface costProps {
  rarity: number
  name: string
  profession: keyof typeof professionMap
  elite: number // 精英化
  skill: number // 技能1-7
  mastery: [number, number, number] // 技能专精
  uniequip: number // 模组
}
export default defineComponent({
  components: { Avatar },
  props: {
    rarity: Number,
    name: String,
    profession: String as PropType<keyof typeof professionMap>,
    elite: Number, // 精英化
    skill: Number, // 技能1-7
    mastery: Array as PropType<number[]> as PropType<[number, number, number]>, // 技能专精
    uniequip: Number, // 模组
  },
  setup() {
    return {
      sum,
    }
  },
})
</script>

<template>
  <div class="flex flex-col justify-center items-center my-8px">
    <Avatar :rarity="rarity" :name="name" :profession="profession" :size="60" />
    <div :class="{ 'text-disabled': elite === 0 }">
      精英化：
      <span :class="{ 'text-primary-main': elite !== 0 }" class="font-bold">
        {{ elite }}
      </span>
    </div>
    <div :class="{ 'text-disabled': skill === 0 }">
      技能1→7：
      <span :class="{ 'text-primary-main': skill !== 0 }" class="font-bold">
        {{ skill }}
      </span>
    </div>
    <div v-if="mastery" :class="{ 'text-disabled': sum(mastery) === 0 }">
      技能专精：
      <span
        :class="{ 'text-primary-main': sum(mastery) !== 0 }"
        class="font-bold"
      >
        {{ sum(mastery) === 0 ? 0 : `${mastery.join('/')}` }}
      </span>
    </div>
    <div :class="{ 'text-disabled': uniequip === 0 }">
      模组：
      <span :class="{ 'text-primary-main': uniequip !== 0 }" class="font-bold">
        {{ uniequip }}
      </span>
    </div>
  </div>
</template>
