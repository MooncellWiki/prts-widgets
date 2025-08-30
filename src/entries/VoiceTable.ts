import "virtual:uno.css";
import { createApp } from "vue";

import { isMobileSkin } from "@/utils/utils";

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
const overrideVoiceBase =
  dataRoot?.dataset?.overrideVoiceBase?.split(",").map((kvp) => {
    const [lang, mode, path] = kvp.split(":");
    return {
      lang,
      mode: Number(mode),
      path,
    };
  }) || [];

const dataDomList = Array.from(dataEle);
const voiceData = [];

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
    if (child.dataset?.kindName !== undefined) {
      detail[child.dataset.kindName || ""] = child.innerHTML;
      langSet.add(child.dataset.kindName || "");
    }
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
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error;
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

const isMobile = isMobileSkin();
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
      overrideVoiceBase,
    }).mount(ele);
  } else {
    createApp(Voice, {
      tocTitle: dataRoot?.dataset?.tocTitle,
      voiceKey: dataRoot?.dataset?.voiceKey,
      voiceData,
      langArr,
      voiceBase,
      overrideVoiceBase,
    }).mount(ele);
  }
} else {
  console.error("voice-data or ele not found", ele);
}
