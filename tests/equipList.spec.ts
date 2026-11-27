import { createApp, nextTick, type App } from "vue";

import { createPinia, disposePinia, type Pinia } from "pinia";
import { afterEach, describe, expect, it } from "vitest";

import SubContainer from "../src/widgets/EquipList/components/SubContainer.vue";
import { useEquipListStore } from "../src/widgets/EquipList/store";
import { parseMaterials } from "../src/widgets/EquipList/utils";

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

describe("材料解析", () => {
  it("拆出道具名、图片、链接和数量", () => {
    const html =
      '<div class="prts-item-icon">[[文件:道具 带框 模组数据块.png|50px|link=模组数据块]]<span class="prts-item-quantity-label">1</span></div>' +
      '<div class="prts-item-icon">[[文件:道具 带框 龙门币.png|50px|link=龙门币]]<span class="prts-item-quantity-label">2万</span></div>';

    expect(parseMaterials(html)).toEqual([
      {
        name: "模组数据块",
        src: expect.stringContaining("道具_带框_模组数据块.png"),
        href: "/w/模组数据块",
        count: "1",
      },
      {
        name: "龙门币",
        src: expect.stringContaining("道具_带框_龙门币.png"),
        href: "/w/龙门币",
        count: "2万",
      },
    ]);
  });
});

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
    host.querySelectorAll<HTMLElement>(".sub-avatar__pic");

  it("点头像展开这名干员的全部模组，再点收起", async () => {
    const { host, store } = mount([
      char("干员甲", ["模组A", "模组B"]),
      char("干员乙", ["模组C"]),
    ]);

    // PRTS 面板外壳：标题、分支名、本组人数
    expect(host.querySelector(".ak-panel")).toBeInstanceOf(HTMLElement);
    expect(host.querySelector(".el-sub__title")?.textContent).toBe("尖兵");

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

    host.querySelector<HTMLElement>(".el-sub__expand")!.click();
    await nextTick();
    expect([...store.shown]).toEqual(["模组A", "模组C"]);
    expect(host.querySelectorAll(".modbody")).toHaveLength(2);

    host.querySelector<HTMLElement>(".el-sub__collapse")!.click();
    await nextTick();
    expect(store.shown.size).toBe(0);
  });
});
