import { ref, type Ref } from "vue";

import { isClient, useMutationObserver } from "@vueuse/core";

// 与 src/utils/theme.ts 的 isWikiNight 同义（那边连着 naive-ui 的主题，这里不想把它带进来）
function isWikiNight() {
  const { classList } = document.documentElement;
  if (classList.contains("skin-theme-clientpref-night")) return true;
  return (
    classList.contains("skin-theme-clientpref-os") &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * 给 <AkScope> 的局部主题。
 * Arknights 皮肤上不指定（undefined）：令牌本来就跟着页面走。
 * 别的皮肤上要明说：不写 data-theme 的作用域在没有 clientpref 类时跟随系统，
 * 而 Vector 对未登录用户不跟随系统——系统是暗色时会在白页面上画出一块暗色组件、浅色字落在白底上。
 * 外壳预渲染（src/prerender/）在 Node 里跑，没有 DOM，也不指定。
 */
export function useHostTheme(): Ref<"light" | "dark" | undefined> {
  if (!isClient || document.body.classList.contains("skin-arknights"))
    return ref(undefined);

  const current = () => (isWikiNight() ? "dark" : "light");
  const theme = ref<"light" | "dark" | undefined>(current());
  useMutationObserver(
    document.documentElement,
    () => {
      theme.value = current();
    },
    { attributeFilter: ["class"] },
  );
  return theme;
}
