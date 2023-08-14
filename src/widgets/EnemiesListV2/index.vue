<script lang="ts">
import type {
  DataTableBaseColumn,
  DataTableColumn,
  DataTableColumns,
  DataTableFilterState,
  DataTableInst,
} from 'naive-ui'
import {
  NButton,
  NConfigProvider,
  NDataTable,
  NInput,
  NLayout,
  NPagination,
} from 'naive-ui'
import { storeToRefs } from 'pinia'
import {
  computed,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  watch,
} from 'vue'
import FilterGroup from './FilterGroup.vue'
import { getImagePath } from '@/utils/utils'
import { getNaiveUILocale } from '@/utils/i18n'
import { useThemeStore } from '@/stores/theme'

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

interface FilterConfig {
  filters: {
    [field: string]: {
      title: string
      options: string[]
    }
  }
  groups: {
    title: string
    filters: string[]
    show: boolean
  }[]
  states: Record<string, string[]>
}

export default defineComponent({
  components: {
    FilterGroup,
    NDataTable,
    NConfigProvider,
    NInput,
    NButton,
    NLayout,
    NPagination,
  },
  setup() {
    const enemyData = ref<EnemyData[]>([])
    const keyword = ref('')
    const tableRef = ref<DataTableInst>()
    const dimensionPrecedence = [
      'SS',
      'S+',
      'S',
      'A+',
      'A',
      'B+',
      'B',
      'C',
      'D',
      'E',
    ]
    const filterKeyToPropertyKey: Record<string, string> = {
      levels: 'enemyLevel',
      races: 'enemyRace',
      attackTypes: 'attackType',
      damageTypes: 'damageType',
      endure: 'endure',
      attack: 'attack',
      defence: 'defence',
      moveSpeed: 'moveSpeed',
      attackSpeed: 'attackSpeed',
      resistance: 'resistance',
    }
    const filterConfig = reactive<FilterConfig>({
      filters: {
        levels: {
          options: ['普通', '精英', '领袖'],
          title: '地位',
        },
        races: {
          options: [
            '感染生物',
            '无人机',
            '萨卡兹',
            '宿主',
            '海怪',
            '法术造物',
            '化物',
            '机械',
            '野生动物',
            '坍缩体',
          ],
          title: '种类',
        },
        attackTypes: {
          options: ['近战', '远程', '不攻击'],
          title: '攻击方式',
        },
        damageTypes: {
          options: ['物理', '法术', '治疗', '无'],
          title: '伤害类型',
        },
        endure: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '生命值',
        },
        attack: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '攻击力',
        },
        defence: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '防御力',
        },
        moveSpeed: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '移动速度',
        },
        attackSpeed: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '攻击速度',
        },
        resistance: {
          options: ['SS', 'S+', 'S', 'A+', 'A', 'B+', 'B', 'C', 'D', 'E'],
          title: '法术抗性',
        },
      },
      groups: [
        {
          title: '筛选',
          filters: ['levels', 'races', 'attackTypes', 'damageTypes'],
          show: true,
        },
        {
          title: '六维筛选',
          filters: [
            'endure',
            'attack',
            'defence',
            'moveSpeed',
            'attackSpeed',
            'resistance',
          ],
          show: false,
        },
      ],
      states: {
        levels: [],
        races: [],
        attackTypes: [],
        damageTypes: [],
        endure: [],
        attack: [],
        defence: [],
        moveSpeed: [],
        attackSpeed: [],
        resistance: [],
      },
    })
    const isLoading = ref(true)
    const i18nConfig = getNaiveUILocale()
    const isMobile = document.body.classList.contains('skin-minerva')
    const isIconMode = ref(!!isMobile)
    const themeStore = useThemeStore()
    const { theme } = storeToRefs(themeStore)
    const pagination = reactive({
      page: 1,
      pageSize: 10,
      pageSizes: [10, 25, 50, 100],
      pageSlot: isMobile ? 5 : 9,
      showSizePicker: true,
      onChange: (page: number) => {
        pagination.page = page
      },
      onUpdatePageSize: (pageSize: number) => {
        pagination.pageSize = pageSize
        pagination.page = 1
      },
    })
    const filteredEnemyData = computed(() => {
      const filters = filterConfig.states
      const searchWord = keyword.value
      const filteredData = enemyData.value.filter((enemy) => {
        for (const key in filters) {
          if (filters[key].length > 0) {
            if (
              !filters[key].some(
                filter =>
                  !!~enemy[filterKeyToPropertyKey[key] as keyof EnemyData]
                    .toString()
                    .indexOf(filter),
              )
            )
              return false
          }
          if (
            searchWord
              && !~enemy.name.indexOf(searchWord)
              && !~enemy.ability.indexOf(searchWord)
          )
            return false
        }
        return true
      })
      return filteredData
    })
    const filteredChunkedEnemyData = computed(() =>
      filteredEnemyData.value.slice(
        pagination.pageSize * (pagination.page - 1),
        pagination.pageSize * pagination.page,
      ),
    )

    watch(keyword, () => {
      tableRef.value?.filter({
        ability: [keyword.value],
        name: [keyword.value],
      })
    })

    const iconColumn: DataTableColumn<EnemyData> = {
      title: '头像',
      key: 'icon',
      render(row) {
        const img = h('img', {
          src: `/images/${getImagePath(`头像_敌人_${row.name}.png`)}`,
          class: 'lazyload',
          style: {
            width: '65px',
            height: '65px',
          },
        })
        return h(
          'a',
          {
            href: `/w/${row.enemyLink}`,
          },
          img,
        )
      },
      minWidth: 80,
    }

    const createFilterOptions = (field: string) => {
      return filterConfig.filters[field].options.map(option => ({
        label: option,
        value: option,
      }))
    }

    const levelColumn: DataTableColumn<EnemyData> = {
      title: '地位',
      key: 'enemyLevel',
      filterOptions: createFilterOptions('levels'),
      filterOptionValues: filterConfig.states.levels,
      filter(value, row) {
        return !!~row.enemyLevel.indexOf(value.toString())
      },
      renderFilter() {
        return h('div')
      },
    }

    const abilityColumn: DataTableColumn<EnemyData> = {
      title: '能力',
      key: 'ability',
      minWidth: 200,
      defaultFilterOptionValue: keyword.value,
      filterOptions: [
        {
          label: keyword.value,
          value: keyword.value,
        },
      ],
      filter(value, row) {
        return (
          !!~row.ability.indexOf(value.toString())
          || !!~row.name.indexOf(value.toString())
        )
      },
      render(row) {
        nextTick(() => {
          document.querySelectorAll('.mc-tooltips').forEach((e) => {
            if (!e.children || e.children.length < 2)
              return;
            (e.children[1] as HTMLElement).style.display = 'block'
            // @ts-expect-error tippy
            tippy6(e.children[0], {
              content: e.children[1],
              arrow: true,
              theme: 'light-border',
              size: 'large',
              maxWidth: Number.parseInt(
                (e.children[1] as HTMLElement).dataset.size!,
              ),
              trigger:
                (e.children[1] as HTMLElement).dataset.trigger
                || 'mouseenter focus',
            })
          })
        })
        return h('span', { innerHTML: row.ability })
      },
      renderFilter() {
        return h('div')
      },
    }

    const createDimensionalColumn = (
      field: keyof EnemyData,
      title: string,
    ): DataTableColumn<EnemyData> => {
      return {
        title,
        key: field,
        defaultSortOrder: false,
        sorter: (row1, row2) => {
          const index1 = dimensionPrecedence.indexOf(row1[field].toString())
          const index2 = dimensionPrecedence.indexOf(row2[field].toString())
          return index1 === -1 ? 1 : index2 === -1 ? -1 : index1 - index2
        },
        filterOptions: createFilterOptions(field),
        filterOptionValues: filterConfig.states[field],
        filter(value, row) {
          return row[field] === value.toString()
        },
        renderFilter() {
          return h('div')
        },
      }
    }

    const createColumns = (): DataTableColumns<EnemyData> => {
      return [
        iconColumn,
        {
          title: '名称',
          key: 'name',
          minWidth: 100,
          defaultSortOrder: false,
          sorter: 'default',
          render(row) {
            return h(
              'a',
              {
                href: `/w/${row.enemyLink}`,
              },
              row.name,
            )
          },
          renderFilter() {
            return h('div')
          },
        },
        levelColumn,
        {
          title: '种类',
          key: 'enemyRace',
          filterOptions: createFilterOptions('races'),
          filterOptionValues: filterConfig.states.races,
          filter(value, row) {
            return !!~row.enemyRace.indexOf(value.toString())
          },
          renderFilter() {
            return h('div')
          },
        },
        {
          title: '攻击方式',
          key: 'attackType',
          filterOptions: createFilterOptions('attackTypes'),
          filterOptionValues: filterConfig.states.attackTypes,
          filter(value, row) {
            return !!~row.attackType.indexOf(value.toString())
          },
          renderFilter() {
            return h('div')
          },
        },
        {
          title: '伤害类型',
          key: 'damageType',
          filterOptions: createFilterOptions('damageTypes'),
          filterOptionValues: filterConfig.states.damageTypes,
          filter(value, row) {
            return !!~row.damageType.indexOf(value.toString())
          },
          renderFilter() {
            return h('div')
          },
        },
        abilityColumn,
        ...filterConfig.groups[1].filters.map(field =>
          createDimensionalColumn(
            field as keyof EnemyData,
            filterConfig.filters[field].title,
          ),
        ),
      ]
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
      table: tableRef,
      filterConfig,
      enemyData,
      isLoading,
      columns: createColumns(),
      pagination,
      i18nConfig,
      keyword,
      theme,
      themeStore,
      isIconMode,
      filteredEnemyData,
      filteredChunkedEnemyData,
      getImagePath,
      handleUpdateFilter(
        filters: DataTableFilterState,
        sourceColumn: DataTableBaseColumn,
      ) {
        abilityColumn.filterOptionValues = filters[
          sourceColumn.key
        ] as string[]
      },
    }
  },
})
</script>

