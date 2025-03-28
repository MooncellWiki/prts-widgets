<script setup lang="ts">
import { computed, ref, toRaw } from "vue";

import {
  NButton,
  NCollapse,
  NCollapseItem,
  NConfigProvider,
  NLayout,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getNaiveUILocale } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

import {
  FESCLASSIC_GACHA_PERCENT_DICT,
  SPECIAL_GACHA_PERCENT_DICT,
} from "./consts";
import { GachaExecutor } from "./gacha-utils/base";
import { NewbeeGachaExecutor } from "./gacha-utils/newbee";
import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
  type NewbeeGachaPoolClientData,
} from "./gamedata-types";
import {
  GachaUpChar,
  type GachaPoolClientData as GachaServerPool,
} from "./types";
import { getPortraitURL, rarityStringToNumber } from "./utils";

const { locale, dateLocale } = getNaiveUILocale();
const props = defineProps<{
  gachaPoolId: string;
  gachaBannerFile: string;
  gachaClientPool?: GachaClientPool;
  gachaServerPool: GachaServerPool;
  newbeeClientPool?: NewbeeGachaPoolClientData;
}>();

const showOperatorSelector = ref(false);

const rarityPickCharDict = props.gachaClientPool?.dynMeta?.rarityPickCharDict;

const gachaExecutor: GachaExecutor | NewbeeGachaExecutor =
  props.newbeeClientPool
    ? new NewbeeGachaExecutor(props.gachaServerPool, props.newbeeClientPool)
    : new GachaExecutor(props.gachaServerPool, props.gachaClientPool);

const hasRarityPickCharDict = Object.keys(rarityPickCharDict || {}).length > 0;
const counter = ref(0);
const non6StarCount = ref(0);
const results = ref<
  Record<
    string,
    { charId: string; avatarURL: string; rarity: number; count: number }
  >
>({});

const defaultExpandedNames = computed(() =>
  Array.from(
    new Set(Object.values(results.value).map((result) => result.rarity)),
  ),
);
const overrideExpandedNames = ref<Record<number, boolean>>({});
const expandedNames = computed(() => {
  const final = Array.from(defaultExpandedNames.value);

  for (const [name, expanded] of Object.entries(overrideExpandedNames.value)) {
    const index = final.indexOf(Number.parseInt(name));
    if (expanded) {
      if (index === -1) final.push(Number.parseInt(name));
    } else if (index > -1) final.splice(index, 1);
  }

  return final;
});

const portraitResult = ref<
  { charId: string; rarity: number; portraitURL: string }[]
>([]);
const showPortaits = computed(() => portraitResult.value.length > 0);
const buttonDisabled = ref(false);
const pricePerTime = props.newbeeClientPool
  ? props.newbeeClientPool.gachaPrice
  : 600;
const guarantee5Avail = ref(gachaExecutor.state.guarantee5Avail);

const doGachaOne = () => {
  const gachaResult = gachaExecutor.doGachaOnce();
  if (gachaResult === null) {
    console.error("[doGachaOne]", "池子剩余抽取次数已耗尽");
    buttonDisabled.value = true;
    return;
  }
  const { charId, rarity } = gachaResult;
  counter.value = gachaExecutor.state.counter;
  non6StarCount.value = gachaExecutor.state.non6StarCount;
  guarantee5Avail.value = gachaExecutor.state.guarantee5Avail;

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
  guarantee5Avail.value = gachaExecutor.state.guarantee5Avail;
  portraitResult.value = [];
  overrideExpandedNames.value = {};
};

const selectedUpInfo = ref<Record<number, string[]>>({});
const getSelectedUpCharInfo = () => {
  const upCharInfo: GachaUpChar = { perCharList: [] };
  for (const [rarity, charIdList] of Object.entries(
    toRaw(selectedUpInfo.value),
  )) {
    if (charIdList.length === 0) continue;

    let percentSum = 0.5;
    const rarityNum = Number.parseInt(rarity);
    if (props.gachaClientPool?.gachaRuleType === GachaRuleType.FESCLASSIC) {
      percentSum = FESCLASSIC_GACHA_PERCENT_DICT[rarityNum];
    } else if (props.gachaClientPool?.gachaRuleType === GachaRuleType.SPECIAL) {
      percentSum = SPECIAL_GACHA_PERCENT_DICT[rarityNum];
    }

    upCharInfo.perCharList.push({
      rarityRank: rarityNum,
      charIdList,
      count: charIdList.length,
      percent: percentSum / charIdList.length,
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
  gachaExecutor.upCharInfo = getSelectedUpCharInfo();
};

const onCollapseItemHeaderClicked = (data: {
  name: number;
  expanded: boolean;
  event: MouseEvent;
}) => {
  overrideExpandedNames.value[data.name] = data.expanded;
};

const isCharIdSelected = (rarity: number, charId: string) => {
  return (
    selectedUpInfo.value[rarity] &&
    selectedUpInfo.value[rarity].includes(charId)
  );
};

const bannerImageURL = getImagePath(props.gachaBannerFile);
const displayStars = [5, 4, 3, 2];
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :locale="locale"
    :date-locale="dateLocale"
  >
    <NLayout class="antialiased">
      <div class="mx-2 my-4 flex flex-col gap-y-3">
        <img class="max-w-[800px]" :src="bannerImageURL" />
        <div
          v-show="showPortaits"
          :class="[
            'grid grid-cols-10 <md:grid-cols-5 <md:grid-rows-2 gap-1',
            'p-1 max-w-[800px] overflow-hidden',
            'justify-center items-center',
            'bg-gray-700 select-none',
          ]"
        >
          <img
            v-for="(char, i) in portraitResult"
            :key="i"
            :class="[
              `rarity-${char.rarity} rarity-${char.rarity}-shadow max-w-full min-h-[75px] max-h-[150px]`,
              portraitResult.length === 1 && 'col-start-5',
            ]"
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
          >
            寻访1次
          </NButton>
          <NButton
            :disabled="buttonDisabled"
            @click="
              () => {
                portraitResult = [];
                doGachaTen();
              }
            "
          >
            寻访10次
          </NButton>
          <NButton type="error" @click="clearResults()">清空结果</NButton>
          <NButton
            v-if="hasRarityPickCharDict"
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
          <span>连续未寻访出 6★ 干员次数:{{ non6StarCount }}</span>
          <span v-if="guarantee5Avail !== 0"
            >前 10 次寻访内必得 5★ 以上干员</span
          >
        </div>
        <NCollapse
          display-directive="show"
          :expanded-names="expandedNames"
          :on-item-header-click="onCollapseItemHeaderClicked"
        >
          <NCollapseItem
            v-for="(star, i) in displayStars"
            :key="i"
            class="select-none"
            :title="`获得的${star + 1}★干员`"
            :name="star"
            :disabled="counter === 0"
          >
            <div class="flex flex-wrap gap-1">
              <div
                v-for="(result, j) in Object.values(results).filter(
                  (result) => result.rarity === star,
                )"
                :key="j"
                class="relative"
              >
                <div>
                  <img
                    :class="`rarity-${result.rarity}`"
                    :src="result.avatarURL"
                    width="75"
                  />
                </div>
                <span
                  v-if="result.count > 1"
                  class="text-shadow-base absolute right-0.5 text-lg color-black font-bold -bottom-1"
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
