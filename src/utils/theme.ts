import { computed, ref, type ComputedRef } from "vue";

import { useMediaQuery, useMutationObserver } from "@vueuse/core";
import { darkTheme, type GlobalTheme } from "naive-ui";

export const isWikiDarkMode = () => {
  const htmlClass = document.documentElement.classList;

  if (htmlClass.contains("skin-theme-clientpref-night")) return true;
  if (
    htmlClass.contains("skin-theme-clientpref-os") &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
    return true;
  return false;
};

export const getWikiTheme = (): GlobalTheme | null =>
  isWikiDarkMode() ? darkTheme : null;

export const useWikiDarkMode = () => {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
  const htmlClass = ref(document.documentElement.className);

  useMutationObserver(
    document.documentElement,
    () => {
      htmlClass.value = document.documentElement.className;
    },
    {
      attributeFilter: ["class"],
      attributes: true,
    },
  );

  return computed(() => {
    const classList = new Set(htmlClass.value.split(/\s+/));
    if (classList.has("skin-theme-clientpref-night")) return true;
    return classList.has("skin-theme-clientpref-os") && prefersDark.value;
  });
};

export const useWikiTheme = (): ComputedRef<GlobalTheme | null> => {
  const isDark = useWikiDarkMode();

  return computed(() => (isDark.value ? darkTheme : null));
};
