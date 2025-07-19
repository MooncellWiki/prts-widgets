<script setup lang="ts">
import { computed, h, onMounted, ref } from "vue";

import {
  darkTheme,
  NAvatar,
  NButton,
  NCard,
  NConfigProvider,
  NDataTable,
  NFlex,
  NInputNumber,
  NModal,
  NNumberAnimation,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NTooltip,
  type DataTableColumns,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { getImagePath } from "@/utils/utils";

const i18nConfig = getNaiveUILocale();

const props = defineProps<{
  expMap: number[][];
}>();

onMounted(() => {
  eliteChange();
});

const eliteStr: Record<number, string[]> = {
  0: ["精英_0_大图.png", "精英0"],
  1: ["精英_1_大图.png", "精英1"],
  2: ["精英_2_大图.png", "精英2"],
};
const showSOECModal = ref(false);
const selectedElite = ref(0);
const selectLevel = ref({
  maxLevel: 1,
  start: {
    level: 1,
    exp: 50,
  },
  target: {
    level: 1,
    exp: 0,
  },
});
const calcExp = computed(() => {
  const start = selectLevel.value.start;
  const target = selectLevel.value.target;
  if (start.level > target.level) {
    return -1;
  }
  if (start.level === target.level) {
    return target.exp - start.exp;
  }
  let totalExp = props.expMap[selectedElite.value][start.level - 1] - start.exp;
  for (let i = start.level + 1; i < target.level; i++) {
    totalExp += props.expMap[selectedElite.value][i - 1];
  }
  return totalExp + target.exp;
});
const isInvalid = computed(() => {
  return (
    Number.isNaN(calcExp.value) ||
    selectLevel.value.start.level == null ||
    selectLevel.value.target.level == null ||
    selectLevel.value.start.exp == null ||
    selectLevel.value.target.exp == null
  );
});
//---
const showSOETModal = ref(false);
const SOETColumns: DataTableColumns<{
  level: number;
  exp: string;
  totalexp: number;
}> = [
  {
    key: "level",
    align: "center",
    sorter: "default",
    title() {
      return h("b", "Lv.");
    },
  },
  {
    key: "exp",
    align: "center",
    render(row: { exp: string; totalexp: number }) {
      return row.exp === "-1" ? "——" : `${row.exp}`;
    },
    title() {
      return h("b", "升级所需经验");
    },
  },
  {
    key: "totalexp",
    align: "center",
    title() {
      return h("b", "累计经验");
    },
  },
];
//--
const screenWidth = ref(document.body.clientWidth);
window.addEventListener("resize", () => {
  screenWidth.value = document.body.clientWidth;
});
const isMobile = computed(() => {
  return screenWidth.value < 500;
});
const getRandomTime = () => {
  return Math.random() * 0.5 + 0.8;
};

const eliteChange = () => {
  selectLevel.value.maxLevel = getMaxLevel();
  selectLevel.value.start.level = 1;
  selectLevel.value.target.level = selectLevel.value.maxLevel;
  levelChange("start");
  levelChange("target");
};

const getMaxLevel = () => {
  return props.expMap[selectedElite.value].indexOf(-1) + 1;
};

const getLevelMaxExp = (level: number) => {
  return props.expMap[selectedElite.value][level - 1] || 0;
};

const levelChange = (role: "start" | "target") => {
  selectLevel.value[role].exp = 0;
};

const expInputChange = (role: "start" | "target") => {
  //uplvl
  if (
    selectLevel.value[role].exp >= getLevelMaxExp(selectLevel.value[role].level)
  ) {
    selectLevel.value[role].level = Math.min(
      selectLevel.value[role].level + 1,
      selectLevel.value.maxLevel,
    );
    selectLevel.value[role].exp = 0;
    levelChange(role);
  }
};

const tableData = computed(() =>
  props.expMap[selectedElite.value]
    .map((exp, index) => ({
      level: index + 1,
      exp: String(exp),
      totalexp: props.expMap[selectedElite.value]
        .slice(0, index)
        .reduce((a, b) => a + b, 0),
    }))
    .filter(
      (item) =>
        item.exp !== "-1" ||
        props.expMap[selectedElite.value].indexOf(-1) === item.level - 1,
    ),
);
</script>

<template>
  <NConfigProvider
    preflight-style-disabled
    :theme="darkTheme"
    :locale="i18nConfig.locale"
    :date-locale="i18nConfig.dateLocale"
    :theme-overrides="{
      common: {
        borderRadius: '0',
        primaryColor: '#f5d003',
        primaryColorHover: '#c4a917',
        primaryColorPressed: '#817015',
        primaryColorSuppl: '#c4a917',
      },
      Card: {
        paddingMedium: '0',
      },
      Input: {
        paddingLarge: '0.1em',
        fontSizeLarge: '2em',
      },
      DataTable: {
        lineHeight: '0.5em',
        thColorModal: '#2A2711',
        thColorHoverModal: '#827622',
      },
    }"
  >
    <div class="soec-button" @click="showSOECModal = true">
      <i class="mdi mdi-rhombus-outline"></i>
      特勤经验计算
    </div>
    <NModal
      v-model:show="showSOECModal"
      class="h-full max-w-[800px] w-full bg-black"
      preset="card"
      size="small"
      :bordered="false"
      :block-scroll="false"
    >
      <template #header>
        <i class="mdi mdi-rhombus-outline"></i>
        特勤经验计算
      </template>
      <template #header-extra>
        <NTooltip placement="left" trigger="hover">
          <template #trigger>
            <NButton size="tiny" color="#f5d003" @click="showSOETModal = true">
              <i class="mdi mdi-stairs-box"></i>&nbsp;查看完整升级表
            </NButton>
          </template>
          <i class="mdi mdi-alert"></i
          >&nbsp;<b>注意：</b>特勤干员经验阶梯与普通干员不同。<br />请勿将特勤干员的经验阶梯与普通干员的经验阶梯混淆。
        </NTooltip>
      </template>
      <NFlex vertical align="center">
        <span class="font-size-lg font-bold">选择精英化等级</span>
        <NRadioGroup
          v-model:value="selectedElite"
          name="elite"
          :default-value="0"
          type="warning"
          @update:value="eliteChange"
        >
          <NRadioButton
            v-for="(str, key, index) in eliteStr"
            :key="index"
            :value="index"
            :default-checked="key === 0"
          >
            <NFlex :size="6">
              <NAvatar
                color="#0000"
                object-fit="scale-down"
                :size="35"
                :src="getImagePath(str[0])"
                :class="selectedElite === index ? 'filter-invert' : ''"
              />
              {{ str[1] }}
            </NFlex>
          </NRadioButton>
        </NRadioGroup>
        <br />
        <span class="font-size-lg font-bold">设置起始及目标等级·经验</span>
        <NFlex align="center" :wrap="false" :size="isMobile ? 0 : 'medium'">
          <!--START-->
          <NFlex vertical align="center" :size="0">
            <div>
              <NProgress
                type="circle"
                status="warning"
                :percentage="
                  (selectLevel.start.exp /
                    getLevelMaxExp(selectLevel.start.level)) *
                  100
                "
                :offset-degree="180"
                :border-radius="0"
                :fill-border-radius="0"
                class="mb-3"
              >
                <NFlex vertical align="center" :size="0">
                  <NFlex justify="space-between">
                    <span>LV</span>
                    <span class="font-bold">/ {{ selectLevel.maxLevel }}</span>
                  </NFlex>
                  <NInputNumber
                    v-model:value="selectLevel.start.level"
                    :min="1"
                    :max="selectLevel.maxLevel"
                    :show-button="false"
                    :keyboard="{ ArrowUp: true, ArrowDown: true }"
                    class="pa-0 text-center"
                    size="large"
                    placeholder="1"
                    @update:value="levelChange('start')"
                  />
                </NFlex>
              </NProgress>
            </div>
            <div
              v-if="selectLevel.start.level !== selectLevel.maxLevel"
              class="text-center"
            >
              <NInputNumber
                v-model:value="selectLevel.start.exp"
                :min="0"
                :max="getLevelMaxExp(selectLevel.start.level)"
                class="w-12em text-center"
                :keyboard="{ ArrowUp: true, ArrowDown: true }"
                placeholder="1"
                button-placement="both"
                :disabled="selectLevel.start.level === selectLevel.maxLevel"
                @update:value="expInputChange('start')"
              >
                <template #suffix>
                  / {{ getLevelMaxExp(selectLevel.start.level) }}
                </template>
              </NInputNumber>
              [
              {{
                (
                  (selectLevel.start.exp /
                    getLevelMaxExp(selectLevel.start.level)) *
                  100
                ).toFixed(2)
              }}% ]
            </div>
            <div v-else class="text-center">
              <NInputNumber
                placeholder="MAX"
                button-placement="both"
                :disabled="true"
                class="w-12em text-center"
              />
              <NButton
                v-if="selectedElite !== 2"
                size="tiny"
                strong
                secondary
                type="primary"
                class="w-14em"
                @click="
                  () => {
                    selectedElite++;
                    eliteChange();
                  }
                "
              >
                <i class="mdi mdi-chevron-up-box"></i>&nbsp;晋升
              </NButton>
              <span v-else> [ ---% ]</span>
            </div>
          </NFlex>
          <!--DECO-->
          <i class="mdi mdi-arrow-right mb-18 font-size-2.5em"></i>
          <!--TARGET-->
          <NFlex vertical align="center" :size="0">
            <div>
              <NProgress
                type="circle"
                status="warning"
                :percentage="
                  (selectLevel.target.exp /
                    getLevelMaxExp(selectLevel.target.level)) *
                  100
                "
                :offset-degree="180"
                :border-radius="0"
                :fill-border-radius="0"
                class="mb-3"
              >
                <NFlex vertical align="center" :size="0">
                  <NFlex justify="space-between">
                    <span>LV</span>
                    <span class="font-bold">/ {{ selectLevel.maxLevel }}</span>
                  </NFlex>
                  <NInputNumber
                    v-model:value="selectLevel.target.level"
                    :min="1"
                    :max="selectLevel.maxLevel"
                    :show-button="false"
                    :keyboard="{ ArrowUp: true, ArrowDown: true }"
                    class="pa-0 text-center"
                    size="large"
                    placeholder="1"
                    @update:value="levelChange('target')"
                  />
                </NFlex>
              </NProgress>
            </div>
            <div
              v-if="selectLevel.target.level !== selectLevel.maxLevel"
              class="text-center"
            >
              <NInputNumber
                v-model:value="selectLevel.target.exp"
                :min="0"
                :max="getLevelMaxExp(selectLevel.target.level)"
                class="w-12em text-center"
                :keyboard="{ ArrowUp: true, ArrowDown: true }"
                placeholder="1"
                button-placement="both"
                :disabled="selectLevel.target.level === selectLevel.maxLevel"
                @update:value="expInputChange('target')"
              >
                <template #suffix>
                  / {{ getLevelMaxExp(selectLevel.target.level) }}
                </template>
              </NInputNumber>
              [
              {{
                (
                  (selectLevel.target.exp /
                    getLevelMaxExp(selectLevel.target.level)) *
                  100
                ).toFixed(2)
              }}% ]
            </div>
            <div v-else class="text-center">
              <NInputNumber
                placeholder="MAX"
                button-placement="both"
                :disabled="true"
                class="w-12em text-center"
              />
              [ ---% ]
            </div>
          </NFlex>
        </NFlex>
        <br />
        ※可以使用键盘的上下键来调整等级和经验值。<br />

        <NCard class="text-center">
          <div
            :class="[
              'from-[#ab983400] to-[#ab983433] bg-gradient-to-b pt-0.5em',
              {
                'from-[#fc646400] to-[#fc646433]':
                  selectedElite !== 2 &&
                  selectLevel.start.level === selectLevel.maxLevel &&
                  !isInvalid,
              },
            ]"
          >
            从 Lv.{{ selectLevel.start.level }} [
            {{
              selectLevel.start.level === selectLevel.maxLevel
                ? "MAX"
                : `${selectLevel.start.exp} / ${getLevelMaxExp(selectLevel.start.level)}`
            }}
            ] 升级到 Lv.{{ selectLevel.target.level }} [
            {{
              selectLevel.target.level === selectLevel.maxLevel
                ? "MAX"
                : `${selectLevel.target.exp} / ${getLevelMaxExp(selectLevel.target.level)}`
            }}
            ]，需要经验值<br />
            <div v-if="isInvalid">
              <div class="font-size-1.5em">
                <i
                  :style="{ '--speed': `${getRandomTime()}s` }"
                  class="mdi mdi-help-circle mdi-spin"
                ></i>
                <i
                  :style="{ '--speed': `${getRandomTime()}s` }"
                  class="mdi mdi-spin mdi-help-circle-outline"
                ></i>
                <i
                  :style="{ '--speed': `${getRandomTime()}s` }"
                  class="mdi mdi-help-circle mdi-spin"
                ></i>
                <i
                  :style="{ '--speed': `${getRandomTime()}s` }"
                  class="mdi mdi-spin mdi-help-circle-outline"
                ></i>
                <i
                  :style="{ '--speed': `${getRandomTime()}s` }"
                  class="mdi mdi-help-circle mdi-spin"
                ></i>
              </div>
            </div>
            <div
              v-else-if="
                calcExp >= 0 && selectLevel.start.level !== selectLevel.maxLevel
              "
            >
              <span class="font-size-2em font-bold">
                <NNumberAnimation
                  :to="calcExp"
                  show-separator
                  :duration="500"
                />
              </span>
              点
            </div>
            <div v-else-if="selectLevel.start.level === selectLevel.maxLevel">
              <span class="font-size-1.5em font-bold"> 等级已满 </span><br />
              <span
                v-if="selectedElite !== 2"
                class="level-max-warn bg-[#ff7070] px-3em color-white font-bold"
              >
                <i class="mdi mdi-alert"></i>
                继续获得的经验将被丢弃！请尽快完成干员晋升。
              </span>
              <span
                v-else
                class="bg-[linear-gradient(to_right,#0000,#f5d003,#0000)] px-5em color-black font-bold"
              >
                LEVEL MAX
              </span>
            </div>
            <div v-else-if="calcExp === -1">
              <span class="font-size-1.5em font-bold"> 已经不用升级了…… </span>
            </div>
          </div>
        </NCard>
      </NFlex>
    </NModal>
    <NModal
      v-model:show="showSOETModal"
      class="h-full max-w-[800px] w-full bg-black"
      preset="card"
      size="small"
      :bordered="false"
      :block-scroll="false"
    >
      <template #header>
        <i class="mdi mdi-stairs-box"></i>
        特勤经验全表
      </template>
      <NFlex vertical align="center">
        <NRadioGroup
          v-model:value="selectedElite"
          name="elite"
          :default-value="0"
          type="warning"
          @update:value="eliteChange"
        >
          <NRadioButton
            v-for="(str, key, index) in eliteStr"
            :key="index"
            :value="index"
            :default-checked="key === 0"
          >
            <NFlex :size="6">
              <NAvatar
                color="#0000"
                object-fit="scale-down"
                :size="35"
                :src="getImagePath(str[0])"
                :class="selectedElite === index ? 'filter-invert' : ''"
              />
              {{ str[1] }}
            </NFlex>
          </NRadioButton>
        </NRadioGroup>
        <NDataTable
          :columns="SOETColumns"
          align="center"
          :single-line="false"
          :striped="true"
          :data="tableData"
          :max-height="500"
        />
      </NFlex>
    </NModal>
  </NConfigProvider>
</template>

<style scoped>
.soec-button {
  background: linear-gradient(180deg, black, #ab9834);
  padding: 0.3em;
  color: #fff;
  box-shadow: 0 3px 4px #0000004d;
  width: calc(100% - 0.6em);
  max-width: calc(800px - 0.6em);
  text-align: center;
  cursor: pointer;
}

.mdi-spin:before {
  animation: mdi-spin var(--speed) infinite linear;
}

@keyframes lv-warn {
  0% {
    background: #ff7070;
  }

  50% {
    background: #e71111;
  }

  100% {
    background: #ff7070;
  }
}

.level-max-warn {
  animation: lv-warn 2s ease-in-out 0s infinite;
}
</style>
