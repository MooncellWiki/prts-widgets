import { onScopeDispose, ref, type Ref } from "vue";

import { isClient, useEventListener, useMutationObserver } from "@vueuse/core";

// 与 src/utils/theme.ts 的 isWikiNight 同义（那边连着 naive-ui 的主题，这里不想把它带进来）
function isWikiNight(prefersDark: boolean) {
  const { classList } = document.documentElement;
  if (classList.contains("skin-theme-clientpref-night")) return true;
  return classList.contains("skin-theme-clientpref-os") && prefersDark;
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

  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const current = () => (isWikiNight(system.matches) ? "dark" : "light");
  const theme = ref<"light" | "dark" | undefined>(current());
  const sync = () => {
    theme.value = current();
  };
  useMutationObserver(document.documentElement, sync, {
    attributeFilter: ["class"],
  });
  if (typeof system.addEventListener === "function") {
    useEventListener(system, "change", sync);
  } else {
    // Safari 12 的 MediaQueryList 只提供 addListener / removeListener。
    system.addListener(sync);
    onScopeDispose(() => system.removeListener(sync));
  }
  return theme;
}
