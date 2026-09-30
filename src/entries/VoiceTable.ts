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
 * 样式来自皮肤：Arknights 皮肤已加载全套，这一行是空操作；Vector / Minerva 上
 * 动态加载令牌 + 作用域 + 组件（skins.arknights.components），挂载前等它就位。
 * 加载失败或超时都照常挂载（无样式总比空白强），只在控制台留一条。
 */
const STYLE_TIMEOUT = 8000;
async function mount(root: Element) {
  try {
    await Promise.race([
      window.mw?.loader?.using?.(["skins.arknights.components"]),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), STYLE_TIMEOUT),
      ),
    ]);
  } catch (error) {
    console.warn("[VoiceTable] 设计系统样式未就位，先行挂载", error);
  }

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
