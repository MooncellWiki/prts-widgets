<template>
  <n-config-provider preflight-style-disabled :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme-overrides="{ common: { 'primaryColor': '#6a6aff' } }">
    <!-- <div class="max-w-700px box-border">
    <Cost ></Cost>
  </div> -->
    <NButton v-if="state == Status.fail" @click="load">加载失败 点击重试</NButton>
    <card v-else-if="state == Status.succ && data" class="max-w-700px" content-style="padding: 0;">
      <NTabs :tabs-padding="20" size="large">
        <NTabPane v-for="cost in data.costs" :key="cost.label" :name="cost.label"
          class="grid grid-cols-5 <sm:grid-cols-3">
          <Cost v-for="item in cost.data" :key="item.name" :rarity="item.rarity" :name="item.name"
            :profession="item.profession" :elite="item.elite" :skill="item.skill" :mastery="item.mastery"
            :uniequip="item.uniequip"></Cost>
        </NTabPane>
      </NTabs>
    </card>
    <NSkeleton v-else> </NSkeleton>
  </n-config-provider>
</template>
<script lang="ts">
import { defineComponent, onMounted, ref } from "vue";
import CostVue, { costProps } from "../components/Cost.vue";
import { apiEndPoint, professionMap } from "../utils/utils";
import {
  NTabs,
  NTabPane,
  NButton,
  NSkeleton,
  NConfigProvider,
} from "naive-ui";
import Card from "../components/Card.vue";
interface cost {
  label: string;
  data: Array<costProps>;
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
interface resp {
  [index: string]: costProps;
}
enum Status {
  req,
  fail,
  succ,
}
async function query(name: string): Promise<itemCost> {
  const data: resp = await (
    await fetch(`${apiEndPoint}/widget/itemDemand/${name}`)
  ).json();
  console.log(data);
  const costs = new Array<cost>(6);
  const total = {
    elite: 0,
    skill: 0,
    mastery: 0,
    uniequip: 0,
    total: 0,
  };
  Object.keys(data).forEach((key) => {
    const v = data[key] as costProps;
    const cost = costs[v.rarity] || { label: `${v.rarity + 1}星`, data: [] };
    cost.data.push(v);
    costs[v.rarity] = cost;
    total.elite += v.elite;
    total.uniequip += v.uniequip;
    if (key !== "char_1001_amiya2") {
      // 剑兔的技能1-7的需求在阿米娅那算过了
      total.skill += v.skill;
    }
    total.mastery += v.mastery.reduce((acc, cur) => acc + cur, 0);
  });
  total.total = total.elite + total.skill + total.mastery + total.uniequip;
  console.log(total);
  return {
    costs: costs.filter((v) => v).reverse(), // 让六星排到前面
    total,
  };
}
export default defineComponent({
  props: {
    item: String,
  },
  components: {
    Cost: CostVue,
    Card,
    NTabs,
    NTabPane,
    NButton,
    NSkeleton,
    NConfigProvider,
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
      } catch (err) {
        console.warn(err);
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
