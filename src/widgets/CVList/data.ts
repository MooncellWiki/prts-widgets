import { TORAPPU_ENDPOINT } from "@/utils/consts";

import type { CharWordTable, SkinTable, VoiceLangTypeData } from "./types";

export interface CVListData {
  data: Record<string, Record<string, string[]>>;
  langTypes: VoiceLangTypeData;
  mapping: Record<string, string>;
  avatarMapping: Record<string, string>;
  charMapping: Record<string, string>;
}

async function initSkinTable() {
  const response = await fetch(
    new URL("/gamedata/latest/excel/skin_table.json", TORAPPU_ENDPOINT),
  );
  const table: SkinTable = await response.json();
  const avatarMapping: Record<string, string> = {};
  const charMapping: Record<string, string> = {};

  for (const skin of Object.values(table.charSkins)) {
    if (!skin.voiceId) {
      continue;
    }

    avatarMapping[skin.voiceId] = skin.avatarId;
    charMapping[skin.voiceId] = skin.charId;
  }

  const buildinPatchMap = table.buildinPatchMap;
  if (buildinPatchMap) {
    for (const charPatch of Object.values(buildinPatchMap)) {
      for (const [charPatchId, charSkinId] of Object.entries(charPatch)) {
        avatarMapping[charPatchId] = table.charSkins[charSkinId].avatarId;
      }
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

  const mapping: Record<string, string> = {};
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
  const collected: Record<
    string,
    Record<string, Set<string>>
  > = Object.fromEntries(
    Object.keys(langTypes).map((langType) => [langType, {}]),
  );

  for (const [charId, voiceLang] of Object.entries(table.voiceLangDict)) {
    const { dict } = voiceLang;
    for (const charVoice of Object.values(dict)) {
      const cvName = charVoice.cvName;
      for (const name of cvName) {
        if (!collected[charVoice.voiceLangType][name]) {
          collected[charVoice.voiceLangType][name] = new Set();
        }
        collected[charVoice.voiceLangType][name].add(charId);
      }
    }
  }

  const data: Record<string, Record<string, string[]>> = Object.fromEntries(
    Object.entries(collected).map(([langType, cvMap]) => [
      langType,
      Object.fromEntries(
        Object.entries(cvMap).map(([cvName, charIds]) => [
          cvName,
          Array.from(charIds),
        ]),
      ),
    ]),
  );

  return { data, langTypes };
}

export async function fetchCVListData(): Promise<CVListData> {
  const [charWord, charMap, skinTable] = await Promise.all([
    initCharWord(),
    initCharMap(),
    initSkinTable(),
  ]);

  return { ...charWord, ...charMap, ...skinTable };
}
