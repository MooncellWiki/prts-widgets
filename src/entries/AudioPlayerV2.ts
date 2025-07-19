import { createApp } from "vue";

import "virtual:uno.css";
import AudioPlayerV2 from "../widgets/AudioPlayerV2/index.vue";

const players: NodeListOf<HTMLElement> =
  document.querySelectorAll("div.audio-player");

for (const element of Array.from(players)) {
  const props = {
    name: element.dataset?.name || "",
    lowSource: element.dataset?.low || "",
    highSource: element.dataset?.high || "",
    title: element.innerHTML,
    p: Number.parseFloat(element.dataset?.p || "0"),
  };

  createApp(AudioPlayerV2, props).mount(element);
}
