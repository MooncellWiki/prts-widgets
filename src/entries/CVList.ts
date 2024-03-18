import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import CVList from "@/widgets/CVList/index.vue";
import { CharWordTable, getCVConfig } from "@/widgets/CVList/types";

const initCharMap = async () => {
  const response = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "chara",
      limit: "5000",
      fields: "charId, _pageName=pageName",
    })}`,
  );
  const json = await response.json();
  const cargoquery = json.cargoquery;

  const mapping: Record<string, string> = {};
  for (const query of cargoquery) {
    const { charId, pageName } = query.title;
    if (charId && pageName) {
      mapping[charId] = pageName;
    }
  }

  return { mapping };
};

const initCharWord = async (cvConfig) => {
  const response = await fetch(
    new URL("/gamedata/latest/excel/charword_table.json", TORAPPU_ENDPOINT),
  );
  const table: CharWordTable = await response.json();
  const langTypes = table.voiceLangTypeDict;
  const data = Object.fromEntries(
    Object.keys(langTypes).map((langType) => [
      langType,
      {} as Record<string, Set<string>>,
    ]),
  );

  for (const voiceLang of Object.values(table.voiceLangDict)) {
    const { charId, dict } = voiceLang;
    for (const charVoice of Object.values(dict)) {
      const wordkey = charVoice.wordkey;
      // skin pre process
      if (wordkey.includes("#") && wordkey.split("#")[0] == charId) continue;
      const cvName = charVoice.cvName;
      for (const name of cvName) {
        if (!data[charVoice.voiceLangType][name]) {
          data[charVoice.voiceLangType][name] = new Set();
        }
        data[charVoice.voiceLangType][name].add([
          charId,
          wordkey == charId ||
          cvConfig.customLangList.includes(charVoice.voiceLangType)
            ? ""
            : wordkey,
        ]);
        if (charVoice.voiceLangType == "LINKAGE" && name != "-") {
          const re = cvConfig.linkageRedirect[charId];
          if (!data[re][name]) {
            data[re][name] = new Set();
          }
          data[re][name].add([
            charId,
            wordkey == charId || cvConfig.customLangList.includes(re)
              ? ""
              : wordkey,
          ]);
        }
        if (cvConfig.linkageRedirectRev.includes(charId)) {
          const re = "LINKAGE";
          if (!data[re][name]) {
            data[re][name] = new Set();
          }
          data[re][name].add([
            charId,
            wordkey == charId || cvConfig.customLangList.includes(re)
              ? ""
              : wordkey,
            charVoice.voiceLangType,
          ]);
        }
      }
    }
  }

  return { data, langTypes };
};

const cvConfig = await getCVConfig();

Promise.all([initCharWord(cvConfig), initCharMap()]).then((retvals) => {
  const ele = document.querySelector("#root");
  const props = {};
  for (const retval of retvals) {
    Object.assign(props, retval);
  }
  if (ele) {
    const app = createApp(CVList, props);
    app.mount(ele);
  }
});
