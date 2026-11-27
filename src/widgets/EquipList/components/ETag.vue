<script setup lang="ts">
import { AkTooltip } from "@mooncellwiki/prts-design-vue";

import { customLabel, tagIconFavor, tagIconOther } from "../consts";

defineProps<{
  type: "lv" | "favor" | "mission";
  value: string;
}>();

const getIconSrc = (type: string) => {
  return type === "favor" ? tagIconFavor : tagIconOther;
};
</script>

<template>
  <AkTooltip trigger="hover">
    <template #trigger>
      <div
        v-if="type === 'lv' || type === 'favor'"
        class="ep-etag ep-etag--disc"
      >
        <div class="ep-etag__inner">
          <span
            class="ep-etag__value"
            style="
              text-shadow:
                0 0 5px black,
                0 0 5px black,
                0 0 5px black,
                0 0 5px black;
            "
          >
            {{ value }}
          </span>
          <img
            class="ep-etag__img"
            :src="getIconSrc(type)"
            width="50"
            loading="lazy"
          />
        </div>
      </div>
      <div v-else class="ep-etag ep-etag--mission">
        <div class="ep-etag__mission">
          <div class="ep-etag__mission-inner">
            <span class="mdi mdi-clipboard-check ep-etag__mission-icon"></span>
          </div>
        </div>
      </div>
    </template>
    <div v-if="type === 'lv'">
      {{ customLabel.equipString.condLv }}
    </div>
    <div v-if="type === 'favor'">
      {{ customLabel.equipString.condTrust }}
    </div>
    <div v-if="type === 'mission'">
      {{ customLabel.equipString.condMission }}
    </div>
  </AkTooltip>
</template>

<style scoped>
.ep-etag {
  position: relative;
  display: inline-block;
  width: 50px;
  height: 50px;
  margin: 0 -1px;
}

.ep-etag--mission {
  margin-left: 3px;
}

.ep-etag__inner {
  position: relative;
  display: inline-block;
}

.ep-etag__value {
  position: absolute;
  top: 25px;
  width: 50px;
  transform: translateY(-50%);
  pointer-events: none;
  color: #fff !important;
  font-size: 20px;
  font-weight: 700;
  text-align: center;
  white-space: nowrap;
}

.ep-etag__img {
  display: block;
}

.ep-etag__mission {
  position: absolute;
  display: inline-block;
  width: 40px;
  height: 40px;
  margin: 2px 0;
  background: #2f2f2f;
  border: 2px solid #00b1ff;
  border-radius: 50%;
  box-shadow: 0 2px 4px 0 #00000099;
}

.ep-etag__mission-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
}

.ep-etag__mission-icon {
  color: #fff;
  font-size: 24px;
}
</style>
