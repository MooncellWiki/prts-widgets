import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import CVList from "@/widgets/CVList/index.vue";
import { CharWordTable } from "@/widgets/CVList/types";

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

const initCharWord = async () => {
  const response = await fetch(
    new URL("/gamedata/latest/excel/charword_table.json", TORAPPU_ENDPOINT),
  );
  const table: CharWordTable = await response.json();
  const voiceLangTypeDict = table.voiceLangTypeDict;
  const data = Object.fromEntries(
    Object.keys(table.voiceLangTypeDict).map((voiceLangType) => [
      voiceLangType,
      {} as Record<string, string[]>,
    ]),
  );

  for (const voiceLang of Object.values(table.voiceLangDict)) {
    const { charId, dict } = voiceLang;
    for (const charVoice of Object.values(dict)) {
      const cvName = charVoice.cvName;
      for (const name of cvName) {
        if (!data[charVoice.voiceLangType][name]) {
          data[charVoice.voiceLangType][name] = [];
        }
        data[charVoice.voiceLangType][name].push(charId);
      }
    }
  }

  return { data, voiceLangTypeDict };
};

Promise.all([initCharWord(), initCharMap()]).then((retvals) => {
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
