<!-- 元素宽度小于等于800且大于640 -->
<script lang="ts">
import type { PropType } from "vue";
import { defineComponent, toRefs } from "vue";

import Avatar from "@/components/Avatar.vue";
import { PRTS_BASE_DOMAIN } from "@/utils/utils";

import type { Char } from "../utils";

import { useChar } from "./useChar";

export default defineComponent({
  name: "Short",
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
      domain: PRTS_BASE_DOMAIN,
      hp,
      atk,
      def,
      res,
      cost,
      reDeploy,
    };
  },
});
</script>

<template>
  <div class="short-container">
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
    <div class="data">
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
    <div class="property">
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
    <div class="obtain">
      <div v-for="(obtain, i) in row.obtainMethod" :key="i">
        {{ obtain }}
      </div>
    </div>
    <div class="tag">
      <div class="sex">
        {{ row.sex }}
      </div>
      <div class="position">
        {{ row.position }}
      </div>
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
.short-container {
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
.short-container > div {
  display: flex;
  align-items: center;
  justify-content: center;
}
.data,
.property,
.obtain,
.tag {
  flex-direction: column;
}
.name,
.camp,
.data,
.property,
.obtain,
.tag {
  width: 60px;
  flex: 1;
}
.feature {
  flex: 2 1;
}
</style>
