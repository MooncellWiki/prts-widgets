<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeMount,
  reactive,
  ref,
  watch,
  type Ref,
} from "vue";

import { useBreakpoints, useUrlSearchParams } from "@vueuse/core";
import Cookies from "js-cookie";
import { NCollapseTransition } from "naive-ui";

import Avatar from "@/components/Avatar.vue";
import Checkbox from "@/components/Checkbox.vue";
import CheckboxGroup from "@/components/CheckboxGroup.vue";
import FilterRow from "@/components/FilterRow.vue";
import Half from "@/components/Half.vue";
import Pagination from "@/components/Pagination.vue";

import LHead from "./head/LHead.vue";
import SHead from "./head/SHead.vue";
import Card from "./row/Card.vue";
import Long from "./row/Long.vue";
import Short from "./row/Short.vue";

import type { Char, CheckboxOption, FilterGroup } from "./utils";

interface State {
  both: boolean;
  selected: Record<string, boolean>;
  meta: {
    cbt: CheckboxOption[];
    title: string;
    field: string;
    groupTitle: string;
  };
}

function copyUrl() {
  const url = `${location.origin}/w/CHAR${location.hash}`;
  window.navigator.clipboard.writeText(url);
  // eslint-disable-next-line no-alert
  alert(`链接已复制: ${url}`);
}

function flat(cbt: CheckboxOption[]) {
  return cbt.map((v) => {
    if (typeof v === "string") return v;
    return v.label;
  });
}
const props = defineProps<{
  filters: FilterGroup[];
  source: Char[];
}>();

const breakpoints = useBreakpoints({
  small: 640,
  big: 1024,
});
const card = breakpoints.smallerOrEqual("small");
const short = breakpoints.between("small", "big");
const long = breakpoints.greaterOrEqual("big");
const fix = ref(false);

const page = ref({
  index: 1,
  step: 50,
});
const states = reactive<State[][]>(
  props.filters.map((fg) => {
    return fg.filter.flatMap((f) => {
      return {
        selected: {},
        both: false,
        meta: {
          cbt: f.cbt,
          title: f.title,
          field: f.field,
          groupTitle: fg.title,
        },
      };
    });
  }),
); // 筛选 六维筛选 标志/出身地/团队/种族筛选
const opFilterExpandState = Cookies.get("opFilterExpandState");
const expanded: Ref<Array<boolean>> = ref(
  opFilterExpandState ? JSON.parse(opFilterExpandState) : [true, false, false],
); // 筛选 六维筛选 标志/出身地/团队/种族筛选 折叠状态

const sortMethod = ref("实装倒序");
const sortMethods = ref([
  "实装顺序",
  "实装倒序",
  "名称升序",
  "名称降序",
  "稀有度升序",
  "稀有度降序",
]);
const searchText = ref("");
const dataTypes = ref(["满潜能", "满信赖"]);
const currDataTypes: Ref<Record<string, boolean>> = ref({
  满潜能: false,
  满信赖: false,
});
const displayModes = ref(["表格", "半身像", "头像"]);
const currDisplayMode = ref("表格");

const dimmedMaps: Record<string, any>[][] = reactive(
  props.filters.map((fg) => fg.filter.map(() => ({}))),
);

