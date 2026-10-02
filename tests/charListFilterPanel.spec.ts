import { createApp, h, nextTick, type App } from "vue";

import { AkToastProvider } from "@mooncellwiki/prts-design-vue";
import { createPinia, disposePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import ResultBar from "@/widgets/CharList/ResultBar.vue";
import FilterPanel from "@/widgets/CharList/filter/FilterPanel.vue";
import { useCharListStore } from "@/widgets/CharList/store";
import { Char } from "@/widgets/CharList/utils";

describe("固定职业 / 分支筛选面板", () => {
  let app: App;
  let host: HTMLDivElement;
  let pinia: ReturnType<typeof createPinia>;
  let store: ReturnType<typeof useCharListStore>;

  beforeEach(() => {
    history.replaceState(null, "", "/");
    localStorage.clear();
    pinia = createPinia();
    setActivePinia(pinia);
    store = useCharListStore();
    // 没有任何干员也应知道所有分支的归属。
    store.init([]);
    host = document.createElement("div");
    document.body.append(host);
    app = createApp({
      render: () =>
        h(AkToastProvider, null, {
          default: () => [h(FilterPanel, { narrow: false }), h(ResultBar)],
        }),
    });
    app.use(pinia);
    app.mount(host);
  });

  afterEach(async () => {
    app.unmount();
    disposePinia(pinia);
    host.remove();
    await nextTick();
    history.replaceState(null, "", "/");
    localStorage.clear();
  });

  function chip(label: string): HTMLButtonElement {
    const button = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".ak-chip"),
    ).find((el) => el.textContent?.trim() === label);
    if (!button) throw new Error(`找不到筛选项：${label}`);
    return button;
  }

  const groups = () =>
    Array.from(host.querySelectorAll(".ol-branch"), (el) =>
      el.getAttribute("aria-label"),
    );

  it("空数据时仍按职业展示分支，取消父职业会清除它的分支选择", async () => {
    expect(groups()).toEqual([]);
    chip("先锋").click();
    await nextTick();
    expect(groups()).toEqual(["先锋分支"]);
    expect(chip("策士").classList.contains("is-empty")).toBe(true);

    chip("策士").click();
    chip("近卫").click();
    await nextTick();
    expect(groups()).toEqual(["先锋分支", "近卫分支"]);
    expect(chip("策士").getAttribute("aria-pressed")).toBe("true");

    chip("先锋").click();
    await nextTick();
    expect(groups()).toEqual(["近卫分支"]);
    expect(
      Array.from(store.filterById.subProfession.selection.selected),
    ).toEqual([]);
    expect(
      new URLSearchParams(location.hash.slice(1)).get("subProfession"),
    ).toBeNull();
  });

  it("只有分支的旧链接可恢复、显示和取消，稀有度显示文字不泄漏到 URL", async () => {
    location.hash = new URLSearchParams({
      subProfession: "1-策士",
      rarity: "1-6",
    }).toString();
    store.syncFromHash();
    await nextTick();

    expect(store.filterById.profession.selection.selected.size).toBe(0);
    expect(chip("策士").closest(".ol-branch")?.getAttribute("aria-label")).toBe(
      "先锋分支",
    );
    expect(chip("策士").getAttribute("aria-pressed")).toBe("true");
    expect(host.querySelector(".ol-bar__active")?.textContent).toContain(
      "稀有度：★6",
    );
    expect(new URLSearchParams(location.hash.slice(1)).get("rarity")).toBe(
      "1-6",
    );

    chip("策士").click();
    await nextTick();
    expect(groups()).toEqual([]);
    expect(
      new URLSearchParams(location.hash.slice(1)).get("subProfession"),
    ).toBeNull();
  });

  it("干员数据不能改变分支归属，重新初始化也不留下旧的选择状态", async () => {
    const row = document.createElement("div");
    Object.assign(row.dataset, {
      zh: "测试干员",
      profession: "近卫",
      subprofession: "策士",
      rarity: "5",
      cost: "10",
      block: "1",
    });
    const misfiled = new Char(row);
    store.init([misfiled]);
    chip("先锋").click();
    await nextTick();
    expect(chip("策士").closest(".ol-branch")?.getAttribute("aria-label")).toBe(
      "先锋分支",
    );

    // 只按分支筛时照干员自己的分支匹配
    chip("先锋").click();
    store.toggle(store.filterById.subProfession, "策士");
    await nextTick();
    expect(store.list).toEqual([misfiled]);

    // 选近卫：策士固定属于先锋，即使这位干员数据写的是近卫，也要清掉
    chip("近卫").click();
    await nextTick();
    expect(store.filterById.subProfession.selection.selected.size).toBe(0);
    expect(store.list).toEqual([misfiled]);

    history.replaceState(null, "", "/");
    store.init([]);
    await nextTick();
    expect(store.filterById.profession.selection.selected.size).toBe(0);
    expect(groups()).toEqual([]);
  });

  it("不认得的选项 id 不进选择", async () => {
    // 稀有度的 id 是数字，显示文字 ★6 不是 id
    store.toggle(store.filterById.rarity, "★6");
    await nextTick();
    expect(store.filterById.rarity.selection.selected.size).toBe(0);
    expect(location.hash).toBe("");
  });

  it("高级筛选计数、结果标签和清除共用同一份选择状态", async () => {
    store.toggle(store.filterById.tag, "输出");
    store.setAnd(store.filterById.tag, true);
    await nextTick();
    expect(host.querySelector(".ol-more")?.textContent).toContain("已选 1");
    expect(host.querySelector(".ol-bar__active")?.textContent).toContain(
      "词缀（同时）：输出",
    );
    expect(new URLSearchParams(location.hash.slice(1)).get("tag")).toBe(
      "0-输出",
    );

    store.reset();
    await nextTick();
    expect(host.querySelector(".ol-more")?.textContent).not.toContain("已选");
    expect(host.querySelector(".ol-bar__active")?.textContent?.trim()).toBe("");
    expect(location.hash).toBe("");
  });
});
