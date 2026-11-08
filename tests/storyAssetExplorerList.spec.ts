import { createApp, effectScope, h, nextTick, type EffectScope } from "vue";

import { AkToastProvider } from "@mooncellwiki/prts-design-vue";
import { afterEach, describe, expect, it, vi } from "vitest";

import ResourceDetail from "../src/widgets/StoryAssetExplorer/components/ResourceDetail.vue";
import StoryAssetExplorer from "../src/widgets/StoryAssetExplorer/index.vue";
import {
  buildHash,
  createExplorer,
  explorerKey,
  readHash,
} from "../src/widgets/StoryAssetExplorer/store";
import {
  faceUsageCounts,
  groupUsages,
  highlightParts,
  normalizeResourceQuery,
  type Entry,
  type ExploreResponse,
  type UsageRow,
} from "../src/widgets/StoryAssetExplorer/utils";

describe("normalizeResourceQuery", () => {
  it("lowercases plain keywords", () => {
    expect(normalizeResourceQuery("  BG_Indoor ")).toBe("bg_indoor");
  });

  it("takes the name out of a pasted script command", () => {
    expect(
      normalizeResourceQuery(
        '[charslot(slot="m",name="avg_2026_yu_1#18$1",focus="m")]',
      ),
    ).toBe("avg_2026_yu_1#18$1");
    expect(normalizeResourceQuery('[Background(image="bg_corridor")]')).toBe(
      "bg_corridor",
    );
  });

  it("turns a wiki file name back into the resource name", () => {
    expect(normalizeResourceQuery("文件:Avg avg 2026 yu 1-1$1.png")).toBe(
      "avg_2026_yu_1#1$1",
    );
    expect(normalizeResourceQuery("File:Avg_bg_indoor_2.png")).toBe(
      "bg_indoor_2",
    );
  });
});

describe("highlightParts", () => {
  it("marks every case-insensitive hit", () => {
    expect(highlightParts("Avg_npc_009_npc", ["npc"])).toEqual([
      { text: "Avg_", hit: false },
      { text: "npc", hit: true },
      { text: "_009_", hit: false },
      { text: "npc", hit: true },
    ]);
    expect(highlightParts("abc", [])).toEqual([{ text: "abc", hit: false }]);
  });
});

describe("usage grouping", () => {
  const story = (group: string, type: string, page: string) => ({
    page,
    textPath: page,
    storyGroup: group,
    storyType: type,
  });
  const rows: UsageRow[] = [
    {
      scriptPath: "a/1",
      displayNames: [],
      faces: ["x#1$1", "x#2$1"],
      story: story("巴别塔", "支线", "BB-1"),
    },
    { scriptPath: "a/2", displayNames: [], faces: ["x#1$1"] },
    {
      scriptPath: "a/3",
      displayNames: [],
      story: story("相见欢", "支线", "OR-1"),
    },
    {
      scriptPath: "a/4",
      displayNames: [],
      story: story("巴别塔", "剧情", "BB-ST"),
    },
  ];

  it("groups by story group and puts orphans last", () => {
    const groups = groupUsages(rows);
    expect(groups.map((group) => group.key)).toEqual(["巴别塔", "相见欢", ""]);
    expect(groups[0].rows.map((row) => row.scriptPath)).toEqual(["a/1", "a/4"]);
    expect(groups[0].types).toEqual(["支线", "剧情"]);
  });

  it("counts scripts per expression", () => {
    expect(Object.fromEntries(faceUsageCounts(rows))).toEqual({
      "1$1": 2,
      "2$1": 1,
    });
  });
});