const toggleCollapse = (index: number) => {
  expanded.value[index] = !expanded.value[index];
  Cookies.set("opFilterExpandState", JSON.stringify(expanded.value), {
    expires: 365,
  });
};
const onStepChange = ({ n, o }: { n: number; o: number }) => {
  if (o < n) {
    page.value.index = Math.ceil((o / n) * page.value.index);
  } else if (page.value.index >= 1)
    page.value.index = ((page.value.index - 1) * o) / n + 1;
  page.value.step = n;
};
function predicate(filter: State, char: Char) {
  if (searchText.value) {
    const tags = ["zh", "en", "ja", "id", "plainFeature"];
    const text = tags.some((key) => {
      return (char[key as keyof Char] as string).includes(searchText.value);
    });
    if (!text) return false;
  }
  const value = char[filter.meta.field as keyof Char];

  const selected = Object.entries(filter.selected)
    .filter(([, v]) => v)
    .map(([k]) => k);
  const range = selected.flatMap((s) => {
    const option = filter.meta.cbt.find((v) => {
      if (typeof v === "string") return v === s;
      return v.label === s;
    })!;
    if (typeof option === "string") return [option];
    return option.value;
  });
  if (filter.both) {
    return range.every((k) => {
      return (value as string[]).includes(k);
    });
  }
  if (range.length === 0) return true;
  if (filter.meta.title === "稀有度")
    return filter.selected[`★${1 + char.rarity}`];
  if (filter.meta.title === "性别") {
    if (filter.selected["其他"])
      return (
        filter.selected[`${char.sex}性`] ||
        (char.sex !== "男" && char.sex !== "女")
      );
    return filter.selected[`${char.sex}性`];
  }

  if (filter.meta.cbt.includes("其他")) {
    // 其他的时候一定没同时满足
    if (filter.selected["其他"]) {
      const allValues = new Set(
        filter.meta.cbt.flatMap((v) => {
          if (typeof v === "string") return [v];
          return v.value;
        }),
      );
      if (Array.isArray(value)) {
        if (range.some((v) => (value as string[]).includes(v))) return true;
        if (value.some((v) => !allValues.has(v as string))) return true;
        return false;
      }
      if (range.includes(value as string)) return true;
      if (!allValues.has(value as string)) return true;
      return false;
    }
    if (Array.isArray(value))
      return range.some((v) => (value as string[]).includes(v));
    return range.includes(value as string);
  }
  if (Array.isArray(value))
    return range.some((v) => (value as string[]).includes(v));
  return range.includes(value as string);
}
const oridata = computed(() => {
  const filters = props.filters;

  const result = props.source.filter((char) => {
    for (const group of states) {
      for (const filter of group) {
        if (!predicate(filter, char)) return false;
      }
    }
    return true;
  });

  switch (sortMethod.value) {
    case "实装顺序": {
      result.sort((a, b) => a.sortId - b.sortId);
      break;
    }
    case "实装倒序": {
      result.sort((a, b) => b.sortId - a.sortId);
      break;
    }
    case "名称升序": {
      result.sort((a, b) => a.zh.localeCompare(b.zh, "zh"));
      break;
    }
    case "名称降序": {
      result.sort((a, b) => b.zh.localeCompare(a.zh, "zh"));
      break;
    }
    case "稀有度升序": {
      result.sort((a, b) => {
        const r = a.rarity - b.rarity;
        if (r === 0) {
          const classes = filters[0].filter[0].cbt;
          const o =
            classes.indexOf(a.profession) - classes.indexOf(b.profession);
          return o === 0 ? a.zh.localeCompare(b.zh, "zh") : o;
        } else {
          return r;
        }
      });
      break;
    }
    case "稀有度降序": {
      result.sort((a, b) => {
        const r = b.rarity - a.rarity;
        if (r === 0) {
          const classes = filters[0].filter[0].cbt;
          const o =
            classes.indexOf(a.profession) - classes.indexOf(b.profession);
          return o === 0 ? a.zh.localeCompare(b.zh, "zh") : o;
        } else {
          return r;
        }
      });
      break;
    }
  }
  return result;
});

function computeDimmedMaps() {
  for (let fi = 0; fi < props.filters.length; fi++) {
    const fg = props.filters[fi];
    for (let fj = 0; fj < fg.filter.length; fj++) {
      const f = fg.filter[fj];
      const labels = flat(f.cbt);
      const map: Record<string, boolean> = {};

      // 创建 states 副本
      const tempStates = states.map((group) =>
        group.map((s) => ({
          both: s.both,
          selected: { ...s.selected },
          meta: s.meta,
        })),
      );

      const originalSelected = tempStates[fi][fj].selected;

      for (const label of labels) {
        // 临时替换选中项为仅包含当前 label
        tempStates[fi][fj].selected = { [label]: true };

        const exists = props.source.some((char) => {
          for (const g of tempStates) {
            for (const sf of g) {
              if (!predicate(sf as State, char)) return false;
            }
          }
          return true;
        });
        map[label] = !exists;
      }

      tempStates[fi][fj].selected = originalSelected;
      dimmedMaps[fi][fj] = map;
    }
  }
}

