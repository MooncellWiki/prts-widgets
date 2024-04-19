import { TORAPPU_ENDPOINT } from "@/utils/consts";

import { RarityRank } from "./types";

export function getPortraitURL(charId: string) {
  return new URL(`/assets/char_portrait/${charId}_1.png`, TORAPPU_ENDPOINT);
}

export function rarityStringToNumber(rarityString: keyof typeof RarityRank) {
  return RarityRank[rarityString];
}
