<script lang="ts">
import { PropType, computed, defineComponent, ref, toRaw } from "vue";

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
import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
  type NewbeeGachaPoolClientData,
} from "./gamedata-types";
import {
  GachaUpChar,
  RarityRankString,
  type GachaPoolClientData as GachaServerPool,
} from "./types";
import { getPortraitURL, rarityStringToNumber } from "./utils";

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
      type: null as unknown as PropType<GachaClientPool | null>,
      default: null,
      validator: (v: any) => typeof v === "object" || v === null,
    },
    gachaServerPool: {
      type: Object as PropType<GachaServerPool>,
      required: true,
    },
    newbeeClientPool: {
      type: null as unknown as PropType<NewbeeGachaPoolClientData | null>,
      default: null,
      validator: (v: any) => typeof v === "object" || v === null,
    },
  },
  setup(props) {
    const showOperatorSelector = ref(false);
    let gachaExecutor: GachaExecutor | NewbeeGachaExecutor;

    const rarityPickCharDict: Record<
      keyof typeof RarityRankString,
      string[]
    > | null = props.gachaClientPool?.dynMeta?.rarityPickCharDict || null;

    gachaExecutor = props.newbeeClientPool
      ? new NewbeeGachaExecutor(props.newbeeClientPool, props.gachaServerPool)
      : new GachaExecutor(props.gachaClientPool, props.gachaServerPool);

    const isFesClassic =
      props.gachaClientPool?.gachaRuleType === GachaRuleType.FESCLASSIC;
    const counter = ref(0);
    const non6StarCount = ref(0);
    const results = ref<
      Record<
        string,
        { charId: string; avatarURL: string; rarity: number; count: number }
      >
    >({});
    const expandedNames = computed(() => [
      ...new Set(Object.values(results.value).map((result) => result.rarity)),
    ]);
    const portraitResult = ref<
      { charId: string; rarity: number; portraitURL: string }[]
    >([]);
    const showPortaits = computed(() => portraitResult.value.length > 0);
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
          ).toString(),
          count: 1,
        };

      portraitResult.value.push({
        charId,
        rarity,
        portraitURL: getPortraitURL(charId).toString(),
      });
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
      non6StarCount.value = gachaExecutor.state.non6StarCount;
      portraitResult.value = [];
    };

    const selectedUpInfo = ref<Record<number, string[]>>({});
    const getSelectedUpCharInfo = () => {
      const upCharInfo: GachaUpChar = { perCharList: [] };
      for (const [rarity, charIdList] of Object.entries(
        toRaw(selectedUpInfo.value),
      )) {
        if (charIdList.length === 0) continue;
        upCharInfo.perCharList.push({
          rarityRank: Number.parseInt(rarity),
          charIdList,
          count: charIdList.length,
          percent: 0.5 / charIdList.length,
        });
      }
      return upCharInfo;
    };

    const onImageClicked = (rarity: number, charId: string) => {
      if (!selectedUpInfo.value[rarity]) selectedUpInfo.value[rarity] = [];
      if (selectedUpInfo.value[rarity].includes(charId)) {
        selectedUpInfo.value[rarity] = selectedUpInfo.value[rarity].filter(
          (id) => id !== charId,
        );
      } else {
        selectedUpInfo.value[rarity].push(charId);
      }
      const upCharInfo = getSelectedUpCharInfo();
      console.log(gachaExecutor.upCharInfo);
      gachaExecutor.upCharInfo = upCharInfo;
      console.log(gachaExecutor.upCharInfo);
    };

    const isCharIdSelected = (rarity: number, charId: string) => {
      return (
        selectedUpInfo.value[rarity] &&
        selectedUpInfo.value[rarity].includes(charId)
      );
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
      portraitResult,
      getPortraitURL,
      showPortaits,
      showOperatorSelector,
      rarityPickCharDict,
      rarityStringToNumber,
      onImageClicked,
      selectedUpInfo,
      isCharIdSelected,
      isFesClassic,
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
        <div
          v-show="showPortaits"
          class="flex flex-wrap justify-center items-center bg-gray-700 max-w-fit gap-x-1.5 py-3 px-2"
        >
          <img
            v-for="(char, i) in portraitResult"
            :key="i"
            :class="`rarity-${char.rarity} rarity-${char.rarity}-shadow`"
            width="75"
            :src="char.portraitURL"
          />
        </div>
        <div class="flex gap-x-2">
          <NButton
            :disabled="buttonDisabled"
            @click="
              () => {
                portraitResult = [];
                doGachaOne();
              }
            "
            >寻访1次</NButton
          >
          <NButton
            :disabled="buttonDisabled"
            @click="
              () => {
                portraitResult = [];
                doGachaTen();
              }
            "
            >寻访10次</NButton
          >
          <NButton type="error" @click="clearResults()">清空结果</NButton>
          <NButton
            v-if="isFesClassic"
            type="info"
            @click="showOperatorSelector = !showOperatorSelector"
          >
            {{ showOperatorSelector ? "关闭干员 UP 选择" : "展开干员 UP 选择" }}
          </NButton>
        </div>
        <div v-show="showOperatorSelector">
          <div v-for="(charIds, rarity) in rarityPickCharDict" :key="rarity">
            <h2>{{ rarityStringToNumber(rarity) + 1 }}星角色 UP 选择</h2>
            <div class="flex flex-wrap gap-2">
              <img
                v-for="(charId, i) in charIds"
                :key="i"
                :class="
                  isCharIdSelected(rarityStringToNumber(rarity), charId) &&
                  'outline-2 outline-cyan-500 outline-solid'
                "
                width="75"
                :src="getPortraitURL(charId).toString()"
                @click="
                  () => onImageClicked(rarityStringToNumber(rarity), charId)
                "
              />
            </div>
          </div>
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
                  <img
                    :class="`rarity-${result.rarity} outline-2 outline-gray-600 outline-solid`"
                    :src="result.avatarURL"
                    width="75"
                  />
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

/*6星干员背景样式*/
.rarity-5 {
  background-image: linear-gradient(32deg, #eee2b8 22%, #ffa573 100%);
}

.rarity-5-shadow {
  box-shadow: 0 0 20px orange;
}

/*5星干员背景样式*/
.rarity-4 {
  background-image: linear-gradient(180deg, #f1e3ad 0%, #e6e5e2 100%);
}

.rarity-4-shadow {
  box-shadow: 0 0 20px gold;
}

/*4星干员背景样式*/
.rarity-3 {
  background-image: linear-gradient(180deg, #a99db4 0%, #d3d3d3 58%);
}

.rarity-3-shadow {
  box-shadow: 0 0 20px #c6b3d1;
}

/*3星干员背景样式*/
.rarity-2 {
  background-color: grey;
}
</style>
