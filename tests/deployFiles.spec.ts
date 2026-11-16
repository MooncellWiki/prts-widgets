// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  cacheControlFor,
  collectPublishFiles,
  listRemoteFiles,
  obsoleteFiles,
  remotePrefix,
} from "../scripts/deploy/files";

describe("standalone deployment", () => {
  it("publishes nested pages and assets, excluding wiki templates, metadata and symlinks", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prts-deploy-"));
    try {
      for (const name of [
        "main.ABCDef12.js",
        "pages/StoryPlayer.html",
        "pages/nested/help.html",
        "templates/StoryPlayer.html",
        ".vite/manifest.json",
        ".DS_Store",
      ]) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), "test");
      }
      fs.symlinkSync(path.join(dir, "pages"), path.join(dir, "alias"));
      expect(collectPublishFiles(dir)).toEqual([
        "main.ABCDef12.js",
        "pages/StoryPlayer.html",
        "pages/nested/help.html",
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ["pages/StoryPlayer.html", "public, max-age=300"],
    ["Tooltip.js", "public, max-age=300"],
    [
      "nested/prts-design.min.Ab12_-CD.css",
      "public, max-age=31536000, immutable",
    ],
    ["main.Ab12_-CD.js.map", "public, max-age=31536000, immutable"],
  ])("sets cache policy for %s", (file, expected) => {
    expect(cacheControlFor(file)).toBe(expected);
  });

  it("normalizes the directory boundary and refuses a bucket-root prefix", () => {
    expect(remotePrefix("/widgets/production/")).toBe("widgets/production/");
    expect(remotePrefix("widgets/production")).toBe("widgets/production/");
    expect(() => remotePrefix("/")).toThrow("non-root directory");
  });

  it("lists nested objects across pages without a delimiter", async () => {
    const listV2 = vi
      .fn()
      .mockResolvedValueOnce({
        objects: [{ name: "widgets/production/old.js" }],
        isTruncated: true,
        nextContinuationToken: "next",
      })
      .mockResolvedValueOnce({
        objects: [{ name: "widgets/production/pages/Old.html" }],
        isTruncated: false,
      });
    expect(await listRemoteFiles({ listV2 }, "widgets/production/")).toEqual([
      "widgets/production/old.js",
      "widgets/production/pages/Old.html",
    ]);
    expect(listV2.mock.calls).toEqual([
      [{ prefix: "widgets/production/", "max-keys": 1000 }],
      [
        {
          prefix: "widgets/production/",
          "max-keys": 1000,
          "continuation-token": "next",
        },
      ],
    ]);
  });

  it("accepts an empty remote directory", async () => {
    const listV2 = vi.fn().mockResolvedValue({ isTruncated: false });
    expect(await listRemoteFiles({ listV2 }, "widgets/production/")).toEqual(
      [],
    );
  });

  it.each([undefined, "repeat"])(
    "aborts incomplete enumeration with token %s",
    async (token) => {
      const listV2 = vi.fn().mockResolvedValue({
        objects: [],
        isTruncated: true,
        nextContinuationToken: token,
      });
      await expect(
        listRemoteFiles({ listV2 }, "widgets/production/"),
      ).rejects.toThrow("without a new continuation token");
    },
  );

  it("only removes obsolete objects within the exact prefix, retaining legacy assets and maps", () => {
    const prefix = "widgets/production/";
    expect(
      obsoleteFiles(
        [
          `${prefix}pages/StoryPlayer.html`,
          `${prefix}pages/Old.html`,
          `${prefix}old.js`,
          `${prefix}legacy.js`,
          `${prefix}legacy.js.map`,
          prefix,
          `${prefix}pages/`,
          "widgets/production-backup/keep.js",
          "widgets/development/keep.js",
        ],
        prefix,
        new Set(["pages/StoryPlayer.html"]),
        new Set(["legacy.js"]),
      ),
    ).toEqual([`${prefix}pages/Old.html`, `${prefix}old.js`]);
  });
});
