<script lang="ts">
import { defineComponent, ref, type PropType } from "vue";

import {
  NCard,
  NGi,
  NGrid,
  NNumberAnimation,
  NStatistic,
  NTooltip,
} from "naive-ui";

import type { MedalMetaData } from "./types";

export default defineComponent({
  components: {
    NStatistic,
    NCard,
    NNumberAnimation,
    NTooltip,
    NGrid: NGrid,
    NGi: NGi,
  },
  props: {
    medalMetaData: {
      type: Object as PropType<MedalMetaData>,
      required: true,
    },
  },
  setup(props) {
    const statsData = {
      star3: { data: [0, 0], name: "3★蚀刻章", indieEncrypt: true },
      star2: { data: [0, 0], name: "2★蚀刻章", indieEncrypt: true },
      star1: { data: [0, 0], name: "1★蚀刻章", indieEncrypt: true },
      trim: { data: [0, 0], name: "镀层蚀刻章", indieEncrypt: false },
      all: { data: [0, 0], name: "已有蚀刻章", indieEncrypt: false },
    };
    const statsIndies = Object.values(statsData).filter(
      (category) => category.indieEncrypt,
    );
    Object.values(props.medalMetaData.medal).forEach((medal) => {
      statsData.all.data[medal.decrypt ? 1 : 0] += 1;
      statsData[`star${medal.rarity}` as keyof typeof statsData].data[
        medal.decrypt ? 1 : 0
      ] += 1;
      statsData.trim.data[medal.decrypt ? 1 : 0] += medal.isTrim ? 1 : 0;
    });
    return {
      statsData,
      statsIndies,
      showSecret: ref(false),
    };
  },
});
</script>

<template>
  <NCard title="蚀刻章统计">
    <template #header-extra>
      <NTooltip trigger="hover">
        <template #trigger>
          <div class="m-1 cursor-pointer" @click="showSecret = !showSecret">
            <span v-if="showSecret" class="text-2xl mdi mdi-eye" />
            <span v-else class="text-2xl mdi mdi-eye-off" />
          </div>
        </template>
        显示加密蚀刻章
      </NTooltip>
    </template>
    <NGrid x-gap="12" :cols="4">
      <NGi v-for="(value, key) in statsData" :key="key">
        <NStatistic :label="value.name" :tabular-nums="true">
          <NNumberAnimation
            active
            :from="showSecret && !value.indieEncrypt ? value.data[0] : 0"
            :to="
              value.data[0] +
              (showSecret && !value.indieEncrypt ? value.data[1] : 0)
            "
            show-separator
          />
          <template #suffix>枚</template>
        </NStatistic>
      </NGi>
      <NGi v-for="(item, index) in statsIndies" :key="index">
        <NStatistic
          v-if="showSecret"
          :label="'加密' + item.name"
          :tabular-nums="true"
        >
          <NNumberAnimation
            active
            :from="item.data[0]"
            :to="item.data.reduce((a, b) => a + b, 0)"
            show-separator
          />
          <template #suffix>枚</template>
        </NStatistic>
      </NGi>
    </NGrid>
    <template #action>
      <p>
        <span class="mdi mdi-information-variant-circle" />
        可能包含暂未实装进入游戏的蚀刻章
      </p>
    </template>
  </NCard>
</template>

<style></style>
