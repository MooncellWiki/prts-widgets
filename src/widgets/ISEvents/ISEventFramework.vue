<script setup lang="ts">
import { computed, ref } from "vue";

import { HomeSharp } from "@vicons/material";
import {
  NBreadcrumb,
  NBreadcrumbItem,
  NCard,
  NConfigProvider,
  NDropdown,
  NIcon,
  NLayout,
  NLayoutContent,
  NSpace,
  type DropdownOption,
} from "naive-ui";

import { getImagePath } from "@/utils/utils";

import ISEventOption from "./ISEventOption.vue";

interface Option {
  title: string;
  type: string;
  icon: string;
  iconId?: string;
  desc1: string;
  desc2: string;
  dest: number;
  index: number;
  customBadgeText?: string;
  subChoose?: string;
}

const props = withDefaults(
  defineProps<{
    sceneData?: {
      etype?: string;
      edesc?: string;
      name?: string;
      ename?: string;
      nav?: string;
      index?: number;
      image?: string;
      text?: string;
      options: Array<Option>;
      prtsinfo?: string;
    }[];
    isTheme: string;
  }>(),
  {
    sceneData: () => [],
  },
);

const sceneNav = ref<Array<number>>([0]);
const currentSceneId = ref(0);
const firstScene = computed(() => props.sceneData[0]);
const currentScene = computed(() => props.sceneData[currentSceneId.value]);
function getScene(sceneId: number) {
  return props.sceneData[sceneId];
}
function isPrtsInfo(sceneId: number) {
  const scene = props.sceneData[sceneId];
  return scene?.prtsinfo !== "";
}
const isCurScenePrtsInfo = computed(() => {
  return isPrtsInfo(currentSceneId.value);
});
function jump(id: number) {
  if (id) {
    const index = sceneNav.value.indexOf(id);
    if (index === -1) sceneNav.value.push(id);
    else if (index + 1 < sceneNav.value.length)
      sceneNav.value.splice(index + 1);

    currentSceneId.value = id;

    const first = firstScene.value;
    if (first) {
      const name = first.ename || first.name || "";
      const element = document.querySelector(`#${name}`);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    }
  }
}
function navJump(index: number) {
  if (index === sceneNav.value.length - 1) return;

  const sceneId = sceneNav.value[index];
  if (sceneId !== undefined) {
    currentSceneId.value = sceneId;
  }
  sceneNav.value.splice(index + 1);
}
function optionsToNavDrop(options: Array<Option>) {
  const navDrop: SceneNavDropdownOption[] = [];
  for (const o of options.filter((option) => option.type !== "desc")) {
    const scd = getSubChooseData(o.subChoose || "");
    if (scd.length === 0) {
      navDrop.push({
        label: o.title,
        key: `m-${o.index}`,
        navData: {
          isSubChoose: false,
          destScene: o.dest,
        },
      });
    } else {
      navDrop.push({
        label: o.title,
        key: `m-${o.index}-main`,
        children: scd.map((d) => {
          return {
            label: `${d[0]}`,
            key: `s-${o.index}-${d[1]}`,
            navData: {
              isSubChoose: true,
              destScene: d[1],
            },
          };
        }),
      });
    }
  }
  return navDrop;
}

type SceneNavDropdownOption = DropdownOption & {
  navData?: {
    isSubChoose: boolean;
    destScene: number;
  };
};
function dropJump(
  _key: string,
  navIndex: number,
  ndropoption: SceneNavDropdownOption,
) {
  navJump(navIndex);
  jump(ndropoption.navData?.destScene || 0);
}
function getSubChooseData(scStr: string) {
  if (scStr === "") {
    return [];
  }
  return scStr.split(";;").map((i) => {
    return i.split(";");
  });
}
</script>