<template>
  <NConfigProvider
    :theme="theme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <NLayout class="p-4 antialiased mx-auto lg:max-w-[90rem] max-w-3xl">
      <FilterGroup
        v-for="group in filterConfig.groups"
        :key="group.title"
        v-model:show="group.show"
        v-model:states="filterConfig.states"
        :title="group.title"
        :filters="
          Object.fromEntries(
            Object.entries(filterConfig.filters).filter(([key]) =>
              group.filters.includes(key),
            ),
          )
        "
      />
      <div class="flex items-center">
        <NInput
          v-model:value="keyword"
          class="my-2"
          type="text"
          placeholder="搜索敌人名称/描述/能力"
        />
        <NButton
          class="mx-2"
          strong
          secondary
          :type="isIconMode ? 'info' : 'default'"
          @click="isIconMode = !isIconMode"
        >
          简
        </NButton>
        <div @click="themeStore.toggleDark()">
          <NButton>
            <span v-if="theme" class="text-2xl mdi mdi-brightness-6" />
            <span v-else class="text-2xl mdi mdi-brightness-4" />
          </NButton>
        </div>
      </div>
      <NDataTable
        v-if="!isIconMode"
        ref="table"
        class="my-2"
        :columns="columns"
        :data="enemyData"
        :pagination="pagination"
        :bordered="false"
        @update:filters="handleUpdateFilter"
      />
      <div v-if="isIconMode">
        <a
          v-for="(row, index) in filteredChunkedEnemyData"
          :key="index"
          :href="`/w/${row.enemyLink}`"
        >
          <img
            class="lazyload"
            style="width: 65px; height: 65px"
            :src="`/images/${getImagePath(`头像_敌人_${row.name}.png`)}`"
          >
        </a>
        <NPagination
          class="justify-center my-2"
          :item-count="filteredEnemyData.length"
          :page="pagination.page"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          :page-slot="pagination.pageSlot"
          :show-size-picker="pagination.showSizePicker"
          @update:page="pagination.onChange"
          @update:page-size="pagination.onUpdatePageSize"
        />
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
:global(.page-敌人一览 .backToTop) {
  @apply hidden!;
}

.n-data-table :deep(.n-data-table__pagination) {
  @apply justify-center!;
}

:deep(.mc-tooltips) {
  @apply border-b-1 border-b-dotted border-b-black;
}
</style>
