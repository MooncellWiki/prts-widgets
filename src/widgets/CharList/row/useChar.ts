import { computed, type Ref } from "vue";

import type { Char } from "../utils";
export function useChar(
  char: Char,
  addTrust: Ref<boolean>,
  addPotential: Ref<boolean>,
) {
  const hp = computed(() => {
    let result = char.hp;
    if (addTrust.value) result += char.trust[0];

    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "hp") result += v.value;
      }
    }
    return result;
  });
  const atk = computed(() => {
    let result = char.atk;
    if (addTrust.value) result += char.trust[1];

    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "atk") result += v.value;
      }
    }
    return result;
  });
  const def = computed(() => {
    let result = char.def;
    if (addTrust.value) result += char.trust[2];

    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "def") result += v.value;
      }
    }
    return result;
  });
  const res = computed(() => {
    let result = char.res;
    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "res") result += v.value;
      }
    }
    return result;
  });
  const cost = computed(() => {
    let result = char.cost;
    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "cost") result += v.value;
      }
    }
    return result;
  });
  const reDeploy = computed(() => {
    let result = Number.parseInt(char.reDeploy.slice(0, -1));
    if (addPotential.value) {
      for (const v of char.potential) {
        if (v.type === "re_deploy") result += v.value;
      }
    }
    return `${result}s`;
  });
  return {
    hp,
    atk,
    def,
    res,
    reDeploy,
    cost,
  };
}