describe("share link hash", () => {
  it("round-trips the state", () => {
    const hash = buildHash({
      type: "character",
      q: "kalts",
      sort: { key: "count", dir: -1 },
      view: "wall",
      cat: "npc",
      merge: false,
      open: "avg_003_kalts_1$1",
      face: "5$1",
    });
    expect(readHash(`#${hash}`)).toEqual({
      type: "character",
      q: "kalts",
      sort: { key: "count", dir: -1 },
      view: "wall",
      cat: "npc",
      merge: false,
      open: "avg_003_kalts_1$1",
      face: "5$1",
    });
  });

  it("leaves defaults out and ignores junk", () => {
    expect(
      buildHash({
        type: "background",
        q: "",
        sort: { key: "id", dir: 1 },
        view: "card",
        cat: "npc",
        merge: false,
      }),
    ).toBe("type=background");
    expect(readHash("#type=nope&sort=foo&view=grid&cat=x")).toEqual({});
  });
});

describe("createExplorer server paging", () => {
  const scopes: EffectScope[] = [];
  const unmounts: (() => void)[] = [];
  const entry = (id: string): Entry => {
    const resource = {
      type: "character" as const,
      id,
      base: id,
      category: "npc" as const,
      scriptCount: 3,
    };
    return { resource, members: [resource], merged: 1, count: 3, face: null };
  };
  const first = entry("avg_npc_9");
  const second = entry("avg_npc_10");
  const third = entry("avg_npc_100");
  function response(overrides: Partial<ExploreResponse> = {}): ExploreResponse {
    return {
      entries: [first, second],
      selection: null,
      focusIndex: null,
      total: 3,
      matchedTotal: 3,
      page: 1,
      pageSize: 2,
      pageCount: 2,
      counts: { character: 3, background: 7, image: 2, item: 1 },
      categoryCounts: { npc: 3, operator: 0, other: 0 },
      updatedAt: "2026-11-07",
      ...overrides,
    };
  }
  function json(data: ExploreResponse) {
    return new Response(JSON.stringify(data));
  }
  function setup(
    handler: (url: URL, init?: RequestInit) => Promise<Response> = async () =>
      json(response()),
  ) {
    vi.useFakeTimers();
    vi.stubGlobal("Image", undefined);
    const browse = vi.fn((url: string, init?: RequestInit) =>
      handler(new URL(url), init),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) =>
        url.includes("/story-resources/explore?")
          ? browse(url, init)
          : Promise.resolve(
              new Response(
                url.includes("/story-resource-usages?")
                  ? '{"usages":[]}'
                  : "{}",
              ),
            ),
      ),
    );
    const scope = effectScope();
    scopes.push(scope);
    const store = scope.run(() => createExplorer({}))!;
    store.setStep(2);
    return { store, browse, scope };
  }
  afterEach(() => {
    unmounts.splice(0).forEach((unmount) => unmount());
    scopes.splice(0).forEach((scope) => scope.stop());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads one page with all facet counts, without downloading other types or following pages", async () => {
    const { store, browse } = setup();
    await store.start();
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(1);
    expect(store.pageList.value).toEqual([first, second]);
    expect(store.counts.value.background).toBe(7);
    expect(store.matchedTotal.value).toBe(3);
    expect(store.total.value).toBe(3);
    expect(store.pageCount.value).toBe(2);
  });

  it("sends filtering, grouping and sorting to the server in a single debounced request", async () => {
    const { store, browse } = setup();
    await store.start();
    store.state.cat = "npc";
    store.state.merge = false;
    store.setSortKey("count");
    store.state.q = "n";
    await vi.advanceTimersByTimeAsync(200);
    store.state.q = "npc";
    await vi.advanceTimersByTimeAsync(249);
    expect(browse).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(browse).toHaveBeenCalledTimes(2);
    const params = new URL(browse.mock.calls[1][0]).searchParams;
    expect(Object.fromEntries(params)).toMatchObject({
      type: "character",
      category: "npc",
      groupBy: "resource",
      sort: "scriptCount",
      order: "desc",
      q: "npc",
      page: "1",
    });
  });

  it("keeps the current page, pager and counts in place until the next page arrives", async () => {
    let finish!: (value: Response) => void;
    const { store } = setup((url) =>
      url.searchParams.get("page") === "2"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(json(response())),
    );
    await store.start();
    store.setPage(2);
    expect(store.status.value).toBe("loading");
    expect(store.page.value).toBe(2);
    expect(store.pageList.value).toEqual([first, second]);
    expect(store.pageCount.value).toBe(2);
    expect(store.matchedTotal.value).toBe(3);
    expect(store.categoryCounts.value.npc).toBe(3);
    finish(json(response({ entries: [third], page: 2 })));
    await vi.runAllTimersAsync();
    expect(store.status.value).toBe("done");
    expect(store.pageList.value).toEqual([third]);
  });

  it("keeps the results on screen while a search is debouncing", async () => {
    const { store, browse } = setup();
    await store.start();
    store.state.q = "n";
    expect(store.status.value).toBe("loading");
    expect(store.pageList.value).toEqual([first, second]);
    expect(browse).toHaveBeenCalledTimes(1);
  });

  it("keeps the loaded page next to the error when a request fails", async () => {
    let failed = true;
    const { store } = setup(async (url) => {
      if (url.searchParams.get("page") !== "2") return json(response());
      return failed
        ? new Response("", { status: 503 })
        : json(response({ entries: [third], page: 2 }));
    });
    await store.start();
    store.setPage(2);
    await vi.runAllTimersAsync();
    expect(store.status.value).toBe("error");
    expect(store.pageList.value).toEqual([first, second]);
    expect(store.total.value).toBe(3);
    failed = false;
    await store.reload();
    expect(store.pageList.value).toEqual([third]);
  });

  it("shows no count until the first response, then keeps it across tab switches", async () => {
    let finish!: (value: Response) => void;
    const { store } = setup((url) =>
      url.searchParams.get("type") === "background"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(json(response())),
    );
    expect(store.loaded.value).toBe(false);
    await store.start();
    expect(store.loaded.value).toBe(true);
    store.setType("background");
    await vi.advanceTimersByTimeAsync(0);
    expect(store.pageList.value).toEqual([]);
    expect(store.counts.value.character).toBe(3);
    expect(store.matchedTotal.value).toBe(7);
    expect(store.total.value).toBe(7);
    expect(store.pageCount.value).toBe(4);
    finish(json(response({ entries: [third], total: 7, matchedTotal: 7 })));
    await vi.runAllTimersAsync();
    expect(store.pageList.value).toEqual([third]);
  });

  it("does not request again when nothing the server sees has changed", async () => {
    const { store, browse } = setup();
    await store.start();
    store.state.q = "abc";
    await vi.advanceTimersByTimeAsync(250);
    expect(browse).toHaveBeenCalledTimes(2);
    store.state.q = "abc ";
    store.state.q = "  ABC";
    store.setSortKey("id");
    store.applyHash({ sort: { key: "id", dir: 1 } });
    store.setStep(2);
    store.setPage(1);
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(2);
    expect(store.status.value).toBe("done");
  });

  it("searches the normalized text and caps a long paste", async () => {
    const { store, browse } = setup();
    await store.start();
    store.state.q = '[charslot(slot="m",name="avg_2026_yu_1#18$1")]';
    await vi.advanceTimersByTimeAsync(250);
    expect(new URL(browse.mock.calls[1][0]).searchParams.get("q")).toBe(
      "avg_2026_yu_1#18$1",
    );
    store.state.q = "剧".repeat(5000);
    await vi.advanceTimersByTimeAsync(250);
    expect(new URL(browse.mock.calls[2][0]).searchParams.get("q")).toHaveLength(
      512,
    );
  });

  it("does not retry a failing character.json on every keystroke", async () => {
    vi.resetModules();
    const { createExplorer: createFresh } =
      await import("../src/widgets/StoryAssetExplorer/store");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    vi.stubGlobal("Image", undefined);
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/character.json")
        ? new Response("", { status: 503 })
        : json(response()),
    );
    vi.stubGlobal("fetch", fetchMock);
    const scope = effectScope();
    scopes.push(scope);
    const store = scope.run(() => createFresh({ type: "background" }))!;
    const requested = () =>
      fetchMock.mock.calls.filter(([url]) => url.endsWith("/character.json"))
        .length;
    await store.start();
    expect(requested()).toBe(0);
    store.setType("character");
    await nextTick();
    await vi.runAllTimersAsync();
    expect(requested()).toBe(1);
    expect(store.linksError.value).toBe(true);
    for (const q of ["a", "ab", "abc"]) {
      store.state.q = q;
      await vi.advanceTimersByTimeAsync(250);
    }
    store.setPage(2);
    await vi.runAllTimersAsync();
    expect(requested()).toBe(1);
    expect(store.linksError.value).toBe(true);
  });

  it("uses server union counts and group members without recomputing max or sorting", async () => {
    const merged = {
      ...first,
      members: [first.resource, second.resource],
      merged: 2,
      count: 5,
    };
    const { store, browse } = setup(async () =>
      json(response({ entries: [third, merged] })),
    );
    await store.start();
    expect(store.pageList.value.map((item) => item.resource.id)).toEqual([
      third.resource.id,
      first.resource.id,
    ]);
    expect(store.pageList.value[1].count).toBe(5);
    store.open(second.resource.id);
    expect(store.find(second.resource.id)).toEqual(second.resource);
    expect(store.detailIndex.value).toBe(1);
    expect(browse).toHaveBeenCalledTimes(1);
  });

  it("locates an unmerged sibling on another page even when its resource is cached", async () => {
    const sibling = {
      ...third,
      resource: { ...third.resource, base: second.resource.base },
    };
    const members = [second.resource, sibling.resource];
    const current = { ...second, members };
    const target = { ...sibling, members };
    const { store, browse } = setup(async (url) =>
      json(
        url.searchParams.get("focus") === target.resource.id
          ? response({
              entries: [target],
              page: 2,
              selection: target,
              focusIndex: 2,
            })
          : response({ entries: [first, current] }),
      ),
    );
    store.state.merge = false;
    await store.start();
    store.open(current.resource.id);
    expect(store.find(target.resource.id)).toEqual(target.resource);
    store.open(target.resource.id);
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(2);
    expect(new URL(browse.mock.calls[1][0]).searchParams.get("focus")).toBe(
      target.resource.id,
    );
    expect(store.page.value).toBe(2);
    expect(store.detailIndex.value).toBe(2);
    await store.move(-1);
    expect(store.detail.id).toBe(current.resource.id);
    expect(store.page.value).toBe(1);
    expect(store.detailIndex.value).toBe(1);
  });

  it("opens shared resources on the correct page without a second startup request", async () => {
    const { store, browse } = setup(async () =>
      json(
        response({
          entries: [third],
          page: 2,
          selection: third,
          focusIndex: 2,
        }),
      ),
    );
    store.applyHash({ open: third.resource.id, face: "1$1" });
    await store.start();
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(1);
    expect(new URL(browse.mock.calls[0][0]).searchParams.get("focus")).toBe(
      third.resource.id,
    );
    expect(store.page.value).toBe(2);
    expect(store.find(third.resource.id)).toEqual(third.resource);
    expect(store.detailIndex.value).toBe(2);
    expect(store.detail.face).toBe("1$1");
  });

  it("keeps an explicitly shared detail even when it does not match the search", async () => {
    const { store } = setup(async () =>
      json(response({ entries: [], matchedTotal: 0, selection: third })),
    );
    store.applyHash({ q: "missing", open: third.resource.id });
    await store.start();
    expect(store.pageList.value).toEqual([]);
    expect(store.find(third.resource.id)).toEqual(third.resource);
    expect(store.detailIndex.value).toBe(-1);
  });

  it("loads just the adjacent page when navigating across the detail page boundary", async () => {
    const { store, browse } = setup(async (url) =>
      json(
        url.searchParams.get("page") === "2"
          ? response({ entries: [third], page: 2 })
          : response(),
      ),
    );
    await store.start();
    store.open(first.resource.id);
    await store.move(1);
    expect(store.detail.id).toBe(second.resource.id);
    expect(browse).toHaveBeenCalledTimes(1);
    await store.move(1);
    await vi.runAllTimersAsync();
    expect(store.detail.id).toBe(third.resource.id);
    expect(store.detailIndex.value).toBe(2);
    expect(browse).toHaveBeenCalledTimes(2);
    await store.move(1);
    expect(browse).toHaveBeenCalledTimes(2);
  });

  it("aborts superseded requests and ignores late responses even if transport ignores abort", async () => {
    let finish!: (value: Response) => void;
    const old = new Promise<Response>((resolve) => {
      finish = resolve;
    });
    const { store, browse } = setup(async (url) =>
      url.searchParams.get("q") === "new"
        ? json(response({ entries: [third] }))
        : old,
    );
    const loading = store.start();
    store.state.q = "new";
    expect(browse.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(250);
    expect(store.pageList.value).toEqual([third]);
    finish(json(response()));
    await loading;
    expect(store.pageList.value).toEqual([third]);
  });

  it("shows errors and retries only the requested page", async () => {
    let failed = true;
    const { store, browse } = setup(async () =>
      failed ? new Response("", { status: 503 }) : json(response()),
    );
    await store.start();
    expect(store.status.value).toBe("error");
    expect(store.error.value).toContain("503");
    failed = false;
    await store.reload();
    expect(store.status.value).toBe("done");
    expect(browse).toHaveBeenCalledTimes(2);
  });

  it("shows a failed page transition in the cached detail and retries the original target", async () => {
    let failed = true;
    const { store, browse } = setup(async (url) => {
      if (url.searchParams.get("page") !== "2") return json(response());
      return failed
        ? new Response("", { status: 503 })
        : json(response({ entries: [third], page: 2 }));
    });
    await store.start();
    store.open(second.resource.id);
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(AkToastProvider, null, { default: () => h(ResourceDetail) }),
    });
    app.provide(explorerKey, store);
    app.mount(host);
    unmounts.push(() => {
      app.unmount();
      host.remove();
    });
    await store.move(1);
    await nextTick();
    expect(store.status.value).toBe("error");
    expect(store.find(second.resource.id)).toEqual(second.resource);
    const dialog = host.querySelector("dialog")!;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("资源读取失败");
    expect(dialog.textContent).toContain("story-resources/explore 503");
    const retry = [...dialog.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "重试",
    )!;
    expect(retry.disabled).toBe(false);
    failed = false;
    retry.click();
    await vi.runAllTimersAsync();
    expect(store.status.value).toBe("done");
    expect(store.error.value).toBe("");
    expect(store.detail.id).toBe(third.resource.id);
    expect(store.detailIndex.value).toBe(2);
    expect(dialog.querySelector(".sae-detail__pos")?.textContent).toBe("3 / 3");
    expect(dialog.textContent).not.toContain("资源读取失败");
    expect(browse.mock.calls[2][0]).toBe(browse.mock.calls[1][0]);
    await store.move(-1);
    expect(store.detail.id).toBe(second.resource.id);
    expect(store.detailIndex.value).toBe(1);
  });

  it("discards a failed detail transition when the filters change", async () => {
    const { store, browse } = setup(async (url) => {
      if (url.searchParams.get("q") === "new")
        return json(
          response({
            entries: [third],
            matchedTotal: 1,
            pageCount: 1,
            selection: second,
          }),
        );
      return url.searchParams.get("page") === "2"
        ? new Response("", { status: 503 })
        : json(response());
    });
    await store.start();
    store.open(second.resource.id);
    await store.move(1);
    store.state.q = "new";
    await vi.advanceTimersByTimeAsync(250);
    expect(store.status.value).toBe("done");
    expect(store.detail.id).toBe(second.resource.id);
    expect(store.pageList.value).toEqual([third]);
    expect(new URL(browse.mock.calls[2][0]).searchParams.get("focus")).toBe(
      second.resource.id,
    );
  });

  it("does not reopen a closed detail when retrying its failed page request", async () => {
    let failed = true;
    const { store } = setup(async (url) => {
      if (url.searchParams.get("page") !== "2") return json(response());
      return failed
        ? new Response("", { status: 503 })
        : json(response({ entries: [third], page: 2 }));
    });
    await store.start();
    store.open(second.resource.id);
    await store.move(1);
    store.close();
    failed = false;
    await store.reload();
    expect(store.status.value).toBe("done");
    expect(store.pageList.value).toEqual([third]);
    expect(store.detail.id).toBeNull();
  });

  it("retries the target page instead of reading stale entries after a failed move", async () => {
    let failed = true;
    const { store, browse } = setup(async (url) => {
      if (url.searchParams.get("page") !== "2") return json(response());
      return failed
        ? new Response("", { status: 503 })
        : json(response({ entries: [third], page: 2 }));
    });
    await store.start();
    store.open(second.resource.id);
    await store.move(1);
    expect(store.status.value).toBe("error");
    expect(store.page.value).toBe(2);
    await store.move(1);
    expect(store.detail.id).toBe(second.resource.id);
    expect(browse).toHaveBeenCalledTimes(3);
    failed = false;
    await store.move(1);
    expect(store.detail.id).toBe(third.resource.id);
    expect(store.detailIndex.value).toBe(2);
  });

  it("locates a card opened while results are out of date", async () => {
    let failed = false;
    const { store, browse } = setup(async (url) =>
      failed && !url.searchParams.has("focus")
        ? new Response("", { status: 503 })
        : json(response({ selection: first })),
    );
    await store.start();
    failed = true;
    store.state.cat = "npc";
    await vi.runAllTimersAsync();
    expect(store.status.value).toBe("error");
    store.open(first.resource.id);
    expect(new URL(browse.mock.calls[2][0]).searchParams.get("focus")).toBe(
      first.resource.id,
    );
    await vi.runAllTimersAsync();
    expect(store.status.value).toBe("done");
  });

  it("leaves the pager mounted and focused while the next page loads", async () => {
    let finish!: (value: Response) => void;
    setup((url) =>
      url.searchParams.get("page") === "2"
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Promise.resolve(json(response({ pageSize: 60 }))),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp(StoryAssetExplorer);
    app.mount(host);
    unmounts.push(() => {
      app.unmount();
      host.remove();
    });
    await vi.runAllTimersAsync();
    await nextTick();
    const pager = host.querySelector('[aria-label="分页（底部）"]')!;
    const next = [...pager.querySelectorAll("button")].at(-1)!;
    const cards = host.querySelectorAll(".sae-card").length;
    expect(cards).toBe(2);
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain("3");
    next.focus();
    next.click();
    await nextTick();
    expect(document.activeElement).toBe(next);
    expect(next.isConnected).toBe(true);
    expect(host.querySelectorAll(".sae-card")).toHaveLength(cards);
    expect(host.querySelector(".ls-bar__count")?.textContent).toContain("3");
    expect(host.querySelector(".sae-result")?.getAttribute("aria-busy")).toBe(
      "true",
    );
    finish(json(response({ entries: [third], page: 2, pageSize: 60 })));
    await vi.runAllTimersAsync();
    await nextTick();
    expect(host.querySelectorAll(".sae-card")).toHaveLength(1);
    expect(document.activeElement).toBe(next);
  });

  it("cancels queued searches when the widget unmounts", async () => {
    const { store, browse, scope } = setup();
    await store.start();
    store.state.q = "later";
    scope.stop();
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(1);
  });

  it("does not start new requests after the widget unmounts", async () => {
    const { store, browse, scope } = setup();
    await store.start();
    scope.stop();
    store.setPage(2);
    store.open(third.resource.id);
    await store.reload();
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(1);
  });

  it("drops the queued search once a page change has sent it", async () => {
    const { store, browse } = setup();
    await store.start();
    store.state.q = "npc";
    store.setPage(2);
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(2);
    expect(
      Object.fromEntries(new URL(browse.mock.calls[1][0]).searchParams),
    ).toMatchObject({ q: "npc", page: "2" });
  });
});
