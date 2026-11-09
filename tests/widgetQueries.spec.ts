import { createApp, nextTick, type App, type Component } from "vue";

import { createPinia, disposePinia, type Pinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";

import { renderShell } from "../src/prerender";
import { createStores, pagePinia } from "../src/utils/pinia";
import NpcPortrait from "../src/widgets/NpcPortrait/index.vue";
import HighShop from "../src/widgets/Shop/HighShop.vue";
import SkinShop from "../src/widgets/Shop/SkinShop.vue";

import skinShopJson from "./fixtures/shop_skin.json";

/** 按 URL 里的片段回响应；没对上的请求直接失败，免得漏掉多发的请求 */
function stubFetch(routes: Record<string, () => Response>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = decodeURIComponent(
        input instanceof Request ? input.url : String(input),
      );
      calls.push(url);
      for (const [part, respond] of Object.entries(routes))
        if (url.includes(part)) return respond();
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return (part: string) => calls.filter((url) => url.includes(part)).length;
}

async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}

describe("小部件的 Pinia Colada 查询", () => {
  const apps: App[] = [];
  const pinias: Pinia[] = [];

  afterEach(() => {
    for (const app of apps.splice(0)) app.unmount();
    for (const pinia of pinias.splice(0)) disposePinia(pinia);
    vi.unstubAllGlobals();
  });

  /** 同一页上挂一份：每份一个 app，装同一个 pinia（同入口里的 pagePinia） */
  function mount(
    component: Component,
    props: Record<string, unknown>,
    pinia: Pinia,
  ) {
    const host = document.createElement("div");
    const app = createApp(component, props).use(createStores({ pinia }));
    app.mount(host);
    apps.push(app);
    return host;
  }

  function newPinia() {
    const pinia = createPinia();
    pinias.push(pinia);
    return pinia;
  }

  it("pagePinia 整页只有一个", () => {
    expect(pagePinia()).toBe(pagePinia());
  });

  it("一页上的两个时装商店共用 pinia：商店和时装回廊各只取一次", async () => {
    const count = stubFetch({
      "shop_skin.json": () => new Response(JSON.stringify(skinShopJson)),
      "模板:时装回廊": () => new Response(""),
    });
    const pinia = newPinia();
    const hosts = [mount(SkinShop, {}, pinia), mount(SkinShop, {}, pinia)];
    await settle();

    expect(count("shop_skin.json")).toBe(1);
    expect(count("模板:时装回廊")).toBe(1);
    for (const host of hosts) {
      expect(host.textContent).not.toContain("正在加载");
      expect(host.textContent).not.toContain("加载失败");
    }
  });

  it("时装商店取不到时给出原因", async () => {
    stubFetch({
      "shop_skin.json": () => new Response("", { status: 503 }),
      "模板:时装回廊": () => new Response(""),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const host = mount(SkinShop, {}, newPinia());
    await settle();
    expect(host.textContent).toContain(
      "时装商店数据加载失败：/shop_skin.json 请求失败：HTTP 503",
    );
  });

  it("商店数据结构不对（如维护时的 {}）也显示加载失败，不一直转圈", async () => {
    stubFetch({
      "shop_skin.json": () => new Response("{}"),
      "shop_high.json": () => new Response("{}"),
      "模板:时装回廊": () => new Response(""),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const pinia = newPinia();
    const skin = mount(SkinShop, {}, pinia);
    const high = mount(HighShop, {}, pinia);
    await settle();
    expect(skin.textContent).toContain("时装商店数据加载失败");
    expect(high.textContent).toContain("高级凭证区数据加载失败");
  });

  it("character.json 里的路径坏了时立绘显示加载失败", async () => {
    stubFetch({
      "character.json": () =>
        new Response(
          JSON.stringify({
            avg_npc_048: {
              pos: { x: 0, y: 150 },
              size: { x: 1196, y: 1196 },
              groups: [
                {
                  mode: "face_overlay",
                  base: "",
                  faceRect: { x: 0, y: 0, w: 1, h: 1 },
                },
              ],
              array: [
                {
                  name: "1$1",
                  alias: "",
                  group: 0,
                  face: "avg_npc_048/1$1",
                  body: 0,
                },
              ],
            },
          }),
        ),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const host = mount(NpcPortrait, { keys: "avg_npc_048" }, newPinia());
    await settle();
    expect(host.textContent).toContain("立绘加载失败");
  });

  it("剧情立绘：整页共用一份 character.json，一处重试，各处都跟着好", async () => {
    let fail = true;
    const count = stubFetch({
      "character.json": () =>
        fail
          ? new Response("", { status: 500 })
          : new Response(
              // 结构同 npcPortrait.spec.ts 的 single()
              JSON.stringify({
                avg_npc_048: {
                  pos: { x: 0, y: 180 },
                  size: { x: 1024, y: 1024 },
                  groups: [],
                  array: [
                    {
                      name: "avg_npc_048",
                      alias: "",
                      group: -1,
                      image: "avg_npc_048/avg_npc_048",
                      body: 0,
                    },
                  ],
                },
              }),
            ),
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pinia = newPinia();
    const hosts = [
      mount(NpcPortrait, { keys: "avg_npc_048" }, pinia),
      mount(NpcPortrait, { keys: "avg_npc_048" }, pinia),
    ];
    await settle();
    expect(count("character.json")).toBe(1);
    for (const host of hosts)
      expect(host.textContent).toContain("立绘加载失败");

    fail = false;
    hosts[0].querySelector<HTMLButtonElement>("button")!.click();
    await settle();
    expect(count("character.json")).toBe(2);
    for (const host of hosts) {
      expect(host.textContent).not.toContain("立绘加载失败");
      expect(host.querySelector("img")).not.toBeNull();
    }
  });

  it("只有手写文件的立绘不取 character.json", async () => {
    const count = stubFetch({});
    const host = mount(
      NpcPortrait,
      { keys: "", files: "Npc doctor.png" },
      newPinia(),
    );
    await settle();
    expect(count("")).toBe(0);
    expect(host.querySelector("img")?.getAttribute("src")).toBe(
      "https://media.prts.wiki/a/aa/Npc_doctor.png",
    );
  });

  it("外壳预渲染不取数，停在加载中", async () => {
    const count = stubFetch({});
    const shell = await renderShell("CVList");
    expect(count("")).toBe(0);
    expect(shell?.html).toContain("n-skeleton");
    expect(shell?.html).not.toContain("加载失败");
  });
});
