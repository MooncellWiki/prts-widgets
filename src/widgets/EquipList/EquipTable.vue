<script lang="ts">
import { PropType, defineComponent, h, ref, watch } from "vue";

import { DataTableColumns, NDataTable } from "naive-ui";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath, isMobile } from "@/utils/utils";

import Equip from "./Equip.vue";
import { customLabel } from "./i18n";
import { EquipRow } from "./types";

const columns = (locale: LANGUAGES): DataTableColumns<EquipRow> => {
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
  },
  props: {
    data: {
      type: Array as PropType<EquipRow[]>,
      required: true,
    },
  },
  setup(props) {
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
    watch(props, () => {
      if (
        (pagination.value.page - 1) * pagination.value.pageSize >=
        props.data.length
      )
        pagination.value.page = 1;
    });
    return {
      columns,
      createRowKey,
      loading,
      customLabel,
      locale,
      pagination,
      isMobile,
    };
  },
});
</script>
<template>
  <NDataTable
    :columns="columns(locale)"
    :data="data"
    :loading="loading"
    :size="isMobile() ? 'small' : 'medium'"
    :row-key="createRowKey"
    :pagination="pagination"
  ></NDataTable>
</template>
