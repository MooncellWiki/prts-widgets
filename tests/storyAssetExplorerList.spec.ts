import { effectScope } from "vue";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildHash,
  createExplorer,
  readHash,
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
  type StoryResourceSummary,
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

describe("createExplorer", () => {
  const RESOURCES: Record<string, StoryResourceSummary[]> = {
    character: [
      { type: "character", id: "avg_npc_10", scriptCount: 1 },
      { type: "character", id: "avg_npc_9", scriptCount: 5 },
      { type: "character", id: "char_1_a_1#char_1_a_1", scriptCount: 2 },
      { type: "character", id: "char_1_a_1#char_1_a_2", scriptCount: 7 },
      { type: "character", id: "avg_doc_1#avg_doc_1", scriptCount: 3 },
    ],
    background: [{ type: "background", id: "bg_npc_room", scriptCount: 4 }],
    image: [],
    item: [],
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function setup() {
    // 每个类型分两页给，验证翻页拼接后按自然顺序排
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const params = new URL(url).searchParams;
        const all = RESOURCES[params.get("type") ?? ""] ?? [];
        const second = params.get("cursor") === "next";
        const half = Math.ceil(all.length / 2);
        return new Response(
          JSON.stringify({
            resources: second ? all.slice(half) : all.slice(0, half),
            nextCursor: second || all.length < 2 ? null : "next",
          }),
        );
      }),
    );
    const scope = effectScope();
    const store = scope.run(() => createExplorer({}))!;
    await Promise.all(
      (["character", "background", "image", "item"] as const).map((type) =>
        store.loadIndex(type),
      ),
    );
    return store;
  }

  it("loads every page and sorts naturally", async () => {
    const store = await setup();
    expect(store.indexes.character.status).toBe("done");
    expect(store.indexes.character.items.map((item) => item.id)).toEqual([
      "avg_doc_1#avg_doc_1",
      "avg_npc_9",
      "avg_npc_10",
      "char_1_a_1#char_1_a_1",
      "char_1_a_1#char_1_a_2",
    ]);
  });

  it("merges the images of one character by default", async () => {
    const store = await setup();
    expect(store.list.value.map((entry) => entry.resource.id)).toEqual([
      "avg_doc_1#avg_doc_1",
      "avg_npc_9",
      "avg_npc_10",
      "char_1_a_1#char_1_a_1",
    ]);
    const merged = store.list.value[3];
    expect(merged.merged).toBe(2);
    expect(merged.count).toBe(7);
    expect(store.total.value).toBe(4);

    store.state.merge = false;
    expect(store.list.value).toHaveLength(5);
  });

  it("filters by category and search, and counts every tab", async () => {
    const store = await setup();
    store.state.cat = "npc";
    expect(store.list.value.map((entry) => entry.resource.id)).toEqual([
      "avg_npc_9",
      "avg_npc_10",
    ]);
    expect(store.categoryCounts.value).toEqual({
      operator: 1,
      npc: 2,
      other: 1,
    });

    store.state.cat = "";
    store.state.q = "NPC";
    expect(store.counts.value).toEqual({
      character: 2,
      background: 1,
      image: 0,
      item: 0,
    });
  });

  it("sorts by script count and walks the detail through the results", async () => {
    const store = await setup();
    store.state.merge = false;
    store.setSortKey("count");
    expect(store.list.value.map((entry) => entry.count)).toEqual([
      7, 5, 3, 2, 1,
    ]);

    store.open("avg_npc_9");
    expect(store.detailIndex.value).toBe(1);
    store.move(1);
    expect(store.detail.id).toBe("avg_doc_1#avg_doc_1");
    store.move(10);
    expect(store.detail.id).toBe("avg_doc_1#avg_doc_1");
  });

  it("keeps the first visible entry when the page size changes", async () => {
    const store = await setup();
    store.state.merge = false;
    store.setStep(2);
    store.setPage(3);
    expect(store.pageList.value.map((entry) => entry.resource.id)).toEqual([
      "char_1_a_1#char_1_a_2",
    ]);
    store.setStep(3);
    expect(store.page.value).toBe(2);
  });
});
