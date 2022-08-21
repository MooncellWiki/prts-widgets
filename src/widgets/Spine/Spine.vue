<template>
  <n-config-provider
    preflight-style-disabled
    :breakpoints="{ s: 640, m: 768, lg: 1024, xl: 1280, xxl: 1536 }"
    :theme-overrides="{ common: { primaryColor: '#6a6aff' } }"
  >
    <template v-if="loaded">
      <n-card class="w-[700px]">
        <div class="flex justify-around">
          <div class="w-[330px] pr-4 flex flex-col justify-around">
            <n-form-item size="small" :show-feedback="false" label="皮肤"
              ><n-select></n-select
            ></n-form-item>
            <n-form-item size="small" :show-feedback="false" label="模型"
              ><n-select></n-select
            ></n-form-item>
            <n-form-item size="small" :show-feedback="false" label="动画"
              ><n-select></n-select
            ></n-form-item>
            <div class="flex">
              <n-form-item
                size="small"
                :show-feedback="false"
                label="循环播放"
                class="mr-2"
              >
                <n-switch size="small"></n-switch>
              </n-form-item>
              <n-form-item
                size="small"
                :show-feedback="false"
                label="背景颜色"
                class="flex-grow"
              >
                <n-color-picker size="small" />
              </n-form-item>
            </div>
            <n-form-item
              label-placement="left"
              :show-feedback="false"
              label="播放速度"
            >
              <n-slider :min="0.1" :max="2" :step="0.1"></n-slider>
            </n-form-item>
            <div class="flex justify-around">
              <n-button circle size="large">
                <template #icon>
                  <n-icon :size="28"><DownloadOutlined /></n-icon>
                </template>
              </n-button>
              <n-button circle size="large">
                <template #icon>
                  <n-icon :size="28"><RefreshOutlined /></n-icon>
                </template>
              </n-button>
              <n-button circle size="large">
                <template #icon>
                  <n-icon :size="28"><FullscreenOutlined /></n-icon>
                </template>
              </n-button>
              <n-button circle size="large">
                <template #icon>
                  <n-icon :size="28"><InfoOutlined /></n-icon>
                </template>
              </n-button>
            </div>
          </div>
          <div
            class="overflow-hidden"
            :style="{
              width: big ? '1000px' : '300px',
              height: big ? '1000px' : '300px',
            }"
          >
            <n-skeleton class="w-full h-full" v-if="isLoading"></n-skeleton>
            <div
              v-else
              style="
                  backgroundImage:linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(135deg, #ccc 25%, transparent 25%),linear-gradient(45deg, transparent 75%, #ccc 75%),linear-gradient(135deg, transparent 75%, #ccc 75%),
                  backgroundSize: '24px 24px',
                  backgroundPosition: '0 0, 12px 0, 12px -12px, 0px 12px',
                "
            >
              <div
                style="
                    width: 1000,
                    height: 1000,
                    transformOrigin: 'top left',
                  "
                :style="{ transform: big ? '' : 'scale(0.3,0.3)' }"
              >
                <canvas width="1000" height="1000" ref="canvas" />
              </div>
            </div>
          </div>
        </div>
      </n-card>
    </template>
    <n-button
      v-else
      @click="
        () => {
          loaded = true;
        }
      "
      >点击加载</n-button
    >
  </n-config-provider>
</template>
<script lang="ts">
import { defineComponent, PropType, ref } from "vue";
import {
  NConfigProvider,
  NButton,
  NCard,
  NSkeleton,
  NForm,
  NFormItem,
  NSelect,
  NSwitch,
  NColorPicker,
  NSlider,
  NIcon,
} from "naive-ui";
import {
  DownloadOutlined,
  RefreshOutlined,
  FullscreenOutlined,
  InfoOutlined,
} from "@vicons/material";
import { useEvent } from "./useEvent";
import { Spine } from "../../utils/spine";
interface States {
  skin: string;
  modelList: string[];
  model: string;
  animations: string[];
  animation: string;
}
enum Actions {
  changeSkin,
  changeModel,
  changeAni,
  update,
}
export interface Props {
  prefix: string;
  name: string;
  skin: {
    [key: string]: {
      [key: string]: {
        file: string;
        skin?: string;
      };
    };
  };
}
export default defineComponent({
  components: {
    NConfigProvider,
    NButton,
    NCard,
    NSkeleton,
    NForm,
    NFormItem,
    NSelect,
    NSwitch,
    NColorPicker,
    NSlider,
    NIcon,
    DownloadOutlined,
    RefreshOutlined,
    FullscreenOutlined,
    InfoOutlined,
  },
  props: {
    prefix: String,
    name: String,
    skin: Object as PropType<{
      [key: string]: {
        [key: string]: {
          file: string;
          skin?: string;
        };
      };
    }>,
  },
  setup() {
    const loaded = ref(false);
    const canvas = ref<HTMLCanvasElement>();
    const spineRef = ref<Spine>();
    const big = useEvent(canvas, spineRef);
    const isLoading = ref(true);
    const color = ref('#00000000');
    const speed = ref(1)
    return {
      loaded,
      spineRef,
      big,
      isLoading,
    };
  },
});
</script>