<template>
  <h2 v-if="firstScene?.etype">
    <span :id="firstScene.etype" />
    <span
      :id="encodeURI(firstScene.etype).replace(/%/g, '.')"
      class="mw-headline"
    >
      {{ firstScene.etype }}
    </span>
  </h2>
  <h3 v-if="firstScene">
    <span :id="firstScene.ename || firstScene.name" />
    <span
      :id="
        encodeURI((firstScene.ename || firstScene.name || '')).replace(/%/g, '.')
      "
      class="mw-headline"
    >
      {{ firstScene.ename || firstScene.name }}
    </span>
  </h3>
  <div v-if="firstScene?.edesc" v-html="firstScene.edesc"></div>
  <NConfigProvider
    preflight-style-disabled
    :theme-overrides="{
      common: {
        borderRadius: '0',
      },
      Card: {
        color: '#212121',
        textColor: '#fff',
        titleTextColor: '#fff',
        actionColor: '#343434',
        paddingSmall: '0.6em',
        lineHeight: '1.4',
      },
      Breadcrumb: { itemTextColor: '#A8AFB5' },
      Button: { textColor: '#fff' },
    }"
    class="ISEventFrame"
  >
    <NSpace class="max-w-full w-140">
      <NLayout>
        <NLayoutContent>
          <NBreadcrumb class="from-[#2f2f2f20] to-[#2f2f2f00] bg-gradient-to-b">
            <NBreadcrumbItem
              v-for="(SceneId, index) in sceneNav"
              :key="index"
              @click="navJump(index)"
            >
              <template #separator>
                <div class="scale-x-50">&gt;</div>
              </template>
              <NDropdown
                v-if="
                  getScene(SceneId) &&
                  getScene(SceneId)!.options.length > 0 &&
                  index !== sceneNav.length - 1
                "
                placement="bottom-start"
                :show-arrow="true"
                :options="optionsToNavDrop(getScene(SceneId)!.options)"
                @select="(k, op) => dropJump(k, index, op)"
              >
                <div class="trigger">
                  <NIcon v-if="SceneId === 0">
                    <HomeSharp />
                  </NIcon>
                  <span
                    v-else
                    :class="{
                      'px-1 bg-[#00638f] b-0.5 b-[#0098dc] b-solid c-white':
                        isPrtsInfo(SceneId),
                    }"
                  >
                    <sup v-if="isPrtsInfo(SceneId)">
                      <i class="mdi mdi-rhombus-outline font-size-2"></i>
                    </sup>
                    {{ getScene(SceneId)?.nav }}
                  </span>
                </div>
              </NDropdown>
              <div v-else>
                <NIcon v-if="SceneId === 0">
                  <HomeSharp />
                </NIcon>
                <span
                  v-else
                  :class="[
                    {
                      'px-1 bg-[#00638f] b-0.5 b-[#0098dc] b-solid c-white':
                        isPrtsInfo(SceneId),
                    },
                  ]"
                >
                  <sup v-if="isPrtsInfo(SceneId)">
                    <i class="mdi mdi-rhombus-outline font-size-2"></i>
                  </sup>
                  {{ getScene(SceneId)?.nav }}
                </span>
              </div>
            </NBreadcrumbItem>
          </NBreadcrumb>
          <NCard
            v-if="currentScene"
            class="relative"
            :title="currentScene.name || ''"
            size="small"
          >
            <template #cover>
              <a :href="`/w/File:${currentScene.image}.png`">
                <img
                  class="img w-140"
                  :src="getImagePath(`${currentScene.image}.png`)"
                />
              </a>
            </template>
            <div
              v-if="isCurScenePrtsInfo"
              class="b-1 b-[#0098dca0] b-b-transparent b-solid bg-[#0098dc50] px-2 font-size-2.5"
            >
              <i class="mdi mdi-rhombus-outline"></i>
              PRTS info.
            </div>
            <div
              :class="[
                {
                  'pa-1 b-1 b-[#0098dca0] b-solid': isCurScenePrtsInfo,
                },
              ]"
              v-html="currentScene.text"
            ></div>
            <template
              v-if="currentScene.options.length > 0"
              #action
            >
              <NSpace vertical>
                <ISEventOption
                  v-for="(item, index) in currentScene.options"
                  :key="index"
                  v-bind="item.iconId ? { iconId: item.iconId } : {}"
                  v-bind="item.customBadgeText ? { customBadgeText: item.customBadgeText } : {}"
                  :title="item.title"
                  :type="item.type"
                  :icon="item.icon"
                  :desc1="item.desc1"
                  :desc2="item.desc2"
                  :is-theme="isTheme"
                  :subchoose="getSubChooseData(item.subChoose ?? '')"
                  :method-jump="jump"
                  @click="jump(item.dest)"
                />
              </NSpace>
            </template>
          </NCard>
        </NLayoutContent>
      </NLayout>
    </NSpace>
  </NConfigProvider>
</template>

<style scoped>
:deep(.n-breadcrumb .n-breadcrumb-item .n-breadcrumb-item__separator) {
  margin: 0 !important;
}

:deep(.n-breadcrumb ul) {
  margin: 0 !important;
  padding: 0.2em !important;
}

:deep(.n-breadcrumb li) {
  margin: 0 !important;
}
</style>
