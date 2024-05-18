<script lang="ts">
import { PropType, defineComponent, h, ref, watch } from "vue";

import { useVModel } from "@vueuse/core";
import { DataTableColumns, NDataTable, NPagination } from "naive-ui";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath, isMobileSkin } from "@/utils/utils";

import Equip from "./Equip.vue";
import { customLabel } from "./i18n";
import { EquipRow } from "./types";

const columns = (locale: LANGUAGES): DataTableColumns<EquipRow> => {
  return [
    {
      type: "expand",
      renderExpand: (row) => {
        return h(Equip, {
          name: row.operator,
          data: [row.data],
        });
      },
    },
    {
      title: customLabel[locale].tableTitle.name,
      titleAlign: "center",
      align: "center",
      key: "operator",
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
                  `模组类型_${row.type.replace("Δ", "D")}_小图.png`,
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
      title: customLabel[locale].tableTitle.data,
      titleAlign: "center",
      key: "data",
      render: (row) => {
        return h(Equip, {
          name: row.operator,
          data: [row.data],
          simple: true,
        });
      },
    },
  ];
};
const createRowKey = (row: EquipRow) => {
  return row.operator + "." + row.name;
};

export default defineComponent({
  components: {
    NDataTable,
    NPagination,
  },
  props: {
    data: {
      type: Array as PropType<EquipRow[]>,
      required: true,
    },
  },
  emits: ["update:data"],
  setup(props, { emit }) {
    const isMobile = isMobileSkin();
    const locale = getLanguage();
    const pagination = ref({
      page: 1,
      pageSize: 10,
      pageSizes: customLabel[locale].pagination,
      pageSlot: isMobile ? 5 : 9,
      pickSize: () => {
        return isMobile ? "small" : "medium";
      },
    });
    const loading = ref(false);
    const createData = (): { data: EquipRow[]; length: number } => {
      return {
        data: equipList.value.slice(
          (pagination.value.page - 1) * pagination.value.pageSize,
          pagination.value.page * pagination.value.pageSize,
        ),
        length: equipList.value.length,
      };
    };
    const equipList = useVModel(props, "data", emit);
    watch(props, () => {
      pagination.value.page = 1;
    });
    return {
      createData,
      columns,
      equipList,
      createRowKey,
      loading,
      customLabel,
      locale,
      pagination,
    };
  },
});
</script>
<template>
  <NPagination
    v-model:page="pagination.page"
    class="justify-center my-2"
    :item-count="createData().length"
    :page-size="pagination.pageSize"
    :page-sizes="pagination.pageSizes"
    :page-slot="pagination.pageSlot"
    :size="pagination.pickSize()"
    show-size-picker
    @update:page="
      (page) => {
        pagination.page = page;
      }
    "
    @update:page-size="
      (size) => {
        pagination.pageSize = size;
        pagination.page = 1;
      }
    "
  />
  <NDataTable
    :columns="columns(locale)"
    :data="createData().data"
    :loading="loading"
    :row-key="createRowKey"
    remote
  ></NDataTable>
  <NPagination
    v-model:page="pagination.page"
    class="justify-center my-2"
    :item-count="createData().length"
    :page-size="pagination.pageSize"
    :page-sizes="pagination.pageSizes"
    :page-slot="pagination.pageSlot"
    :size="pagination.pickSize()"
    show-size-picker
    @update:page-size="
      () => {
        pagination.page = 1;
      }
    "
  />
</template>
