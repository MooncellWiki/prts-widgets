import tippy, {
  type Instance,
  type Props,
  type ReferenceElement,
} from "tippy.js";
import tippyStyle from "tippy.js/dist/tippy.css?inline";
import lightBorderStyle from "tippy.js/themes/light-border.css?inline";

import darkBorderStyle from "@/styles/tippy-dark-border.css?inline";

/**
 * 全站 tooltip 入口，替代 <head> 里手写的
 * `https://static.prts.wiki/npm/tippy.js/tippy.js` + `tippy-light-border.css`，
 * 以及 MediaWiki:Gadget-popup.js。
 *
 * - tippy 的类名 / data 属性前缀在打包时被改写成 `tippy6`（见 vite.config.ts 里的
 *   tippyNamespace 插件）。站内 SMW 自带一份 tippy 占用了 `window.tippy` 和
 *   `.tippy-box`，而 MediaWiki:Gadget-darkModeFix.css、微件:CharShow、
 *   MediaWiki:Gadget-TippyRef.js、微件:MemoryMedalCatcher 都依赖 `tippy6` 这套命名，
 *   所以这里必须保持一致。
 * - `.mc-tooltips`（模板:Popup 的产物）由 MutationObserver 自动挂载，小部件动态渲染
 *   出来的 DOM 不需要再自己遍历一遍。
 */

const TOOLTIP_CLASS = "mc-tooltips";
const TOOLTIP_SELECTOR = `.${TOOLTIP_CLASS}`;
const DEFAULT_TRIGGER = "mouseenter focus";
const LIGHT_THEME = "light-border";
const DARK_THEME = "dark-border";

// 已挂载过的 `.mc-tooltips`。popper 每次显示都会被插进 DOM（`appendTo=parent` 时就插在
// `.mc-tooltips` 里），MutationObserver 会因此反复扫到同一批节点，所以额外记一份。
const mounted = new WeakSet<Element>();

// 与 src/utils/theme.ts 的 isWikiNight 同义。这个入口在 <head> 里以固定文件名加载，
// 必须是自包含产物，不能引用会被打进 common chunk 的 src/utils/。
function isWikiNight(): boolean {
  const { classList } = document.documentElement;
  if (classList.contains("skin-theme-clientpref-night")) return true;

  return (
    classList.contains("skin-theme-clientpref-os") &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

const currentTheme = () => (isWikiNight() ? DARK_THEME : LIGHT_THEME);

// 夜间模式是不刷新页面就能切的，所以每次显示时按当时的主题重写 data-theme。
// tippy 只在 setProps 时才会重刷这个属性，这里直接改不会被覆盖回去。
function applyCurrentTheme(instance: Instance) {
  instance.popper.firstElementChild?.setAttribute("data-theme", currentTheme());
}

function resolveAppendTo(selector: string): Props["appendTo"] | undefined {
  if (selector === "parent") return "parent";

  try {
    return document.querySelector(selector) ?? undefined;
  } catch {
    console.warn(`[Tooltip] 非法的 data-append-to 选择器：${selector}`);
    return undefined;
  }
}

function mount(root: Element) {
  if (mounted.has(root)) return;

  const reference = root.children[0] as ReferenceElement | undefined;
  const source = root.children[1] as HTMLElement | undefined;
  // reference._tippy：别的脚本（比如切换期间还留着的旧 gadget）已经挂过就不再重复挂
  if (!reference || !source || reference._tippy) return;

  // tippy 是把 content 节点「搬」进 popper 的（setContent 走 appendChild），直接传原节点
  // 会把 `.mc-tooltips` 的第二个子节点从文档里摘走。像 CharList 这种先把 DOM 当数据源读
  // innerHTML 的小部件（#filter-data 在 head 的本入口扫描时就已经解析完了），拿到的就是
  // 残缺结构。所以传副本，原节点留在原地继续 display:none。
  const content = source.cloneNode(true) as HTMLElement;
  // 模板:Popup 里内容节点是 display:none 的，交给 tippy 之前要放出来。
  content.style.display = "block";

  const { appendTo, interactive, size, theme, trigger } = content.dataset;
  const props: Partial<Props> = {
    content,
    arrow: true,
    theme: theme || currentTheme(),
    trigger: trigger || DEFAULT_TRIGGER,
    // data-interactive 是字符串，"false" 也是真值，得显式比。
    interactive: interactive !== undefined && interactive !== "false",
  };

  const maxWidth = Number.parseInt(size ?? "");
  if (Number.isFinite(maxWidth)) props.maxWidth = maxWidth;

  if (appendTo) {
    const container = resolveAppendTo(appendTo);
    if (container) props.appendTo = container;
  }

  // 显式指定了主题就不再跟随夜间模式。
  if (!theme) props.onShow = applyCurrentTheme;

  tippy(reference, props);
  mounted.add(root);
}

function scan(root: Element) {
  if (root.classList.contains(TOOLTIP_CLASS)) mount(root);
  for (const node of root.querySelectorAll(TOOLTIP_SELECTOR)) mount(node);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node as Element);
    }
  }
});

function start() {
  const style = document.createElement("style");
  style.className = "prts-tooltip-style";
  style.textContent = [tippyStyle, lightBorderStyle, darkBorderStyle].join(
    "\n",
  );
  document.head.append(style);

  scan(document.body);
  observer.observe(document.body, { childList: true, subtree: true });
}

// 站内 gadget（MediaWiki:Gadget-TippyRef.js）和微件（微件:MemoryMedalCatcher）
// 直接调 tippy6，这里继续兜住这个全局。
window.tippy6 = tippy;

// <head> 里的 module script 是 defer 的，执行时文档已经解析完，会走 else 分支。
if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
