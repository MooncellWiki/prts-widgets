<script setup lang="ts">
import { h, inject, Ref, ref, watch } from "vue";

import { DataTableColumns, NDataTable } from "naive-ui";

import { getLanguage } from "@/utils/i18n";
import { getImagePath, isMobile } from "@/utils/utils";

import { customLabel } from "../i18n";
import { EquipRow } from "../types";

import Equip from "./Equip.vue";

const columns = (): DataTableColumns<EquipRow> => {
  return [
    {
      type: "expand",
      width: 30,
      renderExpand: (row) => {
        return h(Equip, {
          name: row.operator,
          data: [row.data],
        });
      },
    },
    {
      titleAlign: "center",
      align: "center",
      key: "operator",
      width: 60,
      render: (row) => {
        return h(
          "div",
          {
            style: {
              display: "flex",
              flexDirection: "column",
              minWidth: "50px",
            },
          },
          [
            h(
              "a",
              {
                href: `/w/${row.operator}`,
              },
              h("img", {
                src: getImagePath(`头像_${row.operator}_2.png`),
                width: 60,
              }),
            ),
            h("div", [
              h("img", {
                src: getImagePath(
                  `模组类型_${row.type.replace("Δ", "D").replace("α", "A")}_小图.png`,
                ),
                width: 60,
                style: {
                  margin: "5px 0",
                  backgroundColor: "#2f2f2f",
                },
              }),
            ]),
          ],
        );
      },
    },
    {
      titleAlign: "center",
      key: "data",
      render: (row) => {
        return h(Equip, {
          name: row.operator,
          data: [row.data],
          simple: true,
          simplemode: simplemode.value,
        });
      },
    },
  ];
};
const createRowKey = (row: EquipRow) => {
  return `${row.operator}.${row.name}`;
};
const props = defineProps<{
  data: EquipRow[];
}>();

const locale = getLanguage();
const pickSize = (): "small" | "medium" => {
  return isMobile() ? "small" : "medium";
};
const pagination = ref({
  page: 1,
  pageSize: 10,
  pageSizes: customLabel[locale].pagination,
  pageSlot: isMobile() ? 5 : 9,
  size: pickSize(),
  showSizePicker: true,
  onUpdatePage: (page: number) => {
    pagination.value.page = page;
  },
  onUpdatePageSize: (size: number) => {
    pagination.value.pageSize = size;
    pagination.value.page = 1;
  },
});
const loading = ref(false);
const simplemode = inject("simple") as Ref<string>;
watch(props, () => {
  if (
    (pagination.value.page - 1) * pagination.value.pageSize >=
    props.data.length
  )
    pagination.value.page = 1;
});
</script>

<template>
  <NDataTable
    :columns="columns()"
    :data="data"
    :loading="loading"
    :size="isMobile() ? 'small' : 'medium'"
    :row-key="createRowKey"
    :pagination="pagination"
    class="w-full"
  ></NDataTable>
</template>
