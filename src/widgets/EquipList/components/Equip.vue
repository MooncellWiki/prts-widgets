<script setup lang="ts">
import {
  type Ref,
  inject,
  onBeforeMount,
  onBeforeUpdate,
  onMounted,
  ref,
  watch,
} from "vue";

import { NSpin } from "naive-ui";

import { getLanguage } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath, isMobile } from "@/utils/utils";

import { colorMap, statsStyleMap } from "../consts";
import { getEquipData } from "../equipData";
import { customLabel } from "../i18n";
import {
  fixAtkRange,
  processLink,
  processMaterial,
  updateTippy,
} from "../utils";

import ETag from "./ETag.vue";

function getStatColor(type: string, stat: string): string {
  return Number(stat) * (statsStyleMap[type] ?? 1) >= 0 ? "#00B0FF" : "#FF6237";
}
const props = withDefaults(
  defineProps<{
    name: string;
    data?: DOMStringMap[];
    simple?: boolean;
    simplemode?: string;
  }>(),
  {
    data: () => [],
    simple: false,
    simplemode: "stats",
  },
);

const content = ref<DOMStringMap[]>([]);
const loading = ref(false);
const loadingCount = inject("loadingCount") as Ref<number>;
const { isDark } = useTheme();
const handleDark = () => {
  const seps = document.querySelectorAll(
    ".majorsep,.minorsep,.term,.iconfilter",
  );
  for (const ele of Array.from(seps)) {
    if (isDark.value) {
      ele.classList.add("dark");
    } else {
      ele.classList.remove("dark");
    }
  }
};
watch(isDark, () => {
  handleDark();
});
onBeforeMount(async () => {
  loading.value = true;
  loadingCount.value += 1;
  if (props.data.length > 0) {
    content.value = props.data;
  } else {
    const rawdata = await getEquipData(props.name ?? "");
    content.value = rawdata ?? [];
  }
  for (const e of content.value) {
    for (const v in e) {
      e[v] = e[v]
        ?.replaceAll(/....UNIQ.*?QINU..../g, "")
        .replaceAll("[[分类:对原文有修正的页面]]", "");
      if (!v.match("mat")) {
        e[v] = processLink(e[v] ?? "");
      }
    }
    if (e.trait?.match(/.START_WIDGET.*?END_WIDGET/g))
      e.trait = await fixAtkRange(e.trait ?? "", props.name, e.name ?? "");
  }
  const seps = document.querySelectorAll(
    ".majorsep,.minorsep,.term,.iconfilter",
  );
  for (const ele of Array.from(seps)) {
    if (isDark.value) {
      ele.classList.add("dark");
    } else {
      ele.classList.remove("dark");
    }
  }
  loading.value = false;
  loadingCount.value -= 1;
});
onMounted(() => {
  updateTippy();
  handleDark();
});
onBeforeUpdate(() => {
  updateTippy();
  handleDark();
});
const locale = getLanguage();
const isLatest = (e: string | undefined) => e && e === "yes";
const modeStats = () => props.simplemode === "stats";
const modeMission = () => props.simplemode === "mission";
</script>

