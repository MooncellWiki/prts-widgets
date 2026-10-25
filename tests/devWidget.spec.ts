import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { devWidget } from "../scripts/dev/widget";

const loader = readFileSync(
  path.resolve(import.meta.dirname, "../scripts/dev/loader.js"),
  "utf8",
);

describe("开发加载器", () => {
  let modules: string[];

  beforeEach(() => {
    history.replaceState(null, "", "/");
    document.head.innerHTML = "";
    document.body.innerHTML =
      '<script data-prts-dev-entry="CharList"></script>';
    Object.defineProperty(document, "currentScript", {
      configurable: true,
      value: document.body.querySelector("script"),
    });
    modules = [];
    vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
    vi.spyOn(document.head, "append").mockImplementation((...nodes) => {
      for (const node of nodes) {
        const script = node as HTMLScriptElement;
        modules.push(script.src);
        queueMicrotask(() => script.dispatchEvent(new Event("load")));
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (document as { currentScript?: unknown }).currentScript;
    document.body.innerHTML = "";
  });

  it.each([
    ["", "http://localhost:8080"],
    ["?vitePort=8082", "http://localhost:8082"],
    ["?x=1&vitePort=8083", "http://localhost:8083"],
    ["?vitePort=1", "http://localhost:1"],
    ["?vitePort=65535", "http://localhost:65535"],
  ])("URL %s 连接 %s", async (query, origin) => {
    history.replaceState(null, "", `/${query}`);
    new Function(loader)();

    await vi.waitFor(() => {
      expect(modules).toEqual([
        `${origin}/@vite/client`,
        `${origin}/src/entries/CharList.ts`,
      ]);
    });
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it("等页面解析完再加载，保留原先 module 标签的 defer 行为", async () => {
    vi.spyOn(document, "readyState", "get").mockReturnValue("loading");
    new Function(loader)();
    expect(modules).toEqual([]);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    await vi.waitFor(() => {
      expect(modules).toEqual([
        "http://localhost:8080/@vite/client",
        "http://localhost:8080/src/entries/CharList.ts",
      ]);
    });
  });

  it.each(["", "0", "65536", "8082x", "-1"])(
    "非法端口 %s 显示提示且不加载脚本",
    async (port) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      history.replaceState(null, "", `/?vitePort=${port}`);
      new Function(loader)();
      await vi.waitFor(() => {
        expect(document.querySelector('[role="alert"]')?.textContent).toContain(
          "vitePort 必须是",
        );
      });
      expect(modules).toEqual([]);
    },
  );

  it("连接失败时显示错误，停止加载入口", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(document.head.append).mockImplementation((node) => {
      const script = node as HTMLScriptElement;
      modules.push(script.src);
      queueMicrotask(() => script.dispatchEvent(new Event("error")));
    });
    new Function(loader)();
    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        "无法加载 http://localhost:8080/@vite/client",
      );
    });
    expect(modules).toEqual(["http://localhost:8080/@vite/client"]);
  });
});

describe("开发片段生成", () => {
  it("新建 Widget 的开发页带上加载器和自引用", () => {
    const html = devWidget("CharList");
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain(
      `<script data-prts-dev-entry="CharList">\n${loader}`,
    );
    expect(html).toContain("<noinclude>{{#widget:CharList/dev}}</noinclude>");
    expect(html.indexOf("data-prts-dev-entry")).toBeLessThan(
      html.indexOf("</includeonly>"),
    );
    expect(html).not.toContain('<script type="module" src="/src/entries/');
  });

  it("拒绝非法 Widget 名称", () => {
    expect(() => devWidget("../CharList")).toThrow("Widget 名称");
  });
});
