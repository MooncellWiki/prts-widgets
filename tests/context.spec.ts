// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findMissingVideoUrls,
  normalizeBackgroundPpuMap,
  normalizeCharacterMap,
} from "../src/widgets/StoryPlayer/context";
import { parseStory } from "../src/widgets/StoryPlayer/engine/parser";

describe("normalizeCharacterMap", () => {
  it("keys the link map by the lowercased base so mixed-case entries resolve", () => {
    const linkMap = normalizeCharacterMap({
      char_259_Jessica_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "char_259_Jessica_1/1$1",
            name: "1$1",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    // resolveCharacterName / resolveCharacterSelection lowercase the story ref
    // before the lookup, so the original-cased key was unreachable.
    expect(Object.keys(linkMap)).toEqual(["char_259_jessica_1"]);
  });

  it("keeps name and image verbatim because they are asset paths", () => {
    const linkMap = normalizeCharacterMap({
      AVG_char_501_Durin_1: {
        array: [
          {
            alias: "",
            group: -1,
            image: "AVG_char_501_Durin_1/AVG_char_501_Durin_1",
            name: "AVG_char_501_Durin_1",
          },
        ],
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    expect(linkMap.avg_char_501_durin_1?.array[0]).toMatchObject({
      image: "AVG_char_501_Durin_1/AVG_char_501_Durin_1",
      name: "AVG_char_501_Durin_1",
    });
  });

  it("preserves face-overlay groups when folding the key", () => {
    const linkMap = normalizeCharacterMap({
      npc_2004_Alty: {
        array: [{ alias: "", face: "npc_2004_Alty/1", group: 0, name: "1$1" }],
        groups: [
          {
            base: "npc_2004_Alty/base",
            faceRect: { h: 80, w: 100, x: 120, y: 40 },
            mode: "face_overlay",
          },
        ],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });

    expect(linkMap).toEqual({
      npc_2004_alty: {
        array: [{ alias: "", face: "npc_2004_Alty/1", group: 0, name: "1$1" }],
        groups: [
          {
            base: "npc_2004_Alty/base",
            faceRect: { h: 80, w: 100, x: 120, y: 40 },
            mode: "face_overlay",
          },
        ],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    });
  });
});

describe("normalizeCharacterMap body/index", () => {
  const entries = (array: unknown[]) =>
    normalizeCharacterMap({
      avg_npc_9: {
        array,
        groups: [],
        pos: { x: 0, y: 0 },
        size: { x: 0, y: 0 },
      },
    }).avg_npc_9?.array;

  it("keeps the prefab slot of each entry", () => {
    expect(
      entries([
        {
          alias: "",
          body: 1,
          group: -1,
          image: "a/1$2",
          index: 3,
          name: "1$2",
        },
      ]),
    ).toEqual([
      { alias: "", body: 1, group: -1, image: "a/1$2", index: 3, name: "1$2" },
    ]);
  });

  it("drops a slot unless both body and index are integers", () => {
    const [onlyBody, fractional, text] = entries([
      { alias: "", body: 1, group: -1, image: "a/1", name: "1" },
      { alias: "", body: 1, group: -1, image: "a/2", index: 0.5, name: "2" },
      { alias: "", body: "1", group: -1, image: "a/3", index: 0, name: "3" },
    ])!;
    for (const entry of [onlyBody, fractional, text]) {
      expect(entry).not.toHaveProperty("body");
      expect(entry).not.toHaveProperty("index");
    }
  });
});

describe("normalizeBackgroundPpuMap", () => {
  it("folds keys lowercase and keeps finite positive ppus", () => {
    const map = normalizeBackgroundPpuMap({
      bg_cher_1: 68.24644470214844,
      BG_Woods: 100,
    });

    expect(map).toEqual({
      bg_cher_1: 68.24644470214844,
      bg_woods: 100,
    });
  });

  it("drops null, NaN and non-positive ppus but coerces numeric strings", () => {
    const map = normalizeBackgroundPpuMap({
      bg_bad_string: "80",
      bg_bad_null: null,
      bg_bad_negative: -1,
      bg_bad_zero: 0,
      bg_bad_nan: Number.NaN,
      bg_ok: 80,
    });

    // "80" is a valid numeric string per toNumber, mirroring how story
    // params are parsed; only non-numeric junk is dropped.
    expect(map).toEqual({ bg_bad_string: 80, bg_ok: 80 });
  });

  it("returns an empty map for non-object payloads", () => {
    expect(normalizeBackgroundPpuMap(null)).toEqual({});
    expect(normalizeBackgroundPpuMap([1, 2])).toEqual({});
    expect(normalizeBackgroundPpuMap("nope")).toEqual({});
  });
});

describe("findMissingVideoUrls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("HEAD-probes each res once and only counts 404/410 as missing", async () => {
    const statuses: Record<string, number> = {
      "https://torappu.prts.wiki/assets/video/02.mp4": 200,
      "https://torappu.prts.wiki/assets/video/forbidden.mp4": 403,
      "https://torappu.prts.wiki/assets/video/gone.mp4": 404,
      "https://torappu.prts.wiki/assets/video/old.mp4": 410,
    };
    const fetchMock = vi.fn(async (url: string) => {
      const status = statuses[url];
      if (status === undefined) throw new TypeError("Failed to fetch");
      return { status };
    });
    vi.stubGlobal("fetch", fetchMock);
    const { lines, metadata } = parseStory([
      '[Video(res="video/02.mp4")]',
      '[video(res="video/02.mp4")]',
      '[video(res="video/Gone.mp4")]',
      '[video(res="video/old.mp4")]',
      '[video(res="video/forbidden.mp4")]',
      '[video(res="video/offline.mp4")]',
      // `url` takes priority and native never checks it.
      '[video(url="video/url.mp4", res="video/shadowed.mp4")]',
    ]);

    const missing = await findMissingVideoUrls(lines, metadata);

    expect([...missing].sort()).toEqual([
      "https://torappu.prts.wiki/assets/video/gone.mp4",
      "https://torappu.prts.wiki/assets/video/old.mp4",
    ]);
    expect(fetchMock.mock.calls.map(([url]) => url).sort()).toEqual([
      "https://torappu.prts.wiki/assets/video/02.mp4",
      "https://torappu.prts.wiki/assets/video/forbidden.mp4",
      "https://torappu.prts.wiki/assets/video/gone.mp4",
      "https://torappu.prts.wiki/assets/video/offline.mp4",
      "https://torappu.prts.wiki/assets/video/old.mp4",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), {
      method: "HEAD",
    });
  });

  it("skips VIDEO_ONLY stories, which never run the video command", async () => {
    const fetchMock = vi.fn(async () => ({ status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const { lines, metadata } = parseStory([
      '[HEADER(key="x", is_video_only=true)]',
      '[Video(res="video/act15side/IW01.mp4")]',
    ]);

    expect(await findMissingVideoUrls(lines, metadata)).toEqual(new Set());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("normalizeCharacterMap bodies", () => {
  const node = (bodies: unknown) =>
    normalizeCharacterMap({
      avg_npc_9: { array: [], bodies, groups: [], pos: {}, size: {} },
    }).avg_npc_9;

  it("keeps per-body sprite counts", () => {
    expect(node([15, 13, 0])?.bodies).toEqual([15, 13, 0]);
  });

  it("drops bodies unless every count is a non-negative integer", () => {
    for (const bodies of [undefined, null, 3, [1, -1], [1.5], ["2"]])
      expect(node(bodies)).not.toHaveProperty("bodies");
  });
});
