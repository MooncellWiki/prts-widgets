<script lang="ts">
import type {
  DataTableBaseColumn,
  DataTableColumn,
  DataTableColumns,
  DataTableFilterState,
  DataTableInst,
} from 'naive-ui'
import { NConfigProvider, NDataTable, NInput } from 'naive-ui'
import { defineComponent, h, nextTick, reactive, ref, watch } from 'vue'
import FilterGroup from './FilterGroup.vue'
import { getImagePath } from '@/utils/utils'
import { getNaiveUILocale } from '@/utils/i18n'

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
  },
  setup() {
    const enemyData = ref<EnemyData[]>([])
    const keyword = ref('')
    const tableRef = ref<DataTableInst>()
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
            '坍缩体',
            '其他',
          ],
          title: '种类',
        },
        attackTypes: {
          options: ['近战', '远程', '不攻击'],
          title: '攻击方式',
        },
        damageTypes: {
          options: ['物理', '法术', '治疗', '其他'],
          title: '伤害类型',
        },
        endure: {
          options: [
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
          ],
          title: '耐久',
        },
        attack: {
          options: [
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
          ],
          title: '攻击力',
        },
        defence: {
          options: [
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
          ],
          title: '防御力',
        },
        resistance: {
          options: [
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
          ],
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
          title: '四维筛选',
          filters: ['endure', 'attack', 'defence', 'resistance'],
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
        resistance: [],
      },
    })
    watch(keyword, () => {
      tableRef.value?.filter({
        ability: [keyword.value],
      })
    })
    const isLoading = ref(true)
    const i18nConfig = getNaiveUILocale()
    const isMobile = document.body.classList.contains('skin-minerva')

    const iconColumn: DataTableColumn<EnemyData> = {
      title: '头像',
      key: 'icon',
      render(row) {
        return h('img', {
          src: `/images/${getImagePath(`头像_敌人_${row.name}.png`)}`,
          style: {
            width: '50px',
            height: '50px',
          },
        })
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
        return !!~row.ability.indexOf(value.toString())
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

    const createColumns = (): DataTableColumns<EnemyData> => {
      return [
        iconColumn,
        {
          title: '名称',
          key: 'name',
          minWidth: 100,
          defaultSortOrder: false,
          sorter: 'default',
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
        {
          title: '攻击力',
          key: 'attack',
          defaultSortOrder: false,
          sorter: 'default',
          filterOptions: createFilterOptions('attack'),
          filterOptionValues: filterConfig.states.attack,
          filter(value, row) {
            return row.attack === value.toString()
          },
          renderFilter() {
            return h('div')
          },
        },
        {
          title: '耐久',
          key: 'endure',
          defaultSortOrder: false,
          sorter: 'default',
          filterOptions: createFilterOptions('endure'),
          filterOptionValues: filterConfig.states.endure,
          filter(value, row) {
            return row.endure === value.toString()
          },
          renderFilter() {
            return h('div')
          },
        },
        {
          title: '防御力',
          key: 'defence',
          defaultSortOrder: false,
          sorter: 'default',
          filterOptions: createFilterOptions('defence'),
          filterOptionValues: filterConfig.states.defence,
          filter(value, row) {
            return row.defence === value.toString()
          },
          renderFilter() {
            return h('div')
          },
        },
        {
          title: '法术抗性',
          key: 'resistance',
          defaultSortOrder: false,
          sorter: 'default',
          filterOptions: createFilterOptions('resistance'),
          filterOptionValues: filterConfig.states.resistance,
          filter(value, row) {
            return row.resistance === value.toString()
          },
          renderFilter() {
            return h('div')
          },
        },
      ]
    }

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
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
  >
    <div class="antialiased mx-auto lg:max-w-[90rem] max-w-3xl mx-auto">
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
      <NInput
        v-model:value="keyword"
        class="my-3"
        type="text"
        placeholder="搜索敌人名称/描述/能力"
      />
      <NDataTable
        ref="table"
        :columns="columns"
        :data="enemyData"
        :pagination="pagination"
        :bordered="false"
        @update:filters="handleUpdateFilter"
      />
    </div>
  </NConfigProvider>
</template>

<style>
.backToTop {
  @apply hidden!;
}

.n-data-table__pagination {
  @apply justify-center!;
}

.mc-tooltips {
  border-bottom: 1px dotted black;
}
</style>
