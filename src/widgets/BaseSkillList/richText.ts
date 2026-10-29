/**
 * 游戏富文本（building_data 的技能描述、termDescriptionDict 的术语解释）：
 *   <@cc.vup>…</>   样式（gamedata_const.richTextStyles）→ .ak-rt-vup 这一类，命名空间不论；认不得的只留文字
 *   <$cc.xxx>…</>   术语 → .ak-rt-term，解释作悬停提示（data-tip，气泡由 utils/useHoverTip 画）
 *   换行            → <br>
 * 标签可以嵌套；没闭合的在末尾自动闭合，多出来的 </> 忽略（同设计系统的 AkRichText）。
 * 不直接用 AkRichText：搜索命中的字要在文字里高亮，列表里几百段描述也不值得各起一个组件。
 */
export type RtNode =
  | { type: "text"; text: string }
  | { type: "br" }
  | { type: "style" | "term"; key: string; children: RtNode[] };

const TAG_RE = /<([@$])([\w.]+)>|<\/>|\r?\n/g;

export function parseRichText(src: string): RtNode[] {
  const root: RtNode[] = [];
  const stack: Extract<RtNode, { children: RtNode[] }>[] = [];
  const push = (node: RtNode) =>
    (stack.length > 0 ? stack[stack.length - 1].children : root).push(node);

  let last = 0;
  for (const m of src.matchAll(TAG_RE)) {
    if (m.index > last) push({ type: "text", text: src.slice(last, m.index) });
    last = m.index + m[0].length;
    if (m[0] === "</>") {
      const node = stack.pop();
      if (node) push(node);
    } else if (m[1]) {
      stack.push({
        type: m[1] === "@" ? "style" : "term",
        key: m[2],
        children: [],
      });
    } else push({ type: "br" });
  }
  if (last < src.length) push({ type: "text", text: src.slice(last) });
  while (stack.length > 0) push(stack.pop()!);
  return root;
}

/** 纯文字：搜索、术语解释用 */
export function plainText(nodes: readonly RtNode[]): string {
  return nodes
    .map((n) =>
      n.type === "text"
        ? n.text
        : n.type === "br"
          ? "\n"
          : plainText(n.children),
    )
    .join("");
}

/** 设计系统认得的富文本样式（arknights/rich-text.css 的 .ak-rt-*） */
const STYLES = new Set([
  "vup",
  "vdown",
  "rem",
  "kw",
  "talpu",
  "imp",
  "pn",
  "enemy",
  "gild",
  "drop",
  "acrem",
  "level",
]);

export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** 文字里搜索命中的地方包一层 <mark>（needle 已转小写）；只在一段文字里找，跨标签的命中不标 */
export function highlight(text: string, needle = ""): string {
  if (!needle) return escapeHtml(text);
  const lower = text.toLowerCase();
  let out = "";
  let last = 0;
  for (
    let i = lower.indexOf(needle);
    i !== -1;
    i = lower.indexOf(needle, last)
  ) {
    out += `${escapeHtml(text.slice(last, i))}<mark>${escapeHtml(text.slice(i, i + needle.length))}</mark>`;
    last = i + needle.length;
  }
  return out + escapeHtml(text.slice(last));
}

/**
 * 结点树 → 可以直接 v-html 的串：文字都转义过，标签只有这里拼的几种。
 * terms：术语 id → 提示文字（「名字：解释」）；查不到的术语只留文字。
 */
export function renderRichText(
  nodes: readonly RtNode[],
  terms: ReadonlyMap<string, string>,
  needle = "",
): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return highlight(n.text, needle);
      if (n.type === "br") return "<br>";
      const inner = renderRichText(n.children, terms, needle);
      if (n.type === "term") {
        const tip = terms.get(n.key);
        return tip
          ? `<span class="ak-rt-term" tabindex="0" data-tip="${escapeHtml(tip)}">${inner}</span>`
          : inner;
      }
      const name = n.key.slice(n.key.lastIndexOf(".") + 1);
      return STYLES.has(name)
        ? `<span class="ak-rt-${name}">${inner}</span>`
        : inner;
    })
    .join("");
}
