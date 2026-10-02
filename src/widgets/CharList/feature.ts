const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function convert(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.nodeValue ?? "");
  if (!(node instanceof HTMLElement)) return "";

  if (node.classList.contains("mc-tooltips")) {
    const term = node.children[0];
    const tip = node.children[1]?.cloneNode(true) as HTMLElement | undefined;
    if (tip) for (const br of tip.querySelectorAll("br")) br.replaceWith("\n");
    const text = (tip?.textContent ?? "")
      // 首行「术语: xx」就是触发词自己，去掉
      .replace(/^术语[:：]\s*[^\n]*\n?/, "")
      .replaceAll(/[ \t]+/g, " ")
      .trim();
    return `<span class="ak-term" tabindex="0" data-tip="${escapeHtml(text)}">${escapeHtml(term?.textContent ?? "")}</span>`;
  }

  if (node.tagName === "BR") return "<br>";
  const inner = Array.from(node.childNodes, convert).join("");
  if (/#00B0FF/i.test(node.getAttribute("style") ?? ""))
    return `<span class="ak-rt-kw">${inner}</span>`;
  return inner;
}

/**
 * 模板输出的特性 HTML → 设计系统的写法。只认现网实际出现的三种节点：
 *   内联 color:#00B0FF 的 span → .ak-rt-kw（关键词色跟主题走）
 *   {{术语}} 的 .mc-tooltips → .ak-term[data-tip]（提示正文转成纯文本，气泡由 utils/useHoverTip 画）
 *   其余标签只留文字，<br> 保留
 * 输出里的文字都转义过，可以直接 v-html。
 */
export function convertFeature(el: Element): string {
  return Array.from(el.childNodes, convert).join("").trim();
}
