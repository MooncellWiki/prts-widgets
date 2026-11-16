import "virtual:uno.css";
import { createApp } from "vue";

import { createStores } from "@/utils/pinia";
import GachaSimulator from "@/widgets/GachaSimulatorV2/index.vue";

// 卡池数据在组件里取（GachaSimulatorV2/data.ts），读取中 / 失败 / 重试也在组件里
const gachaDataRoot = document.querySelector<HTMLElement>("#gacha-data-root");
const ele = document.querySelector("#root");
if (ele)
  createApp(GachaSimulator, {
    gachaPoolId: gachaDataRoot?.dataset.gachaPoolId ?? "",
    gachaBannerFile:
      gachaDataRoot?.dataset.gachaBannerFile?.replace(/ /g, "_") ?? "",
  })
    .use(createStores())
    .mount(ele);
