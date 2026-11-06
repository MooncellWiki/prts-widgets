import { STATIC_ENDPOINT } from "@/utils/consts";

/**
 * 编辑写的备注里有 MathJax 公式（天道酬勤·α / β 的 \( … \)）。现网页面靠 {{#Widget:MathJax4}} 在载入时排一遍，
 * 这里的备注是挂载以后才画出来的，要自己排：页面上有 MathJax 就用它，没有就照 微件:MathJax4 的配置载入同一份。
 */
interface MathJaxApi {
  version?: string;
  startup?: { promise: Promise<unknown> };
  typesetPromise?: (elements: Element[]) => Promise<unknown>;
  typesetClear?: (elements: Element[]) => void;
}

const MATHJAX_SRC = `${STATIC_ENDPOINT}/npm/mathjax@4.0/tex-mml-chtml.js`;

let loading: Promise<MathJaxApi> | undefined;

function loadMathJax(): Promise<MathJaxApi> {
  loading ??= new Promise<MathJaxApi>((resolve, reject) => {
    const w = window as unknown as { MathJax?: MathJaxApi };
    const ready = () => {
      const mj = w.MathJax;
      if (!mj?.startup) return reject(new Error("MathJax 没有就绪"));
      mj.startup.promise.then(() => resolve(mj), reject);
    };
    if (w.MathJax?.version) return ready();

    let script = document.querySelector<HTMLScriptElement>("#MathJax-script");
    if (!script) {
      // 同 微件:MathJax4 的 tex 配置（它的 chtml.linebreaks.automatic 在 MathJax 4 里已经不认了，会报警告，不抄）；
      // startup.typeset 关掉——这里只排自己画的那几段
      w.MathJax ??= {
        tex: {
          inlineMath: { "[+]": [["\\(", "\\)"]] },
          displayMath: { "[+]": [["\\[", "\\]"]] },
          processEscapes: true,
        },
        startup: { typeset: false },
      } as unknown as MathJaxApi;
      script = document.createElement("script");
      script.id = "MathJax-script";
      script.async = true;
      script.src = MATHJAX_SRC;
      document.head.append(script);
    }
    script.addEventListener("load", ready, { once: true });
    script.addEventListener("error", reject, { once: true });
  });
  return loading;
}

export const hasMath = (text: string) => /\\\(|\\\[/.test(text);

/** 把 el 里的公式排出来；载入失败就留着原文 */
export async function typesetMath(el: Element) {
  try {
    const mj = await loadMathJax();
    mj.typesetClear?.([el]);
    await mj.typesetPromise?.([el]);
  } catch (error) {
    console.warn("[BaseSkillList] MathJax 载入失败", error);
  }
}
