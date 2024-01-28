<script lang="ts">
import { defineComponent, onBeforeMount, ref, watch } from "vue";

import { NSpin } from "naive-ui";

import { useTheme } from "@/utils/theme";

import { getEquipData } from "./equipData";

export default defineComponent({
  components: { NSpin },
  props: {
    name: { type: String, required: true },
  },
  setup(props) {
    const content = ref("");
    const { isDark } = useTheme();
    watch(isDark, () => {
      const temp = new DOMParser().parseFromString(content.value, "text/html");
      const seps = temp.querySelectorAll(
        ".majorsep,.minorsep,.term,.iconfilter",
      );
      for (const ele of Array.from(seps)) {
        if (isDark.value) {
          ele.classList.add("dark");
        } else {
          ele.classList.remove("dark");
        }
      }
      content.value = temp.body.innerHTML;
    });
    onBeforeMount(async () => {
      const rawdata = await getEquipData(props.name);
      const temp = new DOMParser().parseFromString(rawdata, "text/html");
      const eles = temp.querySelectorAll(".mc-tooltips");
      const seps = temp.querySelectorAll(
        ".majorsep,.minorsep,.term,.iconfilter",
      );
      for (const e of Array.from(eles)) {
        if (!e.children || e.children.length < 2) continue;
        (e.children[1] as HTMLElement).style.display = "block";
        // @ts-expect-error tippy
        // eslint-disable-next-line no-undef
        tippy6(e.children[0], {
          content: e.children[1],
          arrow: true,
          theme: "light-border",
          size: "large",
          maxWidth: Number.parseInt(
            (e.children[1] as HTMLElement).dataset.size!,
          ),
          trigger:
            (e.children[1] as HTMLElement).dataset.trigger ||
            "mouseenter focus",
        });
      }
      for (const ele of Array.from(seps)) {
        if (isDark.value) {
          ele.classList.add("dark");
        } else {
          ele.classList.remove("dark");
        }
      }
      content.value = temp.body.innerHTML;
    });
    return {
      content,
    };
  },
});
</script>
<template>
  <NSpin :show="!content">
    <div v-html="content" />
    <template #description> 加载中 </template>
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
:deep(.ranktext) {
  flex: 16.5 16.5 16.5%;
  display: flex;
  align-items: center;
  min-width: 100px;
  white-space: nowrap;
  flex-wrap: wrap;
  align-content: center;
}
:deep(.descr) {
  flex: 25 25 25%;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 130px;
}
:deep(.consume) {
  flex: 50 50 50%;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-width: 260px;
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
  background-color: lightgray;
}
:deep(.dark.majorsep) {
  background-color: whitesmoke;
}
:deep(.dark.minorsep) {
  background-color: gray;
}
:deep(.dark.term) {
  text-decoration: underline whitesmoke !important;
  color: whitesmoke !important;
}
:deep(.dark.iconfilter) {
  filter: invert(100%);
}
</style>
