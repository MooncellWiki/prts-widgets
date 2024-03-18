<script lang="ts">
import { computed, defineComponent, type PropType } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";

const getAvatarURL = (charIdRecord: string[]) => {
  return new URL(
    `/assets/char_avatar/${encodeURIComponent(charIdRecord[1] == "" ? charIdRecord[0] : charIdRecord[1])}.png`,
    TORAPPU_ENDPOINT,
  );
};

export default defineComponent({
  components: {},
  props: {
    voiceData: {
      type: Object as PropType<Record<string, string[]>>,
      required: true,
    },
    mapping: {
      type: Object as PropType<Record<string, string>>,
      required: true,
    },
    lang: {
      type: String,
      required: true,
    },
    langTypes: {
      type: Object,
      required: true,
    },
    cvConfig: {
      type: Object,
      required: true,
    },
  },
  setup(props) {
    const originalCV = computed(() => {
      const res = {};
      for (const [cvName, charIdRecords] of Object.entries(props.voiceData)) {
        for (const charIdRecord of charIdRecords) {
          if (charIdRecord[1] == "") res[charIdRecord[0]] = cvName;
        }
      }
      return res;
    });

    return {
      originalCV,
      getAvatarURL,
    };
  },
});
</script>

<template>
  <div v-for="(charIdRecords, cvName) in voiceData" :key="cvName">
    <h2>
      <span :id="cvName" class="mw-headline">{{
        cvName == "-" ? "(无CV)" : cvName
      }}</span>
    </h2>
    <div
      v-for="charIdRecord in charIdRecords"
      :key="charIdRecord"
      class="inline-block relative"
    >
      <div
        v-if="charIdRecord[1] == '' || cvName != originalCV[charIdRecord[0]]"
      >
        <a :href="`/w/${mapping[charIdRecord[0]]}`">
          <img
            class="lazyload"
            :src="getAvatarURL(charIdRecord).toString()"
            width="80"
          />
        </a>
        <div
          v-if="charIdRecord[1]"
          class="absolute right-0 bottom-0 bg-blue-5 px-0.5"
        >
          <span class="mdi mdi mdi-tshirt-crew color-white"></span>
        </div>
        <div
          v-if="
            (cvConfig.linkageRedirect &&
              langTypes[cvConfig.linkageRedirect[charIdRecord[0]]] &&
              charIdRecord[0] in cvConfig.linkageRedirect) ||
            (cvConfig.linkageRedirectRev &&
              cvConfig.linkageRedirectRev.includes(charIdRecord[0]))
          "
          class="absolute right-0 top-0 bg-orange px-0.5 text-1 color-white"
        >
          <span v-if="lang == '联动'">{{
            langTypes[
              charIdRecord[2] || cvConfig.linkageRedirect[charIdRecord[0]]
            ].name || ""
          }}</span>
          <span v-else class="mdi mdi-handshake mdi-rotate-45 text-4"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped></style>
