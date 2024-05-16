<script lang="ts">
import { useVModel } from "@vueuse/core";
import { DataTableColumns, NDataTable } from "naive-ui";
import {
  PropType,
  Ref,
  defineComponent,
  h,
  inject,
  onBeforeMount,
  ref,
  watch,
} from "vue";

import { getLanguage, LANGUAGES } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import Equip from "./Equip.vue";
import { getEquipData } from "./equipData";
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
  },
  props: {
    chars: {
      type: Array as PropType<Char[]>,
      required: true,
    },
  },
  emits: ["update:chars"],
  setup(props, { emit }) {
    const charEquipData = ref<EquipRow[]>([]);
    const loading = ref(false);
    const loadingCount = inject("loadingCount") as Ref<number>;
    const createData = (): EquipRow[] => {
      return charEquipData.value;
    };
    const createRowKey = (row: EquipRow) => {
      return row.operator + "." + row.name;
    };
    const charList = useVModel(props, "chars", emit);
    watch(charList, async () => {
      loading.value = true;
      loadingCount.value += charList.value.length;
      charEquipData.value = [];
      const promises = charList.value.map((char) => {
        return getEquipData(char.name);
      });
      Promise.all(promises).then((values) => {
        for (const v of values) {
          const rawdata = (v ?? {}) as DOMStringMap[];
          for (const e of rawdata) {
            charEquipData.value.push({
              name: e.name ?? "",
              type: e.type ?? "",
              operator: e.opt ?? "",
              data: e ?? [],
            });
          }
        }
        loading.value = false;
        loadingCount.value -= charList.value.length;
      });
    });
    onBeforeMount(async () => {
      loading.value = true;
      loadingCount.value += charList.value.length;
      for (const c of charList.value) {
        const rawdata = ((await getEquipData(c.name)) ?? []) as DOMStringMap[];
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
    });
    return {
      createData,
      columns,
      charList,
      createRowKey,
      loading,
      locale: getLanguage(),
    };
  },
});
</script>
<template>
  <NDataTable
    :columns="columns(locale)"
    :data="createData()"
    :loading="loading"
    :row-key="createRowKey"
    remote
  ></NDataTable>
</template>
