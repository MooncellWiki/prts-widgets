import { ref } from "vue";

import { useDark, useToggle } from "@vueuse/core";
import { darkTheme, type GlobalTheme } from "naive-ui";

export const useTheme = () => {
  const theme = ref<GlobalTheme | null>(null);
  const isDark = useDark({
    onChanged(dark: boolean) {
      theme.value = dark ? darkTheme : null;
      const el = document.querySelector("html");
      if (dark) el?.classList.add("dark");
      else el?.classList.remove("dark");
    },
  });
  const toggleDark = useToggle(isDark);

  return {
    theme,
    isDark,
    toggleDark,
  };
};
