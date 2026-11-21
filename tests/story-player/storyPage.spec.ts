import { createApp, defineComponent, h, type App } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import StoryPage from "@/pages/StoryPlayer.vue";

vi.mock("@/widgets/StoryPlayer/index.vue", () => ({
  default: defineComponent({
    props: { script: String, autoStart: Boolean },
    setup: (props) => () =>
      h(
        "div",
        { class: "player-stub", "data-auto-start": props.autoStart },
        props.script,
      ),
  }),
}));
vi.mock("@/pages/StoryPlayerDebug.vue", () => ({
  __esModule: true,
  default: defineComponent({
    setup: () => () => h("div", { class: "debug-stub" }, "debug tools"),
  }),
}));

let app: App | undefined;
let host: HTMLElement;
function mount(query: string) {
  window.history.replaceState(null, "", `/pages/StoryPlayer.html${query}`);
  host = document.createElement("div");
  document.body.append(host);
  app = createApp(StoryPage);
  app.mount(host);
}

afterEach(() => {
  app?.unmount();
  host?.remove();
  vi.unstubAllGlobals();
  document.documentElement.className = "";
});

describe("unified story page", () => {
  it("shows loading, then mounts the shared player with autoStart", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("[name=博士]测试"));
    vi.stubGlobal("fetch", fetcher);
    mount("?path=test.txt");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "正在加载",
    );
    await vi.waitFor(() =>
      expect(host.querySelector(".player-stub")?.textContent).toBe(
        "[name=博士]测试",
      ),
    );
    expect(
      host.querySelector(".player-stub")?.getAttribute("data-auto-start"),
    ).toBe("true");
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      "https://torappu.prts.wiki/gamedata/latest/story/test.txt",
    );
  });

  it("renders request failures as text and offers a working example link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("<img src=x onerror=alert(1)>")),
    );
    mount("?path=test.txt");
    await vi.waitFor(() =>
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "<img src=x onerror=alert(1)>",
      ),
    );
    expect(host.querySelectorAll("img").length).toBe(0);
    expect(host.querySelector("a")?.getAttribute("href")).toBe(
      "?path=obt/main/level_main_00-01_beg.txt",
    );
  });

  it("shows a missing-parameter error instead of a blank page", async () => {
    mount("");
    await vi.waitFor(() =>
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "请在 URL 中提供",
      ),
    );
  });

  it("loads the debug shell without fetching or mounting a second player", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    mount("?debug&path=test.txt&line=9");
    await vi.waitFor(() =>
      expect(host.querySelector(".debug-stub")?.textContent).toBe(
        "debug tools",
      ),
    );
    expect(fetcher.mock.calls).toEqual([]);
    expect(host.querySelectorAll(".player-stub").length).toBe(0);
  });
});
