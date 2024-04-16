import "virtual:uno.css";
import { createApp } from "vue";

import { TORAPPU_ENDPOINT } from "@/utils/consts";
import CVList from "@/widgets/CVList/index.vue";
import type { CharWordTable, SkinTable } from "@/widgets/CVList/types";

async function initSkinTable() {
  const response = await fetch(
    new URL("/gamedata/latest/excel/skin_table.json", TORAPPU_ENDPOINT),
  );
  const table: SkinTable = await response.json();
  const avatarMapping: Record<string, string> = {};
  const charMapping: Record<string, string> = {};
  for (const skin of Object.values(table.charSkins)) {
    if (skin.voiceId) {
      avatarMapping[skin.voiceId] = skin.avatarId;
      charMapping[skin.voiceId] = skin.charId;
    }
  }

  return { charMapping, avatarMapping };
}

async function initCharMap() {
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

  const mapping: Record<string, string> = {
    char_1001_amiya2: "阿米娅(近卫)",
  };
  for (const query of cargoquery) {
    const { charId, pageName } = query.title;
    if (charId && pageName) {
      mapping[charId] = pageName;
    }
  }

  return { mapping };
}

async function initCharWord() {
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

  for (const [charId, voiceLang] of Object.entries(table.voiceLangDict)) {
    const { dict } = voiceLang;
    for (const charVoice of Object.values(dict)) {
      const cvName = charVoice.cvName;
      for (const name of cvName) {
        if (!data[charVoice.voiceLangType][name]) {
          data[charVoice.voiceLangType][name] = new Set();
        }
        data[charVoice.voiceLangType][name].add(charId);
      }
    }
  }

  return { data, langTypes };
}

const retvals = await Promise.all([
  initCharWord(),
  initCharMap(),
  initSkinTable(),
]);

const props = {};
for (const retval of retvals) {
  Object.assign(props, retval);
}

const ele = document.querySelector("#root");
if (ele) {
  const app = createApp(CVList, props);
  app.mount(ele);
}
