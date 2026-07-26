import { createSSRApp, type Component } from "vue";

import { setup } from "@css-render/vue3-ssr";
import { renderToString } from "vue/server-renderer";

import CVList from "@/widgets/CVList/index.vue";
import EnemiesListV2 from "@/widgets/EnemiesListV2/index.vue";
import EquipList from "@/widgets/EquipList/index.vue";
import {
  GachaRuleType,
  type GachaPoolClientData as GachaClientPool,
} from "@/widgets/GachaSimulatorV2/gamedata-types";
import GachaSimulatorV2 from "@/widgets/GachaSimulatorV2/index.vue";
import type { GachaPoolClientData as GachaServerPool } from "@/widgets/GachaSimulatorV2/types";
import HrCalculator from "@/widgets/HrCalculator/index.vue";
import MedalList from "@/widgets/MedalList/MedalList.vue";
import MemoryList from "@/widgets/MemoryList/index.vue";

interface ShellEntry {
  component: Component;
  props?: Record<string, unknown>;
  /** 构建产物模板里挂载容器的 id，默认 root */
  container?: string;
}

// 让 GachaExecutor 以常驻池初始状态完成构造，仅用于外壳预渲染
const emptyGachaServerPool = {
  gachaPoolDetail: {
    detailInfo: {
      availCharInfo: { perAvailList: [] },
      upCharInfo: { perCharList: [] },
      weightUpCharInfoList: null,
    },
  },
} as unknown as GachaServerPool;

const emptyGachaClientPool = {
  gachaRuleType: GachaRuleType.NORMAL,
  guarantee5Avail: 1,
  guarantee5Count: 10,
} as unknown as GachaClientPool;

export const shells: Record<string, ShellEntry> = {
  CVList: { component: CVList },
  EnemiesListV2: { component: EnemiesListV2 },
  EquipList: { component: EquipList },
  HrCalculator: { component: HrCalculator },
  MedalList: { component: MedalList },
  MemoryList: { component: MemoryList },
  GachaSimulatorV2: {
    component: GachaSimulatorV2,
    props: {
      gachaPoolId: "",
      gachaBannerFile: "",
      gachaClientPool: emptyGachaClientPool,
      gachaServerPool: emptyGachaServerPool,
    },
  },
};

export interface RenderedShell {
  html: string;
  styles: string;
  container: string;
}

export async function renderShell(name: string): Promise<RenderedShell | null> {
  const entry = shells[name];
  if (!entry) return null;

  const app = createSSRApp(entry.component, entry.props);
  const { collect } = setup(app);
  const html = await renderToString(app);

  return { html, styles: collect(), container: entry.container ?? "root" };
}