<template>
  <NSpin :show="loading">
    <div
      v-for="e in content"
      :key="e.name"
      class="modbody"
      :class="{ simple, mobile: isMobile() }"
    >
      <div
        class="linebox bg-orange text-center m-0!"
        :class="{ nosimple: !simple || !isLatest(e.latest) }"
      >
        <span class="w-full color-white font-bold">
          {{ customLabel[locale].equipString.latest }}
        </span>
      </div>
      <div class="basicbox" :class="{ nosimple: simple }">
        <div
          class="modtype"
          :style="{
            background: colorMap[e.color as string] ?? colorMap.grey,
          }"
        >
          <div class="flex-none">
            <img
              :src="getImagePath(`模组类型_${e.type}.png`)"
              height="30"
              class="typepic"
            />
          </div>
          <div class="flex-none color-white font-bold">
            {{ e.type }}
          </div>
        </div>
        <div class="modname">
          <a :href="`/w/${name}#${e.name}`" class="font-bold">{{ e.name }}</a>
        </div>
      </div>
      <div class="majorsep" :class="{ nosimple: simple }"></div>
      <div class="rankbox">
        <div class="singlerank" :class="{ nosimple: simple && !modeStats() }">
          <div class="rankicon iconfilter" :class="{ nosimple: simple }">
            <img
              :src="getImagePath(`模组等级_1.png`)"
              height="40"
              class="rankpic"
            />
          </div>
          <div class="rankinfo">
            <div class="ranktext">
              <span
                v-for="stats in customLabel[locale].statsMap"
                :key="stats[0]"
              >
                <span
                  v-if="e[stats[0]] !== '0'"
                  class="mx-[0.5em] whitespace-nowrap"
                >
                  {{ stats[1] }}&nbsp;
                  <span
                    :style="{
                      color: getStatColor(stats[0], e[stats[0]] ?? '0'),
                    }"
                  >
                    {{ (Number(e[stats[0]]) >= 0 ? "+" : "") + e[stats[0]] }}
                  </span>
                </span>
                <span v-if="e['其他']" v-html="e['其他']"></span>
              </span>
            </div>
            <div class="talent">
              <span v-if="e.add">
                <span>
                  <span class="mdi mdi-plus-circle"></span>
                  <span class="font-bold">&nbsp;特性追加：</span>
                  <span v-html="e.trait"></span>
                </span>
              </span>
              <span v-else>
                <span>
                  <span class="mdi mdi-arrow-up-drop-circle"></span>
                  <span class="font-bold">&nbsp;特性更新：</span>
                  <span v-html="e.trait"></span>
                </span>
              </span>
            </div>
          </div>
        </div>
        <div
          class="minorsep"
          :class="{ simple, nosimple: simple && !modeStats() }"
        ></div>
        <div class="singlerank" :class="{ nosimple: simple && !modeStats() }">
          <div class="rankicon iconfilter" :class="{ nosimple: simple }">
            <img
              :src="getImagePath(`模组等级_2.png`)"
              height="40"
              class="rankpic"
            />
          </div>
          <div class="rankinfo">
            <div class="ranktext">
              <span
                v-for="stats in customLabel[locale].statsMap"
                :key="stats[0]"
              >
                <span
                  v-if="e[`${stats[0]}2`] !== '0'"
                  class="mx-[0.5em] whitespace-nowrap"
                >
                  {{ stats[1] }}&nbsp;
                  <span
                    :style="{
                      color: getStatColor(stats[0], e[`${stats[0]}2`] ?? '0'),
                    }"
                  >
                    {{
                      (Number(e[stats[0]]) >= 0 ? "+" : "") + e[`${stats[0]}2`]
                    }}
                  </span>
                </span>
                <span v-if="e['其他2']" v-html="e['其他2']"></span>
              </span>
            </div>
            <div class="talent">
              <span>
                <span class="mdi mdi-asterisk"></span>&nbsp;
                <span v-html="e.talent2"></span>
              </span>
            </div>
          </div>
        </div>
        <div
          class="minorsep"
          :class="{ simple, nosimple: simple && !modeStats() }"
        ></div>
        <div class="singlerank" :class="{ nosimple: simple && !modeStats() }">
          <div class="rankicon iconfilter" :class="{ nosimple: simple }">
            <img
              :src="getImagePath(`模组等级_3.png`)"
              height="40"
              class="rankpic"
            />
          </div>
          <div class="rankinfo">
            <div class="ranktext">
              <span
                v-for="stats in customLabel[locale].statsMap"
                :key="stats[0]"
              >
                <span
                  v-if="e[`${stats[0]}3`] !== '0'"
                  class="mx-[0.5em] whitespace-nowrap"
                >
                  {{ stats[1] }}&nbsp;
                  <span
                    :style="{
                      color: getStatColor(stats[0], e[`${stats[0]}3`] ?? '0'),
                    }"
                  >
                    {{
                      (Number(e[stats[0]]) >= 0 ? "+" : "") + e[stats[0] + 3]
                    }}
                  </span>
                </span>
                <span v-if="e['其他3']" v-html="e['其他3']"></span>
              </span>
            </div>
            <div class="talent">
              <span>
                <span class="mdi mdi-asterisk"></span>&nbsp;
                <span v-html="e.talent3"></span>
              </span>
            </div>
          </div>
        </div>
        <div class="majorsep" :class="{ nosimple: simple }"></div>
        <div class="linebox" :class="{ nosimple: simple && !modeMission() }">
          <div class="descr font-bold" :class="{ nosimple: simple }">
            {{ customLabel[locale].equipString.mission }}
          </div>
          <div class="lineparta flex-col">
            <span v-if="!!e.mission1">
              <span class="mdi mdi-chevron-right"></span>
              &nbsp;
              <span v-html="e.mission1"></span>
            </span>
            <span v-if="!!e.mission2">
              <span class="mdi mdi-chevron-right"></span>
              &nbsp;
              <span v-html="e.mission2"></span>
            </span>
            <span v-if="!e.mission1 && !e.mission2">
              <span class="mdi mdi-clipboard-off-outline"></span>
              {{ customLabel[locale].equipString.nomission }}
            </span>
          </div>
        </div>
        <div class="majorsep" :class="{ nosimple: simple }"></div>
        <div class="linebox" :class="{ nosimple: simple }">
          <div class="descr font-bold" :class="{ nosimple: simple }">
            {{ customLabel[locale].equipString.condition }}
          </div>
          <div class="lineparta flex-wrap">
            <div class="linebox flex-col">
              <div class="consume">
                <span class="flex flex-nowrap items-center">
                  <div
                    class="iconfilter rankicon inline-block"
                    :class="{ nosimple: simple }"
                  >
                    <img
                      :src="getImagePath('模组等级_1.png')"
                      height="30"
                      class="rankpic m-1"
                    />
                  </div>
                  <span v-if="!e.cond">
                    <ETag type="favor" value="0"></ETag>
                    <ETag type="lv" :value="e.lv ?? '???'"></ETag>
                    <ETag
                      v-if="!!e.mission1 && !!e.mission2"
                      type="mission"
                      value=""
                    ></ETag>
                    <span v-html="processMaterial(e.mat ?? '')"></span>
                  </span>
                  <span v-else v-html="e.cond"></span>
                </span>
              </div>
              <div class="minorsep" :class="{ simple }"></div>
              <div class="consume">
                <span class="flex flex-nowrap items-center">
                  <div
                    class="iconfilter rankicon inline-block"
                    :class="{ nosimple: simple }"
                  >
                    <img
                      :src="getImagePath('模组等级_2.png')"
                      height="30"
                      class="rankpic m-1"
                    />
                  </div>
                  <span v-if="!e.cond2">
                    <span>
                      <ETag type="favor" value="50" />
                    </span>
                    <span v-html="processMaterial(e.mat2 ?? '')"></span>
                  </span>
                  <span v-else v-html="e.cond2"></span>
                </span>
              </div>
              <div class="minorsep" :class="{ simple }"></div>
              <div class="consume">
                <span class="flex items-center">
                  <div
                    class="iconfilter rankicon inline-block"
                    :class="{ nosimple: simple }"
                  >
                    <img
                      :src="getImagePath('模组等级_3.png')"
                      height="30"
                      class="rankpic m-1"
                    />
                  </div>
                  <span v-if="!e.cond3">
                    <span>
                      <ETag type="favor" value="100" />
                    </span>
                    <span v-html="processMaterial(e.mat3 ?? '')"></span>
                  </span>
                  <span v-else v-html="e.cond3"></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <template #description> {{ customLabel[locale].loading }} </template>
  </NSpin>
