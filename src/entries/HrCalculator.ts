import "virtual:uno.css";
import { createApp } from "vue";

import HrCalculator from "../widgets/HrCalculator/index.vue";
import type { Source } from "../widgets/HrCalculator/utils";
import { Char } from "../widgets/HrCalculator/utils";

const ele = document.querySelector("#root");

async function init() {
  const resp = await fetch(
    `/api.php?${new URLSearchParams({
      action: "cargoquery",
      format: "json",
      tables: "chara,char_obatin",
      limit: "5000",
      fields:
        "chara.profession,chara.position,chara.rarity,chara.tag,chara.cn,char_obatin.obtainMethod",
      where: 'char_obatin.obtainMethod like "%公开招募%" AND chara.charIndex>0',
      join_on: "chara._pageName=char_obatin._pageName",
    })}`,
  );
  const json = await resp.json();
  const source = json.cargoquery.map((obj: any) => {
    const v = obj.title;
    const temp: Source = {
      profession: v.profession!,
      position: v.position!,
      rarity: Number.parseInt(v.rarity!),
      tag: v.tag?.split(" ") || [],
      zh: v.cn!,
      subset: [],
      obtainMethod: v.obtainMethod?.split(" ") || [],
    };
    const char = Char.fromSource(temp);
    temp.subset = char.bitmap.getSubSet();
    return Object.freeze(temp);
  });
  console.log(source);
  if (ele) createApp(HrCalculator, { source }).mount(ele);
  else console.error("data-item or ele not found", ele);
}
init();
