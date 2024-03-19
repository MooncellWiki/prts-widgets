import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import CVList from "@/widgets/CVList/index.vue";
import { CharWordTable, CVConfig, getCVConfig } from "@/widgets/CVList/types";

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

const initCharWord = async (conf: CVConfig) => {
  const response = await fetch(
    new URL("/gamedata/latest/excel/charword_table.json", TORAPPU_ENDPOINT),
  );
  const table: CharWordTable = await response.json();
  const langTypes = table.voiceLangTypeDict;
  const data = Object.fromEntries(
    Object.keys(langTypes).map((langType) => [
      langType,
      {} as Record<string, Set<Array<string>>>,
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
        const curLangType = charVoice.voiceLangType;
        if (!data[curLangType][name]) {
          data[curLangType][name] = new Set<Array<string>>();
        }
        data[curLangType][name].add([
          charId,
          wordkey == charId ||
          conf.customLangList.includes(curLangType.toString())
            ? ""
            : wordkey,
          "",
        ]);
        if (curLangType.toString() == "LINKAGE" && name != "-") {
          const realLangTypeStr = conf.linkageRedirect[charId];
          if (!data[realLangTypeStr][name]) {
            data[realLangTypeStr][name] = new Set();
          }
          data[realLangTypeStr][name].add([
            charId,
            wordkey == charId || conf.customLangList.includes(realLangTypeStr)
              ? ""
              : wordkey,
            "",
          ]);
        }
        if (conf.linkageRedirectRev.includes(charId)) {
          const realLangTypeStr = "LINKAGE";
          if (!data[realLangTypeStr][name]) {
            data[realLangTypeStr][name] = new Set();
          }
          data[realLangTypeStr][name].add([
            charId,
            wordkey == charId || conf.customLangList.includes(realLangTypeStr)
              ? ""
              : wordkey,
            curLangType.toString(),
          ]);
        }
      }
    }
  }

  return { data, langTypes };
};

const conf = await getCVConfig();

Promise.all([initCharWord(conf), initCharMap()]).then((retvals) => {
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
