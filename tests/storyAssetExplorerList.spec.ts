import { effectScope, type EffectScope } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHash,
  createExplorer,
  readHash,
  type Entry,
  type ExploreResponse,
} from "../src/widgets/StoryAssetExplorer/store";
import {
  characterCategory,
  compareResourceId,
  faceUsageCounts,
  groupUsages,
  highlightParts,
  normalizeResourceQuery,
  parseCharacterMap,
  resolveFaceAlias,
  type UsageRow,
} from "../src/widgets/StoryAssetExplorer/utils";

describe("characterCategory", () => {
  it("splits characters like the old NPC / Char sections", () => {
    expect(characterCategory("avg_npc_009")).toBe("npc");
    expect(characterCategory("avg_npc_1898_1$1")).toBe("npc");
    expect(characterCategory("npc_2001_aya_1#npc_2001_Aya_1")).toBe("npc");
    expect(characterCategory("avgnew_npc_140_1$1")).toBe("npc");
    expect(characterCategory("avg_003_kalts_1$1")).toBe("operator");
    expect(characterCategory("char_211_adnach_1#char_211_adnach_6")).toBe(
      "operator",
    );
    expect(characterCategory("avgnew_112_siege_1$1")).toBe("operator");
    expect(characterCategory("avg_char_501_durin_1#x")).toBe("operator");
    expect(characterCategory("avg_doc_1#avg_doc_1")).toBe("other");
    expect(characterCategory("char_empty#char_empty")).toBe("other");
  });
});

describe("compareResourceId", () => {
  it("sorts numbers naturally", () => {
    const ids = ["avg_npc_10", "avg_npc_9", "avg_npc_100", "avg_npc_009_1"];
    expect(ids.toSorted(compareResourceId)).toEqual([
      "avg_npc_9",
      "avg_npc_009_1",
      "avg_npc_10",
      "avg_npc_100",
    ]);
  });
});

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

describe("resolveFaceAlias", () => {
  const links = parseCharacterMap({
    avg_003_Kalts_1: {
      groups: [
        {
          mode: "face_overlay",
          base: "avg_003_kalts_1/avg_003_kalts_1$1",
          faceRect: { x: 1, y: 2, w: 3, h: 4 },
        },
        {
          mode: "face_overlay",
          base: "avg_003_kalts_1/avg_003_kalts_1$2",
          faceRect: { x: 1, y: 2, w: 3, h: 4 },
        },
      ],
      array: [
        { name: "1$1", group: 0, face: "avg_003_kalts_1/1$1" },
        { name: "1$2", group: 1, face: "avg_003_kalts_1/1$2" },
        {
          name: "avg_003_kalts_2",
          group: -1,
          image: "avg_003_kalts_1/avg_003_kalts_2",
        },
      ],
    },
  });

  it("maps an overlay expression to its body listing", () => {
    expect(resolveFaceAlias("avg_003_kalts_1#1$2", links)).toEqual({
      id: "avg_003_kalts_1$2",
      face: "1$2",
    });
  });

  it("leaves standalone images and unknown names alone", () => {
    expect(resolveFaceAlias("avg_003_kalts_1#avg_003_kalts_2", links)).toBe(
      null,
    );
    expect(resolveFaceAlias("avg_003_kalts_1#9$9", links)).toBe(null);
    expect(resolveFaceAlias("kalts", links)).toBe(null);
    expect(resolveFaceAlias("avg_003_kalts_1#1$1", null)).toBe(null);
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
          : Promise.resolve(new Response("{}")),
      ),
    );
    const scope = effectScope();
    scopes.push(scope);
    const store = scope.run(() => createExplorer({}))!;
    store.setStep(2);
    return { store, browse, scope };
  }
  afterEach(() => {
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

  it("uses server union counts and group members without recomputing max or sorting", async () => {
    const merged = {
      ...first,
      members: [first.resource, second.resource],
      merged: 2,
      count: 5,
    };
    const { store } = setup(async () =>
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

  it("cancels queued searches when the widget unmounts", async () => {
    const { store, browse, scope } = setup();
    await store.start();
    store.state.q = "later";
    scope.stop();
    await vi.runAllTimersAsync();
    expect(browse).toHaveBeenCalledTimes(1);
  });
});
