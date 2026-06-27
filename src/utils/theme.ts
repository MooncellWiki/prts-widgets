import { computed, ref, type ComputedRef, type Ref } from "vue";

import { useMutationObserver } from "@vueuse/core";
import { darkTheme, type GlobalTheme } from "naive-ui";

const isWikiNight = () => {
  const { classList } = document.documentElement;
  if (classList.contains("skin-theme-clientpref-night")) return true;

  return (
    classList.contains("skin-theme-clientpref-os") &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

export const useTheme = (): {
  theme: ComputedRef<GlobalTheme | null>;
  isDark: Ref<boolean>;
} => {
  const isDark = ref(isWikiNight());

  useMutationObserver(
    document.documentElement,
    () => {
      isDark.value = isWikiNight();
    },
    { attributeFilter: ["class"] },
  );

  const theme = computed(() => (isDark.value ? darkTheme : null));

  return { theme, isDark };
};
