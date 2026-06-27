import { computed, ref, type ComputedRef } from "vue";

import { useMutationObserver } from "@vueuse/core";
import { darkTheme, type GlobalTheme } from "naive-ui";

const PREFERS_DARK = "(prefers-color-scheme: dark)";

const isWikiNight = (className: string) => {
  const classList = new Set(className.split(/\s+/));
  if (classList.has("skin-theme-clientpref-night")) return true;
  return (
    classList.has("skin-theme-clientpref-os") &&
    window.matchMedia(PREFERS_DARK).matches
  );
};

export const useTheme = (): {
  theme: ComputedRef<GlobalTheme | null>;
  isDark: ComputedRef<boolean>;
} => {
  const className = ref(document.documentElement.className);

  useMutationObserver(
    document.documentElement,
    () => {
      className.value = document.documentElement.className;
    },
    { attributeFilter: ["class"], attributes: true },
  );

  const isDark = computed(() => isWikiNight(className.value));
  const theme = computed(() => (isDark.value ? darkTheme : null));

  return { theme, isDark };
};
