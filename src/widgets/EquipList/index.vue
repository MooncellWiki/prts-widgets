<script lang="ts">
import { defineComponent, reactive, ref, watch } from 'vue'
import type { SelectGroupOption, SelectOption } from 'naive-ui'
import { NButton, NCard, NCollapse, NCollapseItem, NCollapseTransition, NConfigProvider, NEmpty, NLayout, NSpin, NTag, NTooltip } from 'naive-ui'
import { storeToRefs } from 'pinia'
import { useCharStore } from './script/charStore'
import FilterLine from './FilterLine.vue'
import FilterSub from './FilterSub.vue'
import SubContainer from './SubContainer.vue'
import { useThemeStore } from '@/stores/theme'

interface FilterConfig {
  title: string
  options: string[]
}
interface SelectionConfig {
  title: string
  options: SelectGroupOption[]
}
interface Char {
  name: string
  type: string
  subtype: string
  rarity: string | number
  id: number
}
export default defineComponent({
  components: {
    FilterLine,
    FilterSub,
    NCard,
    NCollapse,
    NCollapseItem,
    NConfigProvider,
    NLayout,
    NCollapseTransition,
    NTooltip,
    NEmpty,
    NButton,
    NTag,
    NSpin,
    SubContainer,
  },
  setup() {
    const filterShow = ref(true)
    const operatorShow = ref(true)
    const andMode = ref(true)
    const isLoading = ref(false)
    const themeStore = useThemeStore()
    const { theme } = storeToRefs(themeStore)
    const filterType = reactive<FilterConfig>({
      title: '职业',
      options: ['先锋', '近卫', '重装', '狙击', '术师', '医疗', '辅助', '特种'],
    })
    const filterRarity = reactive<FilterConfig>({
      title: '稀有度',
      options: ['4★', '5★', '6★'],
    })
    const transferRarity = reactive<Record<string, string>>({
      3: '4★',
      4: '5★',
      5: '6★',
    })
    const stateType = ref<string[]>([])
    const stateRarity = ref<string[]>([])
    const filterSub = reactive<SelectionConfig>({
      title: '子职业',
      options: [{
        type: 'group',
        label: '先锋',
        key: '先锋',
        children: [],
      }, {
        type: 'group',
        label: '近卫',
        key: '近卫',
        children: [],
      }, {
        type: 'group',
        label: '重装',
        key: '重装',
        children: [],
      }, {
        type: 'group',
        label: '狙击',
        key: '狙击',
        children: [],
      }, {
        type: 'group',
        label: '术师',
        key: '术师',
        children: [],
      }, {
        type: 'group',
        label: '医疗',
        key: '医疗',
        children: [],
      }, {
        type: 'group',
        label: '辅助',
        key: '辅助',
        children: [],
      }, {
        type: 'group',
        label: '特种',
        key: '特种',
        children: [],
      }],
    })
    const stateSub = ref<string[]>([])
    const equipData = ref<Record<string, string>>({})
    const equipChar = ref<string[]>([])
    const isError = ref(false)
    const charStore = useCharStore()
    const { selectedChar } = storeToRefs(charStore)
    const sortedCharData = ref<Record<string, Char[]>>({})
    const filteredCharData = ref<Record<string, Char[]>>({})
    const states = ref({
      type: stateType,
      rarity: stateRarity,
      sub: stateSub,
    })
    const filterIntersection = () => {
      const result = ref<Record<string, Char[]>>({})
      result.value = JSON.parse(JSON.stringify(sortedCharData.value))
      if (states.value.sub.length >= 1) {
        for (const sub in result.value) {
          if (!states.value.sub.includes(sub))
            delete result.value[sub]
        }
      }
      if (states.value.type.length >= 1) {
        for (const sub in result.value) {
          if (!states.value.type.includes(result.value[sub][0].type))
            delete result.value[sub]
        }
      }
      if (states.value.rarity.length >= 1) {
        for (const sub in result.value) {
          result.value[sub] = result.value[sub].filter((char) => {
            return states.value.rarity.includes(transferRarity[char.rarity])
          })
          if (result.value[sub].length < 1)
            delete result.value[sub]
        }
      }
      filteredCharData.value = result.value
    }
    const filterUnion = () => {
      const result = ref<Record<string, Char[]>>({})
      if (states.value.sub.length < 1) {
        result.value = JSON.parse(JSON.stringify(sortedCharData.value))
      }
      else {
        states.value.sub.forEach((sub) => {
          result.value[sub] = JSON.parse(JSON.stringify(sortedCharData.value[sub]))
        })
      }
      if (states.value.type.length >= 1) {
        if (states.value.sub.length < 1) {
          for (const sub in result.value) {
            if (!states.value.type.includes(result.value[sub][0].type))
              delete result.value[sub]
          }
        }
        else {
          states.value.type.forEach((type) => {
            for (const sub in sortedCharData.value) {
              if (sortedCharData.value[sub][0].type === type)
                result.value[sub] = JSON.parse(JSON.stringify(sortedCharData.value[sub]))
            }
          })
        }
      }
      if (states.value.rarity.length >= 1) {
        for (const sub in result.value) {
          result.value[sub] = result.value[sub].filter((char) => {
            return states.value.rarity.includes(transferRarity[char.rarity])
          })
          if (result.value[sub].length < 1)
            delete result.value[sub]
        }
      }
      filteredCharData.value = result.value
    }
    watch(states.value.type, () => {
      andMode.value ? filterIntersection() : filterUnion()
    })
    watch(states.value.rarity, () => {
      andMode.value ? filterIntersection() : filterUnion()
    })
    watch(states.value.sub, () => {
      andMode.value ? filterIntersection() : filterUnion()
    })
    watch(andMode, () => {
      andMode.value ? filterIntersection() : filterUnion()
    })
    const initPanel = (name: string) => {
      const ele = document.getElementById(`equip_${name}`)
      if (ele instanceof HTMLElement)
        ele.innerHTML = equipData.value[name]
    }
    const loadedChar = ref(0)
    const getEquipData = () => {
      loadedChar.value = 0
      isLoading.value = true
      equipChar.value.splice(0)
      selectedChar.value.forEach((char) => {
        if (equipData.value[char.name]) {
          equipChar.value.push(char.name)
          loadedChar.value++
          return
        }
        fetch(
          `${window.location.origin}/api.php?${new URLSearchParams({
            action: 'parse',
            format: 'json',
            title: '干员模组一览',
            text: `{{#lst:${char.name}|专属模组}}`,
            prop: 'text',
            utf8: '1',
            disablelimitreport: '1',
            disableeditsection: '1',
            disabletoc: '1',
          })}`,
        ).then((response) => {
          if (!response.ok) {
            isError.value = true
            throw new Error('[EquipList] Received non-200 response')
          }
          return response.json()
        }).then((data) => {
          const content = data.parse.text['*']
          equipData.value[char.name] = content
          equipChar.value.push(char.name)
          loadedChar.value++
        })
      })
      isLoading.value = false
    }
    fetch(
      `${window.location.origin}/api.php?${new URLSearchParams({
        action: 'ask',
        format: 'json',
        query: '[[分类:拥有专属模组的干员]]|?子职业|?干员序号|?稀有度|?职业|sort=子职业|order=asc|limit=1000|link=none|link=none|sep=,|propsep=;|format=list',
        api_version: '2',
        utf8: '1',
      })}`,
    )
      .then((response) => {
        if (!response.ok)
          throw new Error('[EquipList] Received non-200 response')

        return response.json()
      })
      .then((data) => {
        const result: any = data.query.results
        const charData = ref<Char[]>([])
        for (const i in result) {
          charData.value.push({
            name: i,
            type: result[i].printouts['职业'][0] as string,
            subtype: result[i].printouts['子职业'][0] as string,
            rarity: result[i].printouts['稀有度'][0] as string,
            id: result[i].printouts['干员序号'][0] as number,
          })
        }
        let cursub = ''
        for (const i in charData.value) {
          const char = charData.value[i]
          if (cursub !== char.subtype) {
            cursub = char.subtype
            sortedCharData.value[cursub] = [char]
            const children = filterSub.options[filterType.options.indexOf(char.type)].children as Array<SelectOption>
            children.push({
              label: cursub,
              value: cursub,
            })
          }
          else {
            sortedCharData.value[cursub].push(char)
          }
        }
        for (const i in sortedCharData.value) {
          sortedCharData.value[i].sort((a: Char, b: Char) => {
            return a.rarity === b.rarity
              ? b.id - a.id
              : Number.parseInt(b.rarity as string) - Number.parseInt(a.rarity as string)
          })
        }
        filteredCharData.value = JSON.parse(JSON.stringify(sortedCharData.value))
      })
      .catch(error => console.error(error))
    const toggleCollapse = () => {
      operatorShow.value = false
      if (window.screen.availWidth < 1024)
        filterShow.value = false
      getEquipData()
    }
    return {
      filterType,
      filterRarity,
      filterSub,
      states,
      filteredCharData,
      filterShow,
      operatorShow,
      andMode,
      selectedChar,
      charStore,
      equipData,
      getEquipData,
      equipChar,
      initPanel,
      loadedChar,
      toggleCollapse,
      isLoading,
      theme,
      themeStore,
    }
  },
})
</script>

<template>
  <NConfigProvider
    :theme="theme"
  >
    <NLayout class="p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <NCard title="干员筛选" header-style="text-align: center;" size="small">
        <template #header-extra>
          <NTooltip trigger="hover">
            <template #trigger>
              <div class="m-1" @click="andMode = !andMode">
                <span v-if="andMode" class="text-2xl mdi mdi-set-center" />
                <span v-else class="text-2xl mdi mdi-set-all" />
              </div>
            </template>
            点击改变筛选模式<br><span class="mdi mdi-set-center" />：同时满足所有筛选条件<br><span class="mdi mdi-set-all" />：满足职业和子职业的其中一个筛选条件
          </NTooltip>
          <div class="m-1" @click="filterShow = !filterShow">
            <span v-if="filterShow" class="text-2xl mdi mdi-chevron-up" />
            <span v-else class="text-2xl mdi mdi-chevron-down" />
          </div>
        </template>
        <NCollapseTransition :show="filterShow">
          <table class="w-full text-left border-collapse">
            <tbody class="align-baseline">
              <tr>
                <FilterLine :option-value="states.type" :title="filterType.title" :options="filterType.options" />
              </tr>
              <tr>
                <FilterLine :option-value="states.rarity" :title="filterRarity.title" :options="filterRarity.options" />
              </tr>
              <tr>
                <FilterSub :title="filterSub.title" :options="filterSub.options" :selected="states.sub" />
              </tr>
            </tbody>
          </table>
        </NCollapseTransition>
      </NCard>
      <NCard>
        <div class="flex flex-row items-center">
          <NCard size="small">
            <NTag v-for="(char, ind) in selectedChar" :key="ind" class="m-1" type="info" closable @close="charStore.addOrDeleteChar(char)">
              {{ char.name }}
            </NTag>
            <span v-if="selectedChar.length === 0" class="text-sm color-gray">选中的干员在此显示，点击头像以选择干员</span>
          </NCard>
          <NButton
            class="mx-1"
            strong
            secondary
            type="error"
            @click="() => { selectedChar.splice(0) }"
          >
            <span class="text-xl mdi mdi-close-circle" />
          </NButton>
          <NButton
            class="mx-1"
            strong
            secondary
            type="primary"
            @click="toggleCollapse"
          >
            <span class="text-xl mdi mdi-check-circle" />
          </NButton>
          <div @click="themeStore.toggleDark()">
            <NButton>
              <span v-if="theme" class="text-xl mdi mdi-brightness-6" />
              <span v-else class="text-xl mdi mdi-brightness-4" />
            </NButton>
          </div>
        </div>
      </NCard>
      <NCard title="干员选择" header-style="text-align: center;" size="small">
        <template #header-extra>
          <div @click="operatorShow = !operatorShow">
            <span v-if="operatorShow" class="text-2xl mdi mdi-chevron-up" />
            <span v-else class="text-2xl mdi mdi-chevron-down" />
          </div>
        </template>
        <NCollapseTransition :show="operatorShow">
          <div class="w-full flex flex-col lg:flex-row flex-wrap">
            <SubContainer v-for="(chars, subtype) in filteredCharData" :key="subtype" :chars="chars" :title="subtype" />
          </div>
          <NEmpty v-if="JSON.stringify(filteredCharData) === '{}'" description="无结果">
            <template #icon>
              <span class="text-5xl mdi mdi-account-filter-outline" />
            </template>
          </NEmpty>
        </NCollapseTransition>
      </NCard>
      <NCard v-if="equipChar.length > 0" title="查询结果" header-style="text-align: center;" size="small">
        <NSpin :show="isLoading">
          <NCollapse>
            <NCollapseItem
              v-for="(name, ind) in equipChar"
              :key="ind"
              :name="name"
              :title="name"
              display-directive="show"
              @vue:mounted="initPanel(name)"
              @vue:updated="initPanel(name)"
            >
              <div v-show="equipChar.includes(name)" :id="`equip_${name}`" />
            </NCollapseItem>
          </NCollapse>
          <template #description>
            加载中
          </template>
        </NSpin>
      </NCard>
    </NLayout>
  </NConfigProvider>
</template>

<style>
.modbody {display:flex;width:100%;max-width:800px;margin:10px 0;padding:10px;box-shadow:3px 3px 5px #888;box-sizing:border-box;flex-flow:column}
.modtype {display:flex;flex-flow:column;flex:25 25 25%;min-width:60px;justify-content:center;align-items:center;height:60px;}
.modname {display:flex;align-items:center;justify-content:center;flex:75 75 75%;height:60px}
.rankicon {flex:10 10 10%;display:flex;justify-content:center;align-items:center;min-width:55px;}
.ranktext {flex:16.5 16.5 16.5%;display:flex;align-items:center;min-width:100px;white-space:nowrap;flex-wrap:wrap;align-content:center}
.descr {flex:25 25 25%;display:flex;justify-content:center;align-items:center;min-width:130px}
.consume {flex:50 50 50%;display:flex;flex-wrap:nowrap;align-items:center;min-width:260px}
.basicbox {display:flex;width:100%;flex-wrap:wrap;margin:5px 0}
.rankbox {display:flex;width:100%;flex-flow:column;margin:5px 0}
.singlerank {display:flex;width:100%;flex-wrap:wrap;margin:5px 0}
.rankinfo {flex:90 90 90%;display:flex;flex-wrap:wrap;}
.talent {flex:83.5 83.5 83.5%;display:flex;align-items:center}
.majorsep {height: 1px;background-color: black;}
.minorsep {height: 1px;background-color: lightgray;}
.dark .majorsep {background-color: whitesmoke;}
.dark .minorsep {background-color: gray;}
</style>
