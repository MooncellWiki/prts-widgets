import "virtual:uno.css";
import { createApp } from "vue";

import type { Props } from "../widgets/Spine/Spine.vue";
import SpineVue from "../widgets/Spine/Wrapper.vue";
import { Spine } from "../widgets/Spine/spine";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
window.SpineApi = Spine;
window.dispatchEvent(new Event("spine_api_ready"));
async function main() {
  const ele = document.querySelector<HTMLElement>("#spine-root");
  let spineData: Props;
  if (ele?.dataset.id) {
    const resp = await fetch(
      `https://torappu.prts.wiki/assets/charSpine/${ele.dataset.id}/meta.json`,
    );
    spineData = await resp.json();
    //
  } else {
    spineData = JSON.parse(document.querySelector("#SPINEDATA")!.innerHTML);
    spineData.prefix = spineData.prefix.replace(
      "https://static.prts.wiki/spine/",
      "https://static.prts.wiki/spine38/",
    );
  }

  if (ele && spineData) createApp(SpineVue, { ...spineData }).mount(ele);
  else console.error("SPINEDATA or ele not found", ele);
}

main();
