/* eslint-disable vue/one-component-per-file */
import "virtual:uno.css";
import { createApp } from "vue";

import Voice from "../widgets/VoiceTable/VoiceTable.vue";
import VoiceMobile from "../widgets/VoiceTable/VoiceTableMobile.vue";

const ele = document.querySelector("#voice-table-root");
const dataRoot = document.querySelector<HTMLElement>("#voice-data-root");
const dataEle = dataRoot?.getElementsByClassName(
  "voice-data-item",
) as HTMLCollectionOf<HTMLElement>;

const langSet = new Set<string>();
const voiceBase =
  dataRoot?.dataset?.voiceBase?.split(",").map((kvp) => {
    const [lang, path] = kvp.split(":");
    return {
      lang,
      path,
    };
  }) || [];

const dataDomList = Array.from(dataEle);
const voiceData = [];

const parseDirectLinks = (directLinks: string | undefined) => {
  const splitted = directLinks?.split(",");
  const langToLink: Record<string, string> = {};
  if (!directLinks || !splitted) return langToLink;

  for (const directLink of splitted) {
    const [lang, link] = directLink.split(":");
    langToLink[lang] = link;
  }

  return langToLink;
};

const parseDetail = (children: HTMLCollection) => {
  const detail: Record<string, string> = {};
  const childrenArray = Array.from(children) as Array<HTMLElement>;
  for (const child of childrenArray) {
    if (child.dataset?.kindName !== undefined) {
      detail[child.dataset.kindName || ""] = child.innerHTML;
      langSet.add(child.dataset.kindName || "");
    }
  }

  return detail;
};

for (const dom of dataDomList) {
  const title = dom.dataset?.title;
  const index = dom.dataset?.voiceIndex;
  const fileName = dom.dataset?.voiceFilename?.toLowerCase();
  const directLinks = parseDirectLinks(dom.dataset?.directLinks);
  const cond = dom.dataset?.cond;
  const detail = parseDetail(dom.children);

  voiceData.push({
    title,
    index,
    fileName,
    directLinks,
    cond,
    detail,
  });
}

const langArr = Array.from(langSet);

// 挂到window上面给上面的charInfo用
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error;
window.charVoice = voiceData;
console.log(dataRoot, voiceData, voiceBase, langSet);

const isMobile = !!document
  .querySelectorAll("body")[0]
  .classList.contains("skin-minerva");
if (
  ele &&
  dataRoot?.dataset?.tocTitle &&
  dataRoot?.dataset?.voiceKey &&
  voiceData
) {
  if (isMobile) {
    createApp(VoiceMobile, {
      tocTitle: dataRoot?.dataset?.tocTitle,
      voiceKey: dataRoot?.dataset?.voiceKey,
      voiceData,
      langArr,
      voiceBase,
    }).mount(ele);
  } else {
    createApp(Voice, {
      tocTitle: dataRoot?.dataset?.tocTitle,
      voiceKey: dataRoot?.dataset?.voiceKey,
      voiceData,
      langArr,
      voiceBase,
    }).mount(ele);
  }
} else {
  console.error("voice-data or ele not found", ele);
}
