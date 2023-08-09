<script lang="ts">
import Cookies from 'js-cookie'
import { NCard, NCollapseTransition } from 'naive-ui'
import { defineComponent, reactive, ref } from 'vue'
import FilterGroup from './FilterGroup.vue'

interface EnemyData {
  enemyIndex: string
  sortId: number
  name: string
  enemyLink: string
  enemyRace: string
  enemyLevel: string
  attackType: string
  damageType: string
  motion: string
  endure: string
  attack: string
  defence: string
  moveSpeed: string
  attackSpeed: string
  resistance: string
  ability: string
}

const levels = ['普通', '精英', '领袖']
const races = [
  '感染生物',
  '无人机',
  '萨卡兹',
  '宿主',
  '海怪',
  '法术造物',
  '化物',
  '机械',
  '坍缩体',
  '其他',
]
const attackTypes = ['近战', '远程', '不攻击']
const damageTypes = ['物理', '法术', '治疗', '其他']
const dimensionRates = [
  'S+',
  'S',
  'A+',
  'A',
  'B+',
  'B',
  'C+',
  'C',
  'D+',
  'D',
  '其他',
]

export default defineComponent({
  components: {
    NCard,
    FilterGroup,
    NCollapseTransition,
  },
  setup() {
    const enemyData = ref<EnemyData[] | null>(null)
    const isLoading = ref(true)
    const expanded = ref([true, false])
    const selectedStates = reactive({
      levels: [],
      races: [],
      attackTypes: [],
      damageTypes: [],
      endure: [],
      attack: [],
      defence: [],
      resistance: [],
    })

    const toggleCollapse = (i: number) => {
      expanded.value[i] = !expanded.value[i]
      Cookies.set('enemyFilterExpandState', JSON.stringify(expanded.value), {
        expires: 365,
      })
    }

    fetch(
      `${window.location.origin}/index.php?${new URLSearchParams({
        title: '敌人一览/数据',
        action: 'raw',
        ctype: 'application/json',
      })}`,
    )
      .then((response) => {
        if (!response.ok)
          throw new Error('[EnemiesListV2] Received non-200 response')

        return response.json()
      })
      .then((data) => {
        enemyData.value = data
        isLoading.value = false
      })
      .catch(error => console.error(error))
    return {
      enemyData,
      isLoading,
      expanded,
      levels,
      races,
      attackTypes,
      damageTypes,
      dimensionRates,
      selectedStates,
      toggleCollapse,
    }
  },
})
</script>

<template>
  <div id="app">
    <NCard title="筛选" header-style="text-align: center;" size="small">
      <template #header-extra>
        <div @click="toggleCollapse(0)">
          <span v-if="expanded[0]" class="text-2xl mdi mdi-chevron-up" />
          <span v-else class="text-2xl mdi mdi-chevron-down" />
        </div>
      </template>
      <NCollapseTransition :show="expanded[0]">
        <table class="w-full text-left border-collapse">
          <tbody class="align-baseline">
            <tr>
              <FilterGroup
                v-model="selectedStates.levels"
                title="地位"
                :options="levels"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.races"
                title="种类"
                :options="races"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.attackTypes"
                title="攻击方式"
                :options="attackTypes"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.damageTypes"
                title="伤害类型"
                :options="damageTypes"
              />
            </tr>
          </tbody>
        </table>
      </NCollapseTransition>
    </NCard>
    <NCard title="四维筛选" header-style="text-align: center;" size="small">
      <template #header-extra>
        <div @click="toggleCollapse(1)">
          <span v-if="expanded[1]" class="text-2xl mdi mdi-chevron-up" />
          <span v-else class="text-2xl mdi mdi-chevron-down" />
        </div>
      </template>
      <NCollapseTransition :show="expanded[1]">
        <table class="w-full text-left border-collapse">
          <tbody class="align-baseline">
            <tr>
              <FilterGroup
                v-model="selectedStates.endure"
                title="耐久"
                :options="dimensionRates"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.attack"
                title="攻击力"
                :options="dimensionRates"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.defence"
                title="防御力"
                :options="dimensionRates"
              />
            </tr>
            <tr>
              <FilterGroup
                v-model="selectedStates.resistance"
                title="法术抗性"
                :options="dimensionRates"
              />
            </tr>
          </tbody>
        </table>
      </NCollapseTransition>
    </NCard>
  </div>
</template>

<style scoped></style>