</template>

<style scoped>
:deep(.modbody) {
  display: flex;
  width: 100%;
  max-width: 800px;
  margin: 5px 0;
  padding: 5px;
  box-shadow: 2px 2px 3px #888;
  box-sizing: border-box;
  flex-flow: column;
}
:deep(.modbody.mobile) {
  font-size: 95%;
}
:deep(.modbody.simple) {
  display: flex;
  width: 100%;
  max-width: 100%;
  margin: 2px 0;
  padding: 2px;
  box-shadow: none;
  box-sizing: border-box;
  flex-flow: column;
}
:deep(.modtype) {
  display: flex;
  flex-flow: column;
  flex: 25 25 25%;
  min-width: 60px;
  justify-content: center;
  align-items: center;
  height: 60px;
}
:deep(.modname) {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 75 75 75%;
  height: 60px;
}
:deep(.rankicon) {
  flex: 10 10 10%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 55px;
}
:deep(.rankpic) {
  height: 40px;
}
:deep(.typepic) {
  height: 30px;
}
:deep(.mobile .rankpic) {
  height: 36px;
}
:deep(.mobile .typepic) {
  height: 27px;
}
:deep(.ranktext) {
  flex: 16.5 16.5 16.5%;
  display: flex;
  align-items: center;
  min-width: 100px;
  white-space: nowrap;
  flex-wrap: wrap;
  align-content: center;
}
:deep(.linebox) {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  margin: 5px 0;
}
:deep(.lineparta) {
  flex: 75 75 75%;
  display: flex;
}
:deep(.linepartb) {
  flex: 50 50 50%;
  display: flex;
  flex-flow: column;
}
:deep(.descr) {
  flex: 25 25 25%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 140px;
  text-align: center;
}
:deep(.consume) {
  display: flex;
  align-items: center;
  margin: 5px;
}
:deep(.basicbox) {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  margin: 5px 0;
}
:deep(.rankbox) {
  display: flex;
  width: 100%;
  flex-flow: column;
  margin: 5px 0;
}
:deep(.singlerank) {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  margin: 5px 0;
}
:deep(.rankinfo) {
  flex: 90 90 90%;
  display: flex;
  flex-wrap: wrap;
}
:deep(.talent) {
  flex: 83.5 83.5 83.5%;
  display: flex;
  align-items: center;
}
:deep(.majorsep) {
  height: 1px;
  background-color: black;
}
:deep(.minorsep) {
  height: 1px;
  background-color: rgb(190, 190, 190);
}
:deep(.minorsep.simple) {
  height: 1px;
  background-color: black;
}
:deep(.dark.majorsep) {
  background-color: whitesmoke;
}
:deep(.dark.minorsep) {
  background-color: rgb(85, 85, 85);
}
:deep(.dark.minorsep.simple) {
  height: 1px;
  background-color: whitesmoke;
}
:deep(.dark.term) {
  text-decoration: underline whitesmoke !important;
  color: whitesmoke !important;
}
:deep(.dark.iconfilter) {
  filter: invert(100%);
}
:deep(.nosimple) {
  display: none;
}
</style>
