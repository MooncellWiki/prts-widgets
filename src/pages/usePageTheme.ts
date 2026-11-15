import { ref } from "vue";

import { useColorMode, useMutationObserver } from "@vueuse/core";

/** VueUse 管理系统偏好和主题类，组件继续使用既有的 useTheme / useHostTheme。 */
export function usePageTheme() {
  const root = document.documentElement;
  const readTheme = () => {
    const theme = root.dataset.theme;
    return theme === "dark" || theme === "light" ? theme : "auto";
  };
  const preference = ref(readTheme());
  useMutationObserver(
    root,
    () => {
      preference.value = readTheme();
    },
    {
      attributes: true,
      attributeFilter: ["data-theme"],
    },
  );
  return useColorMode({
    storageRef: preference,
    modes: {
      light: "skin-theme-clientpref-day",
      dark: "skin-theme-clientpref-night",
    },
  });
}
