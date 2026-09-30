import { createApp } from "vue";

import VoiceTable from "../widgets/VoiceTable/VoiceTable.vue";
import { readCvNames } from "../widgets/VoiceTable/voice";

import type {
  OverrideVoiceBaseItem,
  VoiceBaseItem,
  VoiceDataItem,
} from "../widgets/VoiceTable/types";

const ele = document.querySelector("#voice-table-root");
const dataRoot = document.querySelector<HTMLElement>("#voice-data-root");
const dataEle = dataRoot?.getElementsByClassName(
  "voice-data-item",
) as HTMLCollectionOf<HTMLElement>;

const langSet = new Set<string>();
const voiceBase: VoiceBaseItem[] =
  dataRoot?.dataset?.voiceBase?.split(",").map((kvp) => {
    const [lang, path] = kvp.split(":");
    return {
      lang,
      path,
    };
  }) || [];
// 模板参数没填时这里是字面量 "{{{覆盖路径}}}"，拆不出三段，丢掉
const overrideVoiceBase: OverrideVoiceBaseItem[] = (
  dataRoot?.dataset?.overrideVoiceBase?.split(",") ?? []
)
  .map((kvp) => {
    const [lang, mode, path] = kvp.split(":");
    return {
      lang,
      mode: Number(mode),
      path,
    };
  })
  .filter((item) => item.lang && item.path && !Number.isNaN(item.mode));

const dataDomList = Array.from(dataEle);
const voiceData: VoiceDataItem[] = [];

const parseDirectLinks = (directLinks?: string) => {
  const splitted = directLinks?.split(",");
  const langToLink: Record<string, string> = {};
  if (!splitted) return langToLink;

  for (const directLink of splitted) {
    const i = directLink.indexOf(":");
    const [lang, link] = [directLink.slice(0, i), directLink.slice(i + 1)];
    langToLink[lang] = link;
  }

  return langToLink;
};

const parseDetail = (children: HTMLCollection) => {
  const detail: Record<string, string> = {};
  const childrenArray = Array.from(children) as Array<HTMLElement>;
  for (const child of childrenArray) {
    if (child.dataset?.kindName === undefined) {
      continue;
    }

    detail[child.dataset.kindName || ""] = child.innerHTML;
    langSet.add(child.dataset.kindName || "");
  }

  return detail;
};

for (const dom of dataDomList) {
  if (!dom.dataset) continue;
  const title = dom.dataset.title;
  const index = dom.dataset.voiceIndex;
  const fileName = dom.dataset.voiceFilename?.toLowerCase();
  const directLinks = parseDirectLinks(dom.dataset.directLinks);
  const cond = dom.dataset?.cond;
  const detail = parseDetail(dom.children);
  const placeType = dom.dataset?.placeType;

  voiceData.push({
    title,
    index,
    fileName,
    directLinks,
    cond,
    detail,
    placeType,
  });
}

const langArr = Array.from(langSet);

// 挂到window上面给上面的charInfo用
window.charVoice = voiceData;
if (import.meta.env.DEV)
  console.log(
    "[VoiceTable] init data:",
    dataRoot,
    voiceData,
    voiceBase,
    langSet,
    overrideVoiceBase,
  );

// 干员页嵌入（{{:xx/语音记录}}）时默认折叠；独立的 /语音记录 页展开
const collapsible = !document.title.includes("/语音记录");

/**
 * 样式来自皮肤：Arknights 皮肤已加载全套，这两个模块是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components）与官网字体
 * （skins.arknights.fonts：芯片 / 编号用的 Bender、Novecento），挂载前等它们就位。
 *
 * 走 RLQ 而不是直接调 mw.loader.using：using 定义在 mediawiki.base 里，那是 startup
 * 之后才异步插入的脚本，本模块（defer）经常比它先跑，直接探测会拿到 undefined 而
 * 静默跳过等待。RLQ 由 startup 在 mediawiki.base 就绪后排空，数组形式还会先 using
 * 指定模块再回调。
 */
const STYLE_MODULES = ["skins.arknights.components", "skins.arknights.fonts"];
function mount(root: Element) {
  (window.RLQ = window.RLQ || []).push([
    STYLE_MODULES,
    () => {
      createApp(VoiceTable, {
        tocTitle: dataRoot?.dataset?.tocTitle,
        voiceKey: dataRoot?.dataset?.voiceKey,
        voiceData,
        langArr,
        voiceBase,
        overrideVoiceBase,
        cvNames: readCvNames(window.char_info),
        collapsible,
      }).mount(root);
    },
  ]);
}

if (
  ele &&
  dataRoot?.dataset?.tocTitle &&
  dataRoot?.dataset?.voiceKey &&
  voiceData
) {
  mount(ele);
} else {
  console.error("voice-data or ele not found", ele);
}
