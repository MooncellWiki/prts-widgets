import { nextTick, onBeforeUnmount, onMounted, ref, type Ref } from "vue";

const TERM = ".ak-term[data-tip]";

/**
 * 特性里术语（.ak-term[data-tip]，见 feature.ts）的提示气泡：
 * 悬停 / 键盘聚焦时出，按视口定位（position: fixed）——贴在术语上方，放不下就放下方，左右不出视口，不会被表格裁掉。
 * 术语在 v-html 里，所以事件委托在根节点上：返回的 handlers 用 v-on 绑到根节点；bubble 是气泡元素的模板 ref，用来量尺寸。
 */
export function useTermTip(bubble: Readonly<Ref<HTMLElement | null>>) {
  const tip = ref<{ text: string; left: number; top: number } | null>(null);

  const hide = () => {
    tip.value = null;
  };
  async function show(el: HTMLElement) {
    // 先离屏渲染量尺寸，再摆到位
    tip.value = { text: el.dataset.tip ?? "", left: -9999, top: -9999 };
    await nextTick();
    if (!tip.value || !bubble.value || !el.isConnected) return;
    const r = el.getBoundingClientRect();
    const w = bubble.value.offsetWidth;
    const h = bubble.value.offsetHeight;
    const viewport = document.documentElement.clientWidth;
    tip.value = {
      text: tip.value.text,
      left: Math.round(
        Math.min(Math.max(8, r.left + r.width / 2 - w / 2), viewport - w - 8),
      ),
      top: Math.round(r.top - h - 6 < 8 ? r.bottom + 6 : r.top - h - 6),
    };
  }

  const term = (e: Event) =>
    e.target instanceof Element ? e.target.closest<HTMLElement>(TERM) : null;
  const onEnter = (e: Event) => {
    const el = term(e);
    if (el) show(el);
  };
  const onLeave = (e: Event) => {
    if (term(e)) hide();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") hide();
  };

  onMounted(() => {
    window.addEventListener("scroll", hide, { passive: true });
    document.addEventListener("keydown", onKey);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("scroll", hide);
    document.removeEventListener("keydown", onKey);
  });

  return {
    tip,
    handlers: {
      mouseover: onEnter,
      focusin: onEnter,
      mouseout: onLeave,
      focusout: onLeave,
    },
  };
}
