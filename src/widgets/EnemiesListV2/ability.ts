const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const stripTags = (s: string) => s.replaceAll(/<[^>]*>/g, "");

/** 认得的三种标记；其余的 < > 都是正文（能力里把别的敌人写成 <源石虫>、<PRTS>） */
const TOKEN_RE =
  /<br\s*\/?>|<span class="mc-tooltips"><span>(.*?)<\/span><span>(.*?)<\/span><\/span>|<span style="color:\s*(#[0-9a-f]{6});?">(.*?)<\/span>/gi;

/** 小标题（游戏 abilityList 的 textFormat = TITLE，数据里是这个颜色的 span） */
const TITLE_COLOR = "#FF4F0B";
/** 关键词（游戏富文本的 eb.key） */
const KEY_COLOR = "#00FFFF";

export interface Ability {
  /** 可以直接 v-html：文字都转义过，标签只有这里拼的几种 */
  html: string;
  /** 搜索用的纯文字，不含术语提示的正文 */
  plain: string;
}

/**
 * 「敌人一览/数据」里的能力 HTML → 设计系统的写法，一行一个 .el-ab__line。
 * 数据是机器人按游戏的 abilityList 拼的，只有这几种写法：
 *   <br> 分行；行首 · = 普通能力，※ = 可被沉默（textFormat = SILENCE），行首的记号单独包一层做悬挂缩进
 *   color:#FF4F0B 的 span → 小标题；color:#00FFFF 的 span → .ak-rt-kw（关键词色跟主题走）
 *   {{术语}} 的 .mc-tooltips → .ak-term[data-tip]（气泡由 utils/useHoverTip 画）
 * 不走 innerHTML 解析：<PRTS>、<R系列动力装甲> 这种尖括号里的名字会被当成标签吞掉。
 */
export function convertAbility(source: string): Ability {
  const lines: { html: string; plain: string; title: boolean }[] = [];
  let line = { html: "", plain: "", title: false };
  const text = (s: string) => {
    line.html += escapeHtml(s);
    line.plain += s;
  };
  const flush = () => {
    if (line.plain) lines.push(line);
    line = { html: "", plain: "", title: false };
  };

  let last = 0;
  for (const m of source.matchAll(TOKEN_RE)) {
    text(source.slice(last, m.index));
    last = m.index + m[0].length;
    const [, term, tip, color, colored] = m;
    if (term !== undefined) {
      const name = stripTags(term);
      const body = stripTags(tip.replaceAll(/<br\s*\/?>/gi, "\n")).trim();
      line.html += `<span class="ak-term" tabindex="0" data-tip="${escapeHtml(body)}">${escapeHtml(name)}</span>`;
      line.plain += name;
    } else if (color === undefined) flush();
    else if (color.toUpperCase() === TITLE_COLOR) {
      text(stripTags(colored));
      line.title = true;
    } else if (color.toUpperCase() === KEY_COLOR) {
      const word = stripTags(colored);
      line.html += `<span class="ak-rt-kw">${escapeHtml(word)}</span>`;
      line.plain += word;
    } else text(stripTags(colored));
  }
  text(source.slice(last));
  flush();

  return {
    html: lines
      .map(({ html, title }) => {
        if (title) return `<span class="el-ab__title">${html}</span>`;
        const mark = /^[·※]/.exec(html)?.[0];
        return mark
          ? `<span class="el-ab__line"><i>${mark}</i>${html.slice(1)}</span>`
          : `<span class="el-ab__line">${html}</span>`;
      })
      .join(""),
    plain: lines.map((l) => l.plain).join("\n"),
  };
}
