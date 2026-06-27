<script setup lang="ts">
import {
  VolumeOffOutlined as VolumeOffIcon,
  VolumeUpOutlined as VolumeUpIcon,
  VolumeMuteOutlined as VolumeMuteIcon,
} from "@vicons/material";
import { NButton, NIcon, NTooltip, NSlider } from "naive-ui";

const vol = defineModel<number>("vol", { default: 100 });
const mute = defineModel<boolean>("mute", { default: false });

const toggleMute = () => {
  mute.value = !mute.value;
};
</script>

<template>
  <div class="volume-control">
    <NTooltip>
      <template #trigger>
        <NButton quaternary circle @click="toggleMute">
          <template #icon>
            <NIcon>
              <VolumeMuteIcon v-if="mute" />
              <VolumeOffIcon v-else-if="vol === 0" />
              <VolumeUpIcon v-else />
            </NIcon>
          </template>
        </NButton>
      </template>
      {{ mute ? "取消静音" : "静音" }}
    </NTooltip>

    <NSlider
      v-model:value="vol"
      class="volume-slider"
      :min="0"
      :max="100"
      :disabled="mute"
    />
  </div>
</template>

<style scoped>
.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-slider {
  width: 80px;
}
</style>
