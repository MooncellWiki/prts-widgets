<script lang="ts">
import {
  PropType,
  Ref,
  computed,
  defineComponent,
  h,
  inject,
  onBeforeMount,
  ref,
  watch,
} from "vue";

import { useVModel } from "@vueuse/core";
import { DataTableColumns, NDataTable, NPagination } from "naive-ui";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath, isMobileSkin } from "@/utils/utils";

import Equip from "./Equip.vue";
import { statsStyleMap } from "./consts";
import { getEquipDataAll } from "./equipData";
import { customLabel } from "./i18n";
import { Char } from "./types";

type EquipRow = {
  name: string;
  type: string;
  operator: string;
  data: DOMStringMap;
};

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

export default defineComponent({
  components: {
    NDataTable,
    NPagination,
  },
  props: {
    chars: {
      type: Array as PropType<Char[]>,
      required: true,
    },
    sortValue: {
      type: Object as PropType<Record<string, string>>,
      default: () => {
        return {
          mode: "default",
          value: "desc",
        };
      },
    },
    filterValue: {
      type: Array as PropType<Record<string, string>[]>,
      default: () => {
        return [
          {
            mode: "all",
            value: "yes",
          },
        ];
      },
    },
  },
  emits: ["update:chars"],
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
    const charEquipData = ref<EquipRow[]>([]);
    const loading = ref(false);
    const loadingCount = inject("loadingCount") as Ref<number>;
    const createData = (): { data: EquipRow[]; length: number } => {
      return {
        data: filterSortedEquip.value.slice(
          (pagination.value.page - 1) * pagination.value.pageSize,
          pagination.value.page * pagination.value.pageSize,
        ),
        length: filterSortedEquip.value.length,
      };
    };
    const createRowKey = (row: EquipRow) => {
      return row.operator + "." + row.name;
    };
    const charList = useVModel(props, "chars", emit);
    const filterSortEquip = () => {
      let filteredEquip = charEquipData.value.filter((e) => {
        return props.chars.some((d) => d.name == e.operator);
      });
      for (const v of props.filterValue) {
        if (v.mode == "all") continue;
        filteredEquip = filteredEquip.filter((data) => {
          if (v.mode == "trait") {
            return v.value == "yes"
              ? data.data["add"] != null
              : data.data["add"] == null;
          } else if (v.mode == "talent") {
            const match =
              data.data["talent2"]?.match("新增天赋") ||
              data.data["talent3"]?.match("新增天赋");
            return v.value == "yes" ? match : !match;
          } else {
            return v.value == "yes"
              ? data.data[v.mode] != "0"
              : data.data[v.mode] == "0";
          }
        });
      }
      if (props.sortValue.mode != "default") {
        filteredEquip.sort((x, y) => {
          const mode = props.sortValue.mode;
          const order = props.sortValue.value == "asc" ? 1 : -1;
          const numx = Number(x.data[mode + "3"]) ?? 0;
          const numy = Number(y.data[mode + "3"]) ?? 0;
          return (numx - numy) * order * (statsStyleMap[mode] ?? 1);
        });
      }
      return filteredEquip;
    };
    const filterSortedEquip = computed(filterSortEquip);
    const renewData = async () => {
      loading.value = true;
      loadingCount.value += charList.value.length;
      charEquipData.value = [];
      const temp = (await getEquipDataAll()) as Record<string, any>;
      for (const c of charList.value) {
        if (
          charEquipData.value.some((e) => {
            return e.operator == c.name;
          })
        ) {
          loadingCount.value -= 1;
          continue;
        }
        const rawdata = temp[c.name] as DOMStringMap[];
        for (const e of rawdata) {
          charEquipData.value.push({
            name: e.name ?? "",
            type: e.type ?? "",
            operator: e.opt ?? "",
            data: e ?? [],
          });
        }
        loadingCount.value -= 1;
      }
      loading.value = false;
      pagination.value.page = 1;
    };
    watch(charList, renewData);
    watch(props, () => {
      pagination.value.page = 1;
    });
    onBeforeMount(() => {
      renewData();
    });
    return {
      createData,
      columns,
      charList,
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
