import "virtual:uno.css";
import { createApp } from "vue";

import { STATIC_ENDPOINT } from "@/utils/consts";

import PenguinWidget from "../widgets/PenguinWidget.vue";

const ele = document.querySelector<HTMLElement>("#penguin-widget");
const type = ele?.dataset.type;
const id = ele?.dataset.id;
const isAct = !!Number.parseInt(ele?.dataset.isAct || "0");
const language = navigator.language.split("-")[0];

if (ele) {
  fetch(new URL("/skland/display_config_v3.json", STATIC_ENDPOINT))
    .then((response) => {
      if (!response.ok)
        throw new Error("[PenguinWidget] Received non-200 response");

      return response.json();
    })
    .then(
      (data) =>
        !navigator.userAgent.includes(data.userAgent) &&
        createApp(PenguinWidget, { type, id, isAct, language }).mount(ele),
    )
    .catch((error) => console.error(error));
}
