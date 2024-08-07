import { STATIC_ENDPOINT, TORAPPU_ENDPOINT } from "@/utils/consts";

import type { Char } from "./types";

export function charAvatar(skinId: string) {
  if (skinId.includes("@")) {
    skinId = skinId.replaceAll("@", "_");
    skinId = encodeURIComponent(skinId);
  } else {
    skinId = skinId.replaceAll("#", "_");
  }
  return `${TORAPPU_ENDPOINT}/assets/char_avatar/${skinId}.png`;
}

export function docAvatar(id: string) {
  return `${TORAPPU_ENDPOINT}/assets/player_avatar/${id}.png`;
}

export function portrait(skinId: string) {
  skinId = skinId.toLowerCase();
  if (skinId.includes("@")) {
    skinId = skinId.replaceAll("@", "_");
    skinId = encodeURIComponent(skinId);
  } else {
    skinId = skinId.replaceAll("#", "_");
  }
  return `${TORAPPU_ENDPOINT}/assets/char_portrait/${skinId}.png`;
}

export function potential(rank: number) {
  return `${TORAPPU_ENDPOINT}/assets/potential_icon/potential_${rank}.png`;
}

export function elite(rank: number) {
  return `${TORAPPU_ENDPOINT}/assets/elite_icon/elite_${rank}_large.png`;
}

export function profession(pro: string) {
  pro = pro.toLowerCase();
  return `${TORAPPU_ENDPOINT}/assets/profession_large_icon/icon_profession_${pro}_large.png`;
}

export function starYellow(rarity: number) {
  return `${TORAPPU_ENDPOINT}/assets/rarity_icon/rarity_yellow_${rarity}.png`;
}

export function starWhite(rarity: number) {
  return `${TORAPPU_ENDPOINT}/assets/rarity_icon/rarity_${rarity}.png`;
}

export function skill(skillId: string) {
  if (skillId) {
    //森空岛强力击系列技能有错误，特判
    const arr1 = ["skchr_stward_1"];
    const arr2 = [
      "skchr_savage_1",
      "skchr_doberm_1",
      "skchr_bryota_1",
      "skchr_jesica_1",
      "skchr_caper_1",
    ];
    const arr3 = ["skchr_lessng_1", "skchr_huang_1", "skchr_svrash_1"];
    if (arr1.includes(skillId)) {
      skillId = "skcom_powerstrike[1]";
    } else if (arr2.includes(skillId)) {
      skillId = "skcom_powerstrike[2]";
    } else if (arr3.includes(skillId)) {
      skillId = "skcom_powerstrike[3]";
    }
    switch (skillId) {
      case "skchr_vigna_1": {
        skillId = "skcom_atk_up[2]";

        break;
      }
      case "skchr_midn_1": {
        skillId = "skcom_enchant[1]";

        break;
      }
      case "skchr_catap_1": {
        skillId = "skcom_blowrange_up[1]";

        break;
      }
      // No default
    }
    return `${TORAPPU_ENDPOINT}/assets/skill_icon/skill_icon_${skillId}.png`;
  } else {
    return `${STATIC_ENDPOINT}/charinfo/img/skland/skill_icon_none.png`;
  }
}

export function specialized(skills: Char["skills"], skillId: string) {
  const index = skills.findIndex((e) => e.id === skillId);
  const sp = skills[index].specializeLevel;
  return `${TORAPPU_ENDPOINT}/assets/specialized_icon/specialized_tiny_${sp}.png`;
}

export function equip(eq: string) {
  return `${TORAPPU_ENDPOINT}/assets/uniequip_direction/${eq}.png`;
}

export const ServerAvatar: Record<string, string> = {
  1: "yj",
  2: "bili",
};

export function server(id: string) {
  return `${STATIC_ENDPOINT}/charinfo/img/skland/${ServerAvatar[id] || "yj"}.png`;
}
