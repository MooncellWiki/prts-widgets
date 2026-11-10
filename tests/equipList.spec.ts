import { createApp, nextTick, type App } from "vue";

import { createPinia, disposePinia, type Pinia } from "pinia";
import { afterEach, describe, expect, it } from "vitest";

import SubContainer from "../src/widgets/EquipList/components/SubContainer.vue";
import { useEquipListStore } from "../src/widgets/EquipList/store";

import type { CharEquips } from "../src/widgets/EquipList/types";

function char(name: string, equips: string[]): CharEquips {
  return {
    char: {
      name,
      nameEN: name,
      nameJP: name,
      type: "先锋",
      subtype: "尖兵",
      rarity: "5",
      id: 1,
    },
    equips: equips.map((equip) => ({ name: equip, type: `${name}-X` })),
  };
}

describe("模组一览：展开 / 收起", () => {
  let app: App | undefined;
  let pinia: Pinia | undefined;

  afterEach(() => {
    app?.unmount();
    if (pinia) disposePinia(pinia);
    app = undefined;
    pinia = undefined;
  });

  function mount(chars: CharEquips[]) {
    pinia = createPinia();
    const host = document.createElement("div");
    app = createApp(SubContainer, { title: "尖兵", chars }).use(pinia);
    app.mount(host);
    return { host, store: useEquipListStore(pinia) };
  }

  const avatars = (host: HTMLElement) =>
    host.querySelectorAll<HTMLElement>(".h-\\[60px\\].cursor-pointer");

  it("点头像展开这名干员的全部模组，再点收起", async () => {
    const { host, store } = mount([
      char("干员甲", ["模组A", "模组B"]),
      char("干员乙", ["模组C"]),
    ]);

    avatars(host)[0].click();
    await nextTick();
    expect([...store.shown]).toEqual(["模组A", "模组B"]);
    expect(host.querySelectorAll(".modbody")).toHaveLength(2);

    avatars(host)[0].click();
    await nextTick();
    expect(store.shown.size).toBe(0);
    expect(host.querySelectorAll(".modbody")).toHaveLength(0);
  });

  it("全部展开 / 全部收起", async () => {
    const { host, store } = mount([
      char("干员甲", ["模组A"]),
      char("干员乙", ["模组C"]),
    ]);

    host.querySelector<HTMLElement>(".mdi-arrow-expand")!.click();
    await nextTick();
    expect([...store.shown]).toEqual(["模组A", "模组C"]);
    expect(host.querySelectorAll(".modbody")).toHaveLength(2);

    host.querySelector<HTMLElement>(".mdi-arrow-collapse")!.click();
    await nextTick();
    expect(store.shown.size).toBe(0);
  });
});
