import { createSSRApp, type Component } from "vue";

import { setup } from "@css-render/vue3-ssr";
import { renderToString } from "vue/server-renderer";

import { createStores } from "@/utils/pinia";
import BaseSkillList from "@/widgets/BaseSkillList/index.vue";
import CVList from "@/widgets/CVList/index.vue";
import EnemiesListV2 from "@/widgets/EnemiesListV2/index.vue";
import EquipList from "@/widgets/EquipList/index.vue";
import GachaSimulatorV2 from "@/widgets/GachaSimulatorV2/index.vue";
import HrCalculator from "@/widgets/HrCalculator/index.vue";
import MedalList from "@/widgets/MedalList/MedalList.vue";
import MemoryList from "@/widgets/MemoryList/index.vue";

interface ShellEntry {
  component: Component;
  props?: Record<string, unknown>;
  /** 构建产物模板里挂载容器的 id，默认 root */
  container?: string;
}

export const shells: Record<string, ShellEntry> = {
  BaseSkillList: { component: BaseSkillList, container: "base-skill-list" },
  CVList: { component: CVList },
  EnemiesListV2: { component: EnemiesListV2 },
  EquipList: { component: EquipList },
  HrCalculator: { component: HrCalculator },
  MedalList: { component: MedalList },
  MemoryList: { component: MemoryList },
  // 卡池数据没到时，组件自己用常驻池的初始状态画出模拟器（见 GachaSimulatorV2/data.ts 的 EMPTY_POOLS）
  GachaSimulatorV2: {
    component: GachaSimulatorV2,
    props: { gachaPoolId: "", gachaBannerFile: "" },
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

  // 有的外壳用 pinia / Pinia Colada。预渲染时不取数（enabled: false），查询停在 pending，外壳里是加载中的样子；
  // 组件里自己写了 enabled 的查询会盖掉这一条，预渲染的组件里别写
  const app = createSSRApp(entry.component, entry.props).use(
    createStores({ queryOptions: { enabled: false } }),
  );
  const { collect } = setup(app);
  const html = await renderToString(app);

  return { html, styles: collect(), container: entry.container ?? "root" };
}
