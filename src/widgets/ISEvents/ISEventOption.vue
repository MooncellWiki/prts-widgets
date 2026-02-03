<script setup lang="ts">
import { ref } from "vue";

import {
  NAvatar,
  NBadge,
  NButton,
  NCard,
  NCollapseTransition,
  NSpace,
} from "naive-ui";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import { getImagePath } from "@/utils/utils";
defineProps<{
  title?: string;
  type?: string;
  icon?: string;
  iconId?: string;
  desc1?: string;
  desc2?: string;
  isTheme?: string;
  customBadgeText?: string;
  subchoose: string[][];
  methodJump: (index: number) => void;
}>();
const showSubChoose = ref(false);
</script>

<template>
  <hr v-if="type === 'hr'" class="h-2px bg-white" />
  <NCard
    v-else-if="title || desc1 || desc2"
    :style="[
      type === 'desc'
        ? { cursor: 'default' }
        : { cursor: 'pointer', borderColor: '#929292' },
      subchoose.length > 0 ? { cursor: 'default' } : {},
    ]"
    :title="type === 'guide' ? '' : title"
    size="small"
    :header-style="{ height: '3em' }"
  >
    <template v-if="icon" #header-extra>
      <NAvatar
        v-if="type === 'simple'"
        color="#212121"
        object-fit="scale-down"
        :size="40"
        :src="getImagePath(`集成战略_选项_${icon}.png`)"
      />
      <NAvatar
        v-if="type === 'item'"
        color="#212121"
        object-fit="scale-down"
        :size="40"
        :src="getImagePath(`集成战略_道具_${icon}.png`)"
      />
      <NBadge v-if="type === 'collection'" :value="icon" color="#666666">
        <NAvatar
          color="#212121"
          object-fit="scale-down"
          :size="40"
          :src="
            getImagePath(
              isTheme ? `收藏品_${isTheme}_${icon}.png` : `收藏品_${icon}.png`,
            )
          "
        />
      </NBadge>
      <NBadge v-if="type === 'collection2'" :value="icon" color="#666666">
        <NAvatar
          color="#212121"
          object-fit="scale-down"
          :size="40"
          :src="`${TORAPPU_ENDPOINT}/assets/roguelike_topic_itempic/${iconId}.png`"
        />
      </NBadge>
      <NBadge
        v-if="type === 'custom' && customBadgeText"
        color="#666666"
        :offset="[-22.5, 0]"
      >
        <NAvatar
          color="#212121"
          object-fit="scale-down"
          :size="40"
          :src="getImagePath(`${icon}.png`)"
        />
        <template #value>
          <div class="w-max" v-html="customBadgeText"></div>
        </template>
      </NBadge>
      <NAvatar
        v-else-if="type === 'custom'"
        color="#212121"
        object-fit="scale-down"
        :size="40"
        :src="getImagePath(`${icon}.png`)"
      />
    </template>
    <div
      v-html="
        `${desc1}${type === 'guide' ? '<span class=\'mdi mdi-arrow-right float-right\'></span>' : ''}`
      "
    />
    <template v-if="desc2 || subchoose.length > 0" #action>
      <div
        v-if="desc2"
        :class="['text-xs', { 'pb-2': subchoose.length > 0 }]"
        v-html="desc2"
      />
      <div v-if="subchoose.length > 0">
        <NButton
          size="small"
          color="#ccc"
          class="w-full"
          ghost
          icon-placement="right"
          @click="showSubChoose = !showSubChoose"
        >
          {{ showSubChoose ? "收起" : "展开" }}子项
          <template #icon>
            <i
              :class="[
                'mdi mdi-menu-down transition transition-duration-0.3s',
                { 'scale-y-[-1]': showSubChoose },
              ]"
            ></i>
          </template>
        </NButton>
        <NCollapseTransition :show="showSubChoose">
          <NSpace vertical class="mt-2">
            <NCard
              v-for="(data, index) in subchoose"
              :key="index"
              :style="{ cursor: 'pointer', borderColor: '#929292' }"
              size="small"
              :header-style="{ height: '3em' }"
              @click.stop
              @click="
                () => {
                  showSubChoose = false;
                  methodJump(parseInt(data[1]));
                }
              "
            >
              <div
                v-html="
                  `${data[0]}<span class=\'mdi mdi-arrow-right float-right\'></span>`
                "
              />
            </NCard>
          </NSpace>
        </NCollapseTransition>
      </div>
    </template>
  </NCard>
</template>
