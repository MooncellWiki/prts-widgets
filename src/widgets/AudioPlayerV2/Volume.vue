<script setup lang="ts">
import {
  VolumeOffOutlined as VolumeOffIcon,
  VolumeUpOutlined as VolumeUpIcon,
  VolumeMuteOutlined as VolumeMuteIcon,
} from "@vicons/material";
import { NButton, NIcon, NTooltip, NSlider } from "naive-ui";

defineProps({
  vol: {
    type: Number,
    default: 100,
  },
  mute: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["changeVol", "toggleMute"]);
</script>

<template>
  <div class="volume-control">
    <n-tooltip>
      <template #trigger>
        <n-button quaternary circle @click="$emit('toggleMute')">
          <template #icon>
            <n-icon>
              <VolumeMuteIcon v-if="mute" />
              <VolumeOffIcon v-else-if="vol === 0" />
              <VolumeUpIcon v-else />
            </n-icon>
          </template>
        </n-button>
      </template>
      {{ mute ? "取消静音" : "静音" }}
    </n-tooltip>

    <n-slider
      class="volume-slider"
      :value="vol"
      :min="0"
      :max="100"
      :disabled="mute"
      @update:value="$emit('changeVol', $event)"
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
