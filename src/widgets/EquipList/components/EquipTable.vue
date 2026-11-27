<script setup lang="ts">
import { computed, reactive, ref, useTemplateRef, watch } from "vue";

import {
  AkButton,
  AkSelect,
  type SelectValue,
} from "@mooncellwiki/prts-design-vue";
import { useElementSize } from "@vueuse/core";

import ListPager from "@/components/list/ListPager.vue";
import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath, isMobile } from "@/utils/utils";

import { customLabel } from "../consts";
import { useEquipListStore } from "../store";

import Equip from "./Equip.vue";

import type { EquipRow } from "../types";

const props = defineProps<{
  data: EquipRow[];
}>();

const store = useEquipListStore();
const root = useTemplateRef<HTMLElement>("root");
const { width } = useElementSize(
  root,
  { width: Number.POSITIVE_INFINITY, height: 0 },
  { box: "border-box" },
);
const narrow = computed(() => width.value < 480);
const page = ref(1);
const pageSize = ref(10);
/** 展开着的模组：operator.name */
const expanded = reactive(new Set<string>());

const rowKey = (row: EquipRow) => `${row.operator}.${row.name}`;
const pageCount = computed(() =>
  Math.max(1, Math.ceil(props.data.length / pageSize.value)),
);
const pageData = computed(() =>
  props.data.slice(
    (page.value - 1) * pageSize.value,
    page.value * pageSize.value,
  ),
);

watch(
  [() => props.data.length, pageSize],
  () => {
    if (page.value > pageCount.value) page.value = pageCount.value;
  },
  { flush: "post" },
);

const pageSizeOptions = computed(() =>
  customLabel.pagination.map((value) => ({
    label: `每页 ${value} 条`,
    value,
  })),
);

const setPageSize = (value: SelectValue | null | undefined) => {
  if (typeof value !== "number") return;
  pageSize.value = value;
  page.value = 1;
};

const isExpanded = (row: EquipRow) => expanded.has(rowKey(row));

function toggleRow(row: EquipRow) {
  const key = rowKey(row);
  if (expanded.has(key)) expanded.delete(key);
  else expanded.add(key);
}
</script>

<template>
  <div
    ref="root"
    :class="['ep-table-wrap', { 'ep-table-wrap--narrow': narrow }]"
  >
    <div class="ep-table-top">
      <ListPager
        :page="page"
        :page-count="pageCount"
        :narrow="narrow"
        label="分页"
        @update:page="page = $event"
      />
    </div>
    <div class="ep-table-scroll">
      <table
        :class="['ak-table', 'ep-table', { 'ak-table--compact': isMobile() }]"
        aria-label="模组列表"
      >
        <colgroup>
          <col class="ep-table__col-expand" />
          <col class="ep-table__col-operator" />
          <col />
        </colgroup>

        <tbody v-for="row in pageData" :key="rowKey(row)">
          <tr class="ep-table__row">
            <td class="ep-table__expand">
              <AkButton
                :class="['ep-table__toggle', { 'is-open': isExpanded(row) }]"
                variant="ghost"
                size="xs"
                icon="chevron-right"
                :label="isExpanded(row) ? '收起模组详情' : '展开模组详情'"
                :aria-expanded="isExpanded(row)"
                @click="toggleRow(row)"
              />
            </td>
            <td class="ep-table__operator">
              <div class="ep-table__op">
                <a :href="`/w/${row.operator}`">
                  <img
                    :src="getImagePath(`头像_${row.operator}_2.png`)"
                    width="60"
                    alt=""
                  />
                </a>
                <a :href="`/w/${row.operator}#${row.name}`">
                  <img
                    :class="['ep-table__type']"
                    :src="`${TORAPPU_ENDPOINT}/assets/uniequip_direction/${row.data.typeIcon?.toLowerCase()}.png`"
                    width="60"
                    alt=""
                  />
                </a>
              </div>
            </td>
            <td class="ep-table__data">
              <Equip
                :name="row.operator"
                :data="[row.data]"
                simple
                :simplemode="store.simple"
              />
            </td>
          </tr>

          <tr v-if="isExpanded(row)" class="ep-table__detail">
            <td colspan="3">
              <Equip :name="row.operator" :data="[row.data]" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="ep-table-foot">
      <AkSelect
        class="ep-table__page-size"
        :model-value="pageSize"
        :options="pageSizeOptions"
        label="每页条数"
        @update:model-value="setPageSize"
      />
      <ListPager
        :page="page"
        :page-count="pageCount"
        :narrow="narrow"
        label="分页"
        @update:page="page = $event"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ep-table-wrap {
  width: 100%;
  min-width: 0;
}

.ep-table-scroll {
  width: 100%;
  overflow-x: auto;
}

.ep-table {
  table-layout: fixed;

  &__col-expand {
    width: 36px;
  }

  &__col-operator {
    width: 90px;
  }

  &__expand {
    width: 36px;
    text-align: center;
    vertical-align: middle;
  }

  &__toggle {
    padding: 0;

    :deep(.ak-icon) {
      transition: transform var(--ak-dur-fast);
    }

    &.is-open :deep(.ak-icon) {
      transform: rotate(90deg);
    }
  }

  &__operator,
  &__operator-head {
    width: 60px;
    text-align: center;
    vertical-align: middle;
  }

  &__op {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 50px;

    img {
      display: block;
    }
  }

  &__type {
    margin: 5px 0;
    background: #2f2f2f;
  }

  &__data {
    min-width: 0;
    vertical-align: top;
  }

  &__detail > td {
    padding: 0;
    background: transparent !important;
  }

  &__detail:hover > td {
    background: transparent !important;
  }
}

.ep-table-wrap--narrow {
  .ep-table__col-expand {
    width: 30px;
  }

  .ep-table__col-operator {
    width: 55px;
  }

  .ep-table__expand {
    width: 30px;
    padding: 0 !important;
  }

  .ep-table__operator,
  .ep-table__operator-head {
    width: 50px;
    padding-left: 3px;
    padding-right: 3px;
  }

  .ep-table__op {
    min-width: 0;

    img {
      width: 45px !important;
      height: auto !important;
    }
  }

  .ep-table__type {
    margin: 3px 0;
  }

  .ep-table th,
  .ep-table td {
    padding: 4px 6px;
  }

  .ep-table__data {
    overflow-wrap: anywhere;
  }

  .ep-table.top,
  .ep-table-foot {
    gap: 6px;
  }
}

.ep-table.top,
.ep-table-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: var(--ak-space-3);
}

.ep-table-top {
  margin-bottom: var(--ak-space-3);
}

.ep-table__page-size {
  width: auto;
  min-height: 32px;
  font-size: var(--ak-fs-xs);
}
</style>