computeDimmedMaps();
watch(
  states,
  () => {
    computeDimmedMaps();
  },
  { deep: true },
);

watch(oridata, () => {
  page.value.index = 1;
});
const data = computed(() => {
  const start = (page.value.index - 1) * page.value.step;

  return oridata.value.slice(start, start + page.value.step);
});
const hash = useUrlSearchParams("hash");
watch(searchText, () => {
  // @ts-expect-error string
  hash._s = searchText.value || undefined;
});
watch(states, () => {
  for (const s of states) {
    for (const element of s) {
      const selected = Object.entries(element.selected).filter(([, v]) => v);
      if (selected.length === 0) {
        delete hash[element.meta.field];
        continue;
      }
      const fields = selected.map(([k]) => k.replace("★", "")).join(";");
      const both = element.both ? "0-" : "1-";
      hash[element.meta.field] = both + fields;
    }
  }
});
watch(sortMethod, () => {
  hash._o = `${sortMethods.value.indexOf(sortMethod.value)}`;
});
watch(
  currDataTypes,
  () => {
    let result = "";
    if (currDataTypes.value["满潜能"]) result += "p";

    if (currDataTypes.value["满信赖"]) result += "t";
    // @ts-expect-error string
    hash._f = result || undefined;
  },
  { deep: true },
);
watch(currDisplayMode, () => {
  hash._d = `${displayModes.value.indexOf(currDisplayMode.value)}`;
});
onBeforeMount(() => {
  // too hard to refactor
  // eslint-disable-next-line unicorn/no-array-for-each
  Object.entries(hash).forEach(([k, v]) => {
    if (k === "_s") {
      searchText.value = v as string;
      return;
    }
    if (k === "_o") {
      sortMethod.value = sortMethods.value[Number.parseInt(v as string)];
      return;
    }
    if (k === "_f") {
      if (v.includes("p")) currDataTypes.value["满潜能"] = true;
      if (v.includes("t")) currDataTypes.value["满信赖"] = true;
      return;
    }
    if (k === "_d") {
      currDisplayMode.value = displayModes.value[Number.parseInt(v as string)];
      return;
    }

    const both = v[0] === "0";
    const selected = (v as string).slice(2).split(";");
    for (const state of states) {
      for (const element of state) {
        if (element.meta.field === k) {
          element.both = both;
          for (let f of selected) {
            if (k === "rarity") f = `★${f}`;

            element.selected[f] = true;
          }
          return;
        }
      }
    }
  });
});

function hasSelected(states: State[]) {
  return states.some((state) => {
    return Object.values(state.selected).some(Boolean);
  });
}
const resultTable = ref<HTMLElement>();
watch(data, () => {
  nextTick(() => {
    try {
      const elements = resultTable.value?.querySelectorAll(".mc-tooltips");
      if (!elements) {
        return;
      }
      for (const e of Array.from(elements)) {
        if (!e.children || e.children.length < 2) continue;
        (e.children[1] as HTMLElement).style.display = "block";
        // @ts-expect-error tippy

        tippy6(e.children[0], {
          content: e.children[1],
          arrow: true,
          theme: "light-border",
          size: "large",
          maxWidth: Number.parseInt(
            (e.children[1] as HTMLElement).dataset.size!,
          ),
          trigger:
            (e.children[1] as HTMLElement).dataset.trigger ||
            "mouseenter focus",
        });
      }
    } catch (error) {
      console.error(error);
    }
  });
});
</script>

