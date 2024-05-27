<!-- 元素宽度小于等于640px -->
<script setup lang="ts">
import { ref, toRefs } from "vue";

import Avatar from "@/components/Avatar.vue";
import { PRTS_BASE_DOMAIN } from "@/utils/consts";

import { useChar } from "./useChar";

import type { Char } from "../utils";
const props = defineProps<{
  row: Char;
  addTrust?: boolean; // 是否加算信赖
  addPotential?: boolean; // 是否加算潜能
}>();

const collapsed = ref(true);
const { addTrust, addPotential } = toRefs(props);
const { hp, atk, def, res, cost, reDeploy } = useChar(
  props.row,
  addTrust,
  addPotential,
);
</script>

<template>
  <div class="card-container">
    <div class="basic">
      <div class="avatar">
        <Avatar
          :rarity="row.rarity"
          :profession="row.profession"
          :name="row.zh"
        />
      </div>
      <div class="info">
        <div class="name">
          <div class="zh">
            <a :href="`${PRTS_BASE_DOMAIN}/w/${row.zh}`">
              <div>{{ row.zh }}</div>
            </a>
          </div>
          <div class="id">
            {{ row.id }}
          </div>
          <div class="en">
            {{ row.en }}
          </div>
          <div class="ja">
            {{ row.ja }}
          </div>
        </div>
        <div class="sp">
          <div class="head">性别</div>
          <div class="head">位置</div>
          <div class="button">
            <div @click="collapsed = !collapsed">
              <svg
                v-show="collapsed"
                t="1590476789572"
                class="icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="6592"
                width="24"
                height="24"
              >
                <path
                  d="M500.8 604.779L267.307 371.392l-45.227 45.27 278.741 278.613L779.307 416.66l-45.248-45.248z"
                  p-id="6593"
                />
              </svg>
              <svg
                v-show="!collapsed"
                t="1590477111828"
                class="icon"
                viewBox="0 0 1024 1024"
                version="1.1"
                xmlns="http://www.w3.org/2000/svg"
                p-id="6715"
                width="24"
                height="24"
              >
                <path
                  d="M500.8 461.909333L267.306667 695.296l-45.226667-45.269333 278.741333-278.613334L779.306667 650.026667l-45.248 45.226666z"
                  p-id="6716"
                />
              </svg>
            </div>
          </div>
          <div>{{ row.sex }}</div>
          <div>{{ row.position }}</div>
        </div>
      </div>
    </div>
    <Transition name="slide-fade">
      <div v-if="!collapsed" class="expand-panel">
        <div class="story">
          <div class="head">子职业</div>
          <div class="head">势力</div>
          <div class="head">出身地</div>
          <div class="head">种族</div>
          <div>{{ row.subProfession }}</div>
          <div>{{ row.force.join("-") }}</div>
          <div>{{ row.birthPlace }}</div>
          <div>{{ row.race.join("/") }}</div>
        </div>
        <div class="data1">
          <div class="head">生命值</div>
          <div class="head">攻击力</div>
          <div class="head">防御</div>
          <div class="head">法术抗性</div>
          <div>{{ hp }}</div>
          <div>{{ atk }}</div>
          <div>{{ def }}</div>
          <div>{{ res }}</div>
        </div>
        <div class="data2">
          <div class="head">再部署</div>
          <div class="head">部署费用</div>
          <div class="head">阻挡数</div>
          <div class="head">攻击间隔</div>
          <div>{{ reDeploy }}</div>
          <div>{{ cost }}</div>
          <div>{{ row.block }}</div>
          <div>{{ row.interval }}</div>
        </div>
        <div class="tags">
          <!-- <div>标签</div> -->
          <div class="tag">
            <div v-for="(tag, i) in row.tag" :key="i">
              {{ tag }}
            </div>
          </div>
        </div>
        <div class="head feature">
          <slot />
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.card-container {
  width: calc(100% - 18px);
  border-radius: 10px;
  border: 1px solid #a2a9b1;
  background-color: #f8f9fa;
  margin: 3px;
  padding: 5px;
}
.avatar {
  width: 100px;
  height: 100px;
}
.basic {
  display: flex;
}
.info {
  flex: 1;
  display: grid;
  grid-template: 1fr, 1fr;
}
.name {
  display: flex;
  flex-wrap: wrap;
  flex-direction: row;
}
.name > div {
  flex-grow: 1;
}
.sp {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(3, 1fr);
}
.button {
  grid-column: 3/4;
  grid-row: 1/3;
  display: flex;
  align-items: center;
  justify-content: center;
}
.button > div {
  width: 36px;
  height: 31px;
  padding-top: 5px;
}
.button > div:hover {
  border-radius: 50%;
  background-color: rgba(213, 215, 219, 0.4);
}
.story {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(4, 1fr);
}
.data1,
.data2 {
  display: grid;
  grid-template: repeat(2, 1fr) / repeat(4, 1fr);
}
.tags {
  display: flex;
}
.tag {
  flex-grow: 1;
  display: flex;
  justify-content: space-around;
}
.tag > div {
  flex-grow: 0;
  border-radius: 10px;
  border: 1px solid #a2a9b1;
  padding: 0px 3px;
}
.head {
  background-color: rgba(213, 215, 219, 0.4);
}
.expand-panel {
  overflow: hidden;
}
</style>
