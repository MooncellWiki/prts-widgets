<script lang="ts">
import { defineComponent, onMounted, ref } from "vue";

import { NButton, NConfigProvider, NSkeleton, NTabPane, NTabs } from "naive-ui";

import type { CostProps } from "../components/Cost.vue";
import CostVue from "../components/Cost.vue";
import { torappuEndPoint } from "../utils/utils";

interface cost {
  label: string;
  data: Array<CostProps>;
}
interface itemCost {
  costs: Array<cost>;
  total: {
    elite: number;
    skill: number;
    mastery: number;
    total: number;
    uniequip: number;
  };
}
interface Resp {
  [index: string]: CostProps;
}
enum Status {
  req,
  fail,
  succ,
}
async function query(name: string): Promise<itemCost> {
  const resp = await fetch(`${torappuEndPoint}/api/v1/item/${name}/demand`);
  const json = await resp.json();
  const data: Resp = json.data;
  const costs = Array.from<{ label: string; data: CostProps[] }>({ length: 6 });
  const total = {
    elite: 0,
    skill: 0,
    mastery: 0,
    uniequip: 0,
    total: 0,
  };
  for (const key of Object.keys(data)) {
    const v = data[key];
    const cost = costs[v.rarity] || {
      label: `${v.rarity}星`,
      data: [],
    };
    cost.data.push(v);
    costs[v.rarity] = cost;
    total.elite += v.elite;
    total.uniequip += v.uniequip;
    if (key !== "char_1001_amiya2") {
      // 剑兔的技能1-7的需求在阿米娅那算过了
      total.skill += v.skill;
    }
    total.mastery += v.mastery.reduce((acc, cur) => acc + cur, 0);
  }
  total.total = total.elite + total.skill + total.mastery + total.uniequip;
  return {
    costs: costs.filter(Boolean).reverse() as cost[], // 让六星排到前面
    total,
  };
}
export default defineComponent({
  components: {
    Cost: CostVue,
    NTabs,
    NTabPane,
    NButton,
    NSkeleton,
    NConfigProvider,
  },
  props: {
    item: String,
  },
  setup(props) {
    const data = ref<itemCost>();
    const state = ref(Status.req);
    async function load() {
      try {
        state.value = Status.req;
        const cost = await query(props.item!);
        data.value = cost;
        state.value = Status.succ;
      } catch (error) {
        console.warn(error);
        state.value = Status.fail;
      }
    }
    onMounted(async () => {
      if (!props.item) {
        console.warn("item empty", props);
        return;
      }
      load();
    });
    return {
      state,
      data,
      Status,
      load,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
  >
    <!-- <div class="max-w-700px box-border">
    <Cost ></Cost>
  </div> -->
    <NButton v-if="state === Status.fail" @click="load">
      加载失败 点击重试
    </NButton>
    <div
      v-else-if="state === Status.succ && data"
      class="max-w-700px"
      content-style="padding: 0;"
    >
      <div>
        <div>精英化：{{ data.total.elite }}</div>
        <div>技能1→7：{{ data.total.skill }}</div>
        <div>技能专精：{{ data.total.mastery }}</div>
        <div>模组：{{ data.total.uniequip }}</div>
        <div class="font-bold">总计：{{ data.total.total }}</div>
      </div>
      <NTabs :tabs-padding="20" size="large">
        <NTabPane
          v-for="cost in data.costs"
          :key="cost.label"
          :name="cost.label"
          class="grid grid-cols-5 <sm:grid-cols-3"
        >
          <Cost
            v-for="i in cost.data"
            :key="i.name"
            :rarity="i.rarity"
            :name="i.name"
            :profession="i.profession"
            :elite="i.elite"
            :skill="i.skill"
            :mastery="i.mastery"
            :uniequip="i.uniequip"
          />
        </NTabPane>
      </NTabs>
    </div>
    <NSkeleton v-else />
  </NConfigProvider>
</template>