<template>
  <div id="app">
    <div v-for="(v, i) in filters" :key="v.title" class="filter">
      <div
        class="filter-title"
        :class="{
          enabled: hasSelected(states[i].flat()),
        }"
      >
        {{ v.title }}
      </div>

      <div class="collapsible" @click="toggleCollapse(i)">
        <span v-if="expanded[i]" class="mdi mdi-chevron-up text-2xl" />
        <span v-else class="mdi mdi-chevron-down text-2xl" />
      </div>
      <NCollapseTransition :show="expanded[i]">
        <FilterRow
          v-for="(v2, i2) in v.filter"
          :key="v2.title"
          v-model="states[i][i2].selected"
          v-model:both="states[i][i2].both"
          :title="v2.title"
          :labels="flat(v2.cbt)"
          :show-both="v2.both"
          :no-width="i === 2"
          :dimmed-labels="dimmedMaps[i][i2]"
        />
      </NCollapseTransition>
    </div>
    <div class="control">
      <div>排序方式</div>
      <CheckboxGroup v-model="sortMethod" is-radio class="order">
        <Checkbox v-for="v in sortMethods" :key="v" :value="v">
          {{ v }}
        </Checkbox>
      </CheckboxGroup>
    </div>
    <div class="mode">
      <input v-model="searchText" placeholder="搜索干员名称/特性" />
      <CheckboxGroup v-model="currDataTypes">
        <Checkbox v-for="v in dataTypes" :key="v" :value="v">
          {{ v }}
        </Checkbox>
      </CheckboxGroup>
      <CheckboxGroup v-model="currDisplayMode" is-radio>
        <Checkbox v-for="v in displayModes" :key="v" :value="v">
          {{ v }}
        </Checkbox>
      </CheckboxGroup>
    </div>

    <div id="pagination">
      <div class="btn" @click="copyUrl">复制短链接</div>
      <Pagination
        v-model:index="page.index"
        :length="oridata.length"
        :step="page.step"
        @update:step="onStepChange"
      />
    </div>
    <div id="result">
      <SHead v-if="currDisplayMode === '表格' && short" :class="{ fix }" />
      <LHead v-else-if="currDisplayMode === '表格' && long" :class="{ fix }" />
      <div
        id="filter-result"
        ref="resultTable"
        :class="{
          showhead: currDisplayMode === '头像',
          showavatar: currDisplayMode === '半身像',
        }"
      >
        <template v-if="currDisplayMode === '半身像'">
          <Half
            v-for="v in data"
            :key="v.sortId"
            :profession="v.profession"
            :rarity="v.rarity"
            :logo="v.logo"
            :zh="v.zh"
            :en="v.en"
          />
        </template>
        <template v-if="currDisplayMode === '头像'">
          <Avatar
            v-for="v in data"
            :key="v.sortId"
            :profession="v.profession"
            :rarity="v.rarity"
            :name="v.zh"
          />
        </template>
        <template v-if="currDisplayMode === '表格' && short">
          <Short
            v-for="v in data"
            :key="v.sortId"
            :row="v"
            :add-trust="currDataTypes['满信赖']"
            :add-potential="currDataTypes['满潜能']"
          >
            <div v-html="v.feature" />
          </Short>
        </template>
        <template v-if="currDisplayMode === '表格' && long">
          <Long
            v-for="v in data"
            :key="v.sortId"
            :row="v"
            :add-trust="currDataTypes['满信赖']"
            :add-potential="currDataTypes['满潜能']"
          >
            <div v-html="v.feature" />
          </Long>
        </template>
        <template v-if="currDisplayMode === '表格' && card">
          <Card
            v-for="v in data"
            :key="v.sortId"
            :row="v"
            :add-trust="currDataTypes['满信赖']"
            :add-potential="currDataTypes['满潜能']"
          >
            <div v-html="v.feature" />
          </Card>
        </template>
      </div>
    </div>
    <Pagination
      v-model:index="page.index"
      :length="oridata.length"
      :step="page.step"
      @update:step="onStepChange"
    />
  </div>
</template>

<style>
.slide-fade-enter-active {
  transition: all 0.3s ease-out;
}

