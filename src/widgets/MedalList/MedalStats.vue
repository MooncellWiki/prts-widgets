<script lang="ts">
import { computed, defineComponent, ref, type PropType } from "vue";

import { NCard, NNumberAnimation, NStatistic, NTooltip } from "naive-ui";

import type { MedalMetaData } from "./types";

export default defineComponent({
  components: {
    NStatistic,
    NCard,
    NNumberAnimation,
    NTooltip,
  },
  props: {
    medalMetaData: {
      type: Object as PropType<MedalMetaData>,
      required: true,
    },
  },
  setup(props) {
    const showSecret = ref(false);
    const statsData = {
      star3: { data: [0, 0], name: "3★蚀刻章", indieEncrypt: true },
      star2: { data: [0, 0], name: "2★蚀刻章", indieEncrypt: true },
      star1: { data: [0, 0], name: "1★蚀刻章", indieEncrypt: true },
      trim: { data: [0, 0], name: "镀层蚀刻章", indieEncrypt: false },
      all: { data: [0, 0], name: "已有蚀刻章", indieEncrypt: false },
    };
    const statsIndies = computed(() =>
      showSecret.value
        ? Object.values(statsData).filter((category) => category.indieEncrypt)
        : [],
    );
    Object.values(props.medalMetaData.medal).forEach((medal) => {
      statsData.all.data[medal.isHidden ? 1 : 0] += 1;
      statsData[`star${medal.rarity}` as keyof typeof statsData].data[
        medal.isHidden ? 1 : 0
      ] += 1;
      statsData.trim.data[medal.isHidden ? 1 : 0] += medal.isTrim ? 1 : 0;
    });
    return {
      statsData,
      statsIndies,
      showSecret,
    };
  },
});
</script>

<template>
  <NCard title="蚀刻章统计" size="small">
    <template #header-extra>
      <NTooltip trigger="hover">
        <template #trigger>
          <div class="m-1 cursor-pointer" @click="showSecret = !showSecret">
            <span v-if="showSecret" class="text-2xl mdi mdi-eye" />
            <span v-else class="text-2xl mdi mdi-eye-off" />
          </div>
        </template>
        ？？？
      </NTooltip>
    </template>
    <div class="grid <lg:grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="(value, key) in statsData" :key="key">
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
      </div>
      <div v-for="(item, index) in statsIndies" :key="index">
        <NStatistic :label="'加密' + item.name" :tabular-nums="true">
          <NNumberAnimation
            active
            :from="0"
            :to="item.data[1]"
            show-separator
          />
          <template #suffix>枚</template>
        </NStatistic>
      </div>
    </div>
    <template #action>
      <p>
        <span class="mdi mdi-information-variant-circle" />
        可能包含暂未实装进入游戏的蚀刻章
      </p>
    </template>
  </NCard>
</template>

<style></style>
