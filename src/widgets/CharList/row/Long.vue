<!-- 元素宽度大于900时 -->
<script lang="ts">
import type { PropType } from "vue";
import { defineComponent, toRefs } from "vue";

import Avatar from "@/components/Avatar.vue";
import { domain } from "@/utils/utils";

import type { Char } from "../utils";

import { useChar } from "./useChar";

export default defineComponent({
  name: "Long",
  components: { Avatar },
  props: {
    row: { type: Object as PropType<Char>, required: true },
    addTrust: Boolean, // 是否加算信赖
    addPotential: Boolean, // 是否加算潜能
  },
  setup(props) {
    const { addTrust, addPotential } = toRefs(props);
    const { hp, atk, def, res, cost, reDeploy } = useChar(
      props.row,
      addTrust,
      addPotential,
    );

    return {
      hp,
      atk,
      def,
      res,
      cost,
      reDeploy,
      domain,
    };
  },
});
</script>

<template>
  <div class="long-container">
    <div class="avatar">
      <Avatar
        :rarity="row.rarity"
        :profession="row.profession"
        :name="row.zh"
      />
    </div>
    <div class="name">
      <div>
        <a :href="`${domain}/w/${row.zh}`">
          <div>{{ row.zh }}</div>
        </a>
        <div>{{ row.en }}</div>
        <div>{{ row.ja }}</div>
        <div>{{ row.id }}</div>
      </div>
    </div>
    <div class="camp">
      <div>
        <div>{{ row.subProfession }}</div>
        <div>{{ row.force.join("-") }}</div>
        <div>{{ row.birthPlace }}</div>
        <div>{{ row.race.join("/") }}</div>
      </div>
    </div>
    <div class="data1">
      <div class="hp">
        {{ hp }}
      </div>
      <div class="atk">
        {{ atk }}
      </div>
      <div class="def">
        {{ def }}
      </div>
      <div class="res">
        {{ res }}
      </div>
    </div>
    <div class="data2">
      <div class="re_deploy">
        {{ reDeploy }}
      </div>
      <div class="cost">
        {{ cost }}
      </div>
      <div class="block">
        {{ row.block }}
      </div>
      <div class="interval">
        {{ row.interval }}
      </div>
    </div>
    <div class="other">
      <div class="sex">
        {{ row.sex }}
      </div>
      <div class="position">
        {{ row.position }}
      </div>
    </div>
    <div class="obtain">
      <div v-for="(obtain, i) in row.obtainMethod" :key="i">
        {{ obtain }}
      </div>
    </div>
    <div class="tag">
      <div v-for="(tag, i) in row.tag" :key="i">
        {{ tag }}
      </div>
    </div>
    <div class="feature">
      <div><slot /></div>
    </div>
  </div>
</template>

<style scoped>
.long-container {
  width: 100%;
  display: flex;
  flex-wrap: nowrap;
  align-items: stretch;
  margin-top: 6px;
  box-shadow:
    0 3px 1px -2px rgba(0, 0, 0, 0.2),
    0 2px 2px 0 rgba(0, 0, 0, 0.14),
    0 1px 5px 0 rgba(0, 0, 0, 0.12);
  background-color: #f8f9fa;
}
.long-container > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
.camp,
.data1,
.data2,
.other,
.obtain,
.tag {
  flex-direction: column;
  width: 70px;
  flex: 1;
}
.name {
  width: 140px;
  flex: 1.8;
}
.feature {
  flex: 3 1;
}
</style>