.slide-fade-leave-active {
  transition: all 0.3s ease-out;
}

.slide-fade-enter-from,
.slide-fade-leave-to {
  transform: translateY(-5px);
  opacity: 0;
}
</style>

<style scoped>
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  color: #2c3e50;
  max-width: 1353px;
}
.filter {
  width: 100%;
  position: relative;
  box-shadow:
    0 3px 1px -2px rgba(0, 0, 0, 0.2),
    0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #f8f8f8;
  margin-bottom: 5px;
}
.filter-title {
  border-left: solid rgba(0, 0, 0, 0) 0.2em;
  transition: ease 0.5s;
  padding: 7px;
  box-shadow:
    0 3px 1px -2px rgba(0, 0, 0, 0.2),
    0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  font-size: 16px;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  background-color: #eaebee;
}
.collapsible {
  position: absolute;
  right: 1.1em;
  top: 0px;
  color: blue;
  cursor: pointer;
  letter-spacing: 0.08em;
  text-indent: 0.08em;
  font-weight: 700;
  width: 29px;
  height: 24px;
  padding-top: 3px;
}
.collapsible > span:hover {
  border-radius: 50%;
  background-color: rgba(213, 215, 219, 0.4);
}
.control {
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  flex-wrap: wrap;
  box-shadow:
    0 3px 1px -2px rgba(0, 0, 0, 0.2),
    0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  /* border-radius: 4px; */
  background-color: #f8f8f8;
  margin-bottom: 5px;
  padding: 3px;
}
.control > :first-child {
  height: 28px;
  /* min-width: 40px; */
  width: 60px;
  padding: 0 8px;
  display: inline-flex;
  flex: 0 0 auto;
  margin: 0.3em;
  align-items: center;
  justify-content: flex-start;
  vertical-align: middle;
}
#pagination :first-child,
.mode .checkbox-container,
.control .checkbox-container {
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
.order {
  display: flex;
  /* flex-grow: 1; */
  justify-content: flex-start;
  flex-wrap: wrap;
}
.mode {
  display: flex;
  flex-wrap: wrap;
  padding: 3px;
}
.mode > div > div {
  margin: 0.3em;
}
.order > div {
  width: 80px !important;
  margin: 0.3em;
}
input {
  flex-grow: 1;
  height: 30px;
  min-width: 280px;
  outline: 0;
  border: rgba(0, 0, 0, 0.42) solid thin;
  box-shadow:
    0 3px 1px -2px rgba(0, 0, 0, 0.2),
    0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  margin: 1px;
  padding-left: 0.5em;
  padding-right: 0.5em;
  /* padding: 2px; */
}
input:focus {
  border-color: #4487df;
}
.showavatar,
.showhead {
  display: flex;
  flex-wrap: wrap;
}
.enabled {
  border-left: solid#4487df 0.2em;
}
#pagination {
  display: flex;
  padding: 2px 0;
}
.btn {
  margin: 0.3em;
  box-shadow: 0 3px 5px grey;
  will-change: box-shadow;
  color: rgba(0, 0, 0, 0.87);
  background-color: #f5f5f5;
  height: 28px;
  min-width: 50px;
  padding: 0 8px;
  align-items: center;
  /* border-radius: 4px; */
  display: inline-flex;
  flex: 0 0 auto;
  letter-spacing: 0.08em;
  justify-content: center;
  outline: 0;
  position: relative;
  text-decoration: none;
  text-indent: 0.08em;
  vertical-align: middle;
  white-space: nowrap;
  border-width: 0px;
  cursor: pointer;
}
.btns > div {
  margin: 3px;
  width: 94px;
}
.fix {
  position: fixed;
  top: 0;
  right: 1em;
  left: 201px;
  z-index: 2;
}
@media screen and (min-width: 982px) {
  .fix {
    max-width: 1353px;
    right: 1.5em;
  }
}
.fix + #filter-result > div:first-child {
  margin-top: 100px;
}
</style>
