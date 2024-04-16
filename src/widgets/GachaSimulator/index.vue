<script lang="ts">
import { PropType, computed, defineComponent, ref, type Ref } from "vue";

import {
  NButton,
  NCollapse,
  NCollapseItem,
  NConfigProvider,
  NImage,
  NLayout,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath } from "@/utils/utils";

import type { GachaPoolClientData as GachaClientPool } from "./gamedata-types";
import type { GachaPoolClientData as GachaServerPool } from "./types";
import { GachaExecutor } from "./utils";

const { locale, dateLocale } = getNaiveUILocale();
const { theme } = useTheme();

export default defineComponent({
  components: {
    NConfigProvider,
    NImage,
    NButton,
    NCollapseItem,
    NCollapse,
    NLayout,
  },
  props: {
    gachaPoolId: {
      type: String,
      required: true,
    },
    gachaBannerFile: {
      type: String,
      required: true,
    },
    gachaClientPool: {
      type: Object as PropType<GachaClientPool>,
      required: true,
    },
    gachaServerPool: {
      type: Object as PropType<GachaServerPool>,
      required: true,
    },
  },
  setup(props) {
    const bannerImageURL = getImagePath(props.gachaBannerFile);
    const { availCharInfo, upCharInfo } =
      props.gachaServerPool.gachaPoolDetail.detailInfo;
    let gachaExecutor = new GachaExecutor(availCharInfo, upCharInfo);

    const displayStars = [5, 4, 3, 2];
    const counter = ref(0);
    const results: Ref<{ charId: string; img: URL; rarity: number }[]> = ref(
      [],
    );
    const expandedNames = computed(() => [
      ...new Set(results.value.map((result) => result.rarity)),
    ]);

    const doGachaOnce = () => {
      const { charId, rarity } = gachaExecutor.doGachaOnce();
      counter.value = gachaExecutor.counter;

      if (charId && rarity)
        results.value.push({
          charId,
          img: new URL(`/assets/char_avatar/${charId}.png`, TORAPPU_ENDPOINT),
          rarity,
        });
    };

    const doGachaTenth = () => {
      for (let i = 0; i < 10; i++) {
        doGachaOnce();
      }
    };

    const clearResults = () => {
      results.value = [];
      counter.value = 0;
      gachaExecutor = new GachaExecutor(availCharInfo, upCharInfo);
    };

    return {
      theme,
      locale,
      dateLocale,
      bannerImageURL,
      results,
      counter,
      expandedNames,
      doGachaOnce,
      doGachaTenth,
      clearResults,
      displayStars,
    };
  },
});
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="theme"
    :locale="locale"
    :date-locale="dateLocale"
  >
    <NLayout class="antialiased">
      <div class="flex flex-col gap-y-3 mx-2 my-4">
        <NImage width="800" :src="bannerImageURL" />
        <div class="flex gap-x-2">
          <NButton @click="doGachaOnce()">寻访1次</NButton>
          <NButton @click="doGachaTenth()">寻访10次</NButton>
          <NButton type="error" @click="clearResults()">清空结果</NButton>
        </div>
        <div class="flex flex-col gap-y-1">
          <span
            >累计寻访次数:{{ counter }}（使用的合成玉:{{ counter * 600 }} /
            源石:{{ Math.ceil((counter * 600) / 180) }}）</span
          >
          <span>连续未寻访出6★干员次数:0</span>
          <span>10次寻访内必得5★以上干员</span>
        </div>
        <NCollapse :expanded-names="expandedNames">
          <NCollapseItem
            v-for="(star, i) in displayStars"
            :key="i"
            :title="`获得的${star + 1}★干员`"
            :name="star"
          >
            <NImage
              v-for="(result, j) in results.filter(
                (result) => result.rarity === star,
              )"
              :key="j"
              :src="result.img.toString()"
              width="72"
            />
          </NCollapseItem>
        </NCollapse>
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped></style>
