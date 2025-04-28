import "virtual:uno.css";
import { createApp } from "vue";

import SpineVue, { type Props } from "../widgets/Spine/Wrapper.vue";
import { Spine } from "../widgets/Spine/spine";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
window.SpineApi = Spine;
window.dispatchEvent(new Event("spine_api_ready"));

function main() {
  const ele = document.querySelector<HTMLElement>("#spine-root");
  let spineData: Props | null = null;
  if (!ele?.dataset.id) {
    spineData = JSON.parse(
      document.querySelector("#SPINEDATA")!.innerHTML,
    ) as Props;
    spineData.prefix = spineData.prefix.replace(
      "https://static.prts.wiki/spine/",
      "https://static.prts.wiki/spine38/",
    );
  }

  if (ele)
    createApp(SpineVue, { conf: spineData, id: ele?.dataset.id }).mount(ele);
  else console.error("SPINEDATA or ele not found", ele);
}

main();
