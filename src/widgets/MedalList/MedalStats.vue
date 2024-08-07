<script setup lang="ts">
import { computed, ref } from "vue";

import { NCard, NNumberAnimation, NStatistic, NTooltip } from "naive-ui";

import type { MedalMetaData } from "./types";
const props = defineProps<{
  medalMetaData: MedalMetaData;
}>();

const showSecret = ref(false);
const statsData = computed(() => {
  const result = {
    star3: { data: [0, 0], name: "3★蚀刻章", indieEncrypt: true },
    star2: { data: [0, 0], name: "2★蚀刻章", indieEncrypt: true },
    star1: { data: [0, 0], name: "1★蚀刻章", indieEncrypt: true },
    trim: { data: [0, 0], name: "镀层蚀刻章", indieEncrypt: false },
    all: { data: [0, 0], name: "已有蚀刻章", indieEncrypt: false },
  };
  for (const medal of Object.values(props.medalMetaData.medal)) {
    result.all.data[Number(medal.isHidden)]++;
    result[`star${medal.rarity as 1 | 2 | 3}`].data[Number(medal.isHidden)]++;
    result.trim.data[Number(medal.isHidden)] += Number(medal.isTrim);
  }
  return result;
});
</script>

<template>
  <NCard title="蚀刻章统计" size="small">
    <template #header-extra>
      <NTooltip trigger="hover">
        <template #trigger>
          <div class="m-1 cursor-pointer" @click="showSecret = !showSecret">
            <span v-if="showSecret" class="mdi mdi-eye text-2xl" />
            <span v-else class="mdi mdi-eye-off text-2xl" />
          </div>
        </template>
        ？？？
      </NTooltip>
    </template>
    <div class="grid gap-4 <lg:grid-cols-2 lg:grid-cols-4">
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
      <template v-if="showSecret">
        <div
          v-for="(item, index) in Object.values(statsData).filter(
            (category) => category.indieEncrypt,
          )"
          :key="index"
        >
          <NStatistic :label="`加密${item.name}`" :tabular-nums="true">
            <NNumberAnimation
              active
              :from="0"
              :to="item.data[1]"
              show-separator
            />
            <template #suffix>枚</template>
          </NStatistic>
        </div>
      </template>
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
