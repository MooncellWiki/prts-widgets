import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPageStory } from "../src/pages/story";

afterEach(() => vi.unstubAllGlobals());

describe("standalone story loading", () => {
  it.each([
    [
      "path=obt/main/test.txt",
      "https://torappu.prts.wiki/gamedata/latest/story/obt/main/test.txt",
    ],
    [
      "url=https://example.com/story.txt&path=ignored",
      "https://example.com/story.txt",
    ],
    ["path=https://example.com/story.txt", "https://example.com/story.txt"],
  ])("loads %s using the shared URL resolver", async (query, expected) => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response("[name=博士]你好\n"));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadPageStory(new URLSearchParams(query))).toBe(
      "[name=博士]你好\n",
    );
    expect(fetcher).toHaveBeenCalledWith(expected);
  });

  it.each([
    ["", "请在 URL 中提供"],
    ["path=%20&url=%20", "请在 URL 中提供"],
    ["url=javascript:alert(1)", "HTTP(S)"],
    ["url=/relative.txt", "HTTP(S)"],
  ])("rejects invalid input %s before fetching", async (query, message) => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(loadPageStory(new URLSearchParams(query))).rejects.toThrow(
      message,
    );
    expect(fetcher.mock.calls).toEqual([]);
  });

  it.each([
    ["missing", 404, "HTTP 404"],
    [" \n ", 200, "剧情内容为空"],
  ])(
    "reports HTTP and empty-script errors (%s)",
    async (body, status, message) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(body, { status })),
      );
      await expect(
        loadPageStory(new URLSearchParams("path=test.txt")),
      ).rejects.toThrow(message);
    },
  );

  it("propagates network failures to the page error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    await expect(
      loadPageStory(new URLSearchParams("path=test.txt")),
    ).rejects.toThrow("Failed to fetch");
  });
});
