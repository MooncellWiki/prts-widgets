import { computed, ref, type ComputedRef, type Ref } from "vue";

import { useMutationObserver } from "@vueuse/core";
import {
  darkTheme,
  type GlobalTheme,
  type GlobalThemeOverrides,
} from "naive-ui";

const isWikiNight = () => {
  const { classList } = document.documentElement;
  if (classList.contains("skin-theme-clientpref-night")) return true;

  return (
    classList.contains("skin-theme-clientpref-os") &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
};

// MediaWiki Codex (Vector 2022) night-mode palette. Naive UI derives hover /
// pressed states from these via color math that can't parse `var(...)`, so the
// concrete values are used here. They mirror the wiki's default night palette.
const BG_BASE = "#101418";
const BG_SUBTLE = "#202122";
const COLOR_BASE = "#eaecf0";
const COLOR_SUBTLE = "#a2a9b1";
const BORDER_BASE = "#72777d";

// Maps Naive UI common tokens onto the wiki night palette so components render
// the wiki theme natively instead of being re-skinned by CSS overrides.
const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    baseColor: BG_BASE,
    bodyColor: BG_BASE,
    cardColor: BG_BASE,
    modalColor: BG_BASE,
    popoverColor: BG_BASE,
    tableColor: BG_BASE,
    tableHeaderColor: BG_SUBTLE,
    inputColor: BG_SUBTLE,
    inputColorDisabled: BG_SUBTLE,
    actionColor: BG_SUBTLE,
    textColorBase: COLOR_BASE,
    textColor1: COLOR_BASE,
    textColor2: COLOR_BASE,
    textColor3: COLOR_SUBTLE,
    textColorDisabled: COLOR_SUBTLE,
    placeholderColor: COLOR_SUBTLE,
    iconColor: COLOR_SUBTLE,
    closeIconColor: COLOR_SUBTLE,
    borderColor: BORDER_BASE,
    dividerColor: BORDER_BASE,
  },
};

// Shallow-merges per component key (`common`, `Button`, ...) so a widget's brand
// overrides win over the shared dark base on conflicting tokens.
const mergeThemeOverrides = (
  base: GlobalThemeOverrides,
  custom: GlobalThemeOverrides,
): GlobalThemeOverrides => {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(custom)) {
    merged[key] = {
      ...(merged[key] as object | undefined),
      ...value,
    };
  }
  return merged;
};

export const useTheme = (
  overrides: GlobalThemeOverrides = {},
): {
  theme: ComputedRef<GlobalTheme | null>;
  themeOverrides: ComputedRef<GlobalThemeOverrides>;
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
  const themeOverrides = computed(() =>
    isDark.value
      ? mergeThemeOverrides(darkThemeOverrides, overrides)
      : overrides,
  );

  return { theme, themeOverrides, isDark };
};
