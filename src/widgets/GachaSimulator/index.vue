<script lang="ts">
import { PropType, computed, defineComponent, ref, type Ref } from "vue";

import {
  NButton,
  NCollapse,
  NCollapseItem,
  NConfigProvider,
  NLayout,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath } from "@/utils/utils";

import { GachaExecutor } from "./gacha-utils/base";
import { NewbeeGachaExecutor } from "./gacha-utils/newbee";
import type {
  GachaPoolClientData as GachaClientPool,
  NewbeeGachaPoolClientData,
} from "./gamedata-types";
import type { GachaPoolClientData as GachaServerPool } from "./types";

const { locale, dateLocale } = getNaiveUILocale();
const { theme } = useTheme();

export default defineComponent({
  components: {
    NConfigProvider,
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
      type: Object as PropType<GachaClientPool | null>,
      required: true,
    },
    gachaServerPool: {
      type: Object as PropType<GachaServerPool>,
      required: true,
    },
    newbeeClientPool: {
      type: Object as PropType<
        NewbeeGachaPoolClientData | Record<string, never>
      >,
      required: true,
    },
  },
  setup(props) {
    let gachaExecutor = props.newbeeClientPool
      ? new NewbeeGachaExecutor(props.newbeeClientPool, props.gachaServerPool)
      : new GachaExecutor(props.gachaClientPool, props.gachaServerPool);
    const counter = ref(0);
    const non6StarCount = ref(0);
    const results: Ref<
      Record<
        string,
        { charId: string; avatarURL: URL; rarity: number; count: number }
      >
    > = ref({});
    const expandedNames = computed(() => [
      ...new Set(Object.values(results.value).map((result) => result.rarity)),
    ]);
    const buttonDisabled = ref(false);
    const pricePerTime = props.newbeeClientPool
      ? props.newbeeClientPool.gachaPrice
      : 600;

    const doGachaOne = () => {
      const gachaResult = gachaExecutor.doGachaOnce();
      if (gachaResult === null) {
        console.error("池子剩余抽取次数已耗尽");
        buttonDisabled.value = true;
        return;
      }
      const { charId, rarity } = gachaResult;
      counter.value = gachaExecutor.state.counter;
      non6StarCount.value = gachaExecutor.state.non6StarCount;

      if (!charId) throw new Error("charId is null");

      if (results.value[charId]) results.value[charId].count++;
      else
        results.value[charId] = {
          charId,
          rarity,
          avatarURL: new URL(
            `/assets/char_avatar/${charId}.png`,
            TORAPPU_ENDPOINT,
          ),
          count: 1,
        };
    };

    const doGachaTen = () => {
      for (let i = 0; i < 10; i++) {
        doGachaOne();
      }
    };

    const clearResults = () => {
      results.value = {};
      counter.value = 0;
      buttonDisabled.value = false;
      gachaExecutor.resetState();
    };

    return {
      theme,
      locale,
      dateLocale,
      bannerImageURL: getImagePath(props.gachaBannerFile),
      results,
      counter,
      expandedNames,
      doGachaOne,
      doGachaTen,
      clearResults,
      displayStars: [5, 4, 3, 2],
      non6StarCount,
      buttonDisabled,
      pricePerTime,
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
        <img width="800" :src="bannerImageURL" />
        <div class="flex gap-x-2">
          <NButton :disabled="buttonDisabled" @click="doGachaOne()"
            >寻访1次</NButton
          >
          <NButton :disabled="buttonDisabled" @click="doGachaTen()"
            >寻访10次</NButton
          >
          <NButton type="error" @click="clearResults()">清空结果</NButton>
        </div>
        <div class="flex flex-col gap-y-1">
          <span>
            累计寻访次数：{{ counter }}（使用的合成玉：{{
              counter * pricePerTime
            }}
            / 源石：{{ Math.ceil((counter * pricePerTime) / 180) }}）
          </span>
          <span>连续未寻访出6★干员次数:{{ non6StarCount }}</span>
          <span>前 10 次寻访内必得5★以上干员</span>
        </div>
        <NCollapse :expanded-names="expandedNames">
          <NCollapseItem
            v-for="(star, i) in displayStars"
            :key="i"
            :title="`获得的${star + 1}★干员`"
            :name="star"
          >
            <div class="flex flex-wrap">
              <div
                v-for="(result, j) in Object.values(results).filter(
                  (result) => result.rarity === star,
                )"
                :key="j"
                class="relative"
              >
                <div>
                  <img :src="result.avatarURL.toString()" width="75" />
                </div>
                <span
                  v-if="result.count > 1"
                  class="absolute right-1 -bottom-1 text-shadow-base font-bold text-lg"
                >
                  {{ result.count }}
                </span>
              </div>
            </div>
          </NCollapseItem>
        </NCollapse>
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped>
.text-shadow-base {
  text-shadow:
    -1px -1px 0 #ffffff,
    1px -1px 0 #ffffff,
    -1px 1px 0 #ffffff,
    1px 1px 0 #ffffff,
    -1px -1px 0 #ffffff,
    1px -1px 0 #ffffff,
    -1px 1px 0 #ffffff,
    1px 1px 0 #ffffff,
    -1px -1px 0 #ffffff,
    1px -1px 0 #ffffff,
    -1px 1px 0 #ffffff,
    1px 1px 0 #ffffff,
    -1px -1px 0 #ffffff,
    1px -1px 0 #ffffff,
    -1px 1px 0 #ffffff,
    1px 1px 0 #ffffff,
    -1px -1px 0 #ffffff,
    1px -1px 0 #ffffff,
    -1px 1px 0 #ffffff,
    1px 1px 0 #ffffff,
    -2px -2px 4px #ffffff,
    2px -2px 4px #ffffff,
    -2px 2px 4px #ffffff,
    2px 2px 4px #ffffff;
}
</style>
