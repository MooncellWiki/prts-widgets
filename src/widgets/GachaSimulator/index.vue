<script lang="ts">
import { defineComponent } from "vue";

import {
  NButton,
  NCollapse,
  NCollapseItem,
  NConfigProvider,
  NImage,
  NLayout,
} from "naive-ui";

import { getNaiveUILocale } from "@/utils/i18n";
import { useTheme } from "@/utils/theme";
import { getImagePath } from "@/utils/utils";

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
  },
  setup(props) {
    const bannerImageURL = getImagePath(props.gachaBannerFile);

    return {
      theme,
      locale,
      dateLocale,
      bannerImageURL,
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
    <NLayout class="antialiased px-2 py-4">
      <div class="flex flex-col gap-y-3">
        <NImage width="800" :src="bannerImageURL" />
        <div class="flex gap-x-2">
          <NButton>寻访1次</NButton>
          <NButton>寻访10次</NButton>
          <NButton type="error">清空结果</NButton>
        </div>
        <div class="flex flex-col gap-y-1">
          <span>累计寻访次数:0(使用的合成玉:0[源石:0])</span>
          <span>连续未寻访出6★干员次数:0</span>
          <span>10次寻访内必得5★以上干员</span>
        </div>
        <NCollapse>
          <NCollapseItem title="获得的6★干员" name="1">
            <div>可以</div>
          </NCollapseItem>
          <NCollapseItem title="获得的5★干员" name="2">
            <div>很好</div>
          </NCollapseItem>
          <NCollapseItem title="获得的4★干员" name="3">
            <div>真棒</div>
          </NCollapseItem>
          <NCollapseItem title="获得的3★干员" name="4">
            <div>真棒</div>
          </NCollapseItem>
        </NCollapse>
      </div>
    </NLayout>
  </NConfigProvider>
</template>

<style scoped></style>
