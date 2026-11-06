import { describe, expect, it } from "vitest";

import { devWidget, syncDevPage, viteLoader } from "../scripts/dev/widget";

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
  ...args: string[]
) => (...args: unknown[]) => Promise<void>;

/** 把片段里的 import() 换成桩函数执行，返回依次加载的地址。 */
async function runLoader(search: string): Promise<string[]> {
  const body = /<script[^>]*>([\s\S]*)<\/script>/.exec(
    viteLoader("CharList"),
  )![1];
  const imported: string[] = [];
  const run = new AsyncFunction(
    "location",
    "load",
    body.replaceAll("import(", "load("),
  );
  await run({ search }, async (url: string) => {
    imported.push(url);
  });
  return imported;
}

describe("viteLoader", () => {
  it.each([
    ["", "http://localhost:8080"],
    ["?vitePort=8082", "http://localhost:8082"],
    ["?x=1&vitePort=8083", "http://localhost:8083"],
  ])("URL %s 连接 %s", async (search, origin) => {
    expect(await runLoader(search)).toEqual([
      `${origin}/@vite/client`,
      `${origin}/src/entries/CharList.ts`,
    ]);
  });

  it.each(["", "8082x", "-1", "evil.com", "1@evil.com"])(
    "非法端口 %s 不加载任何脚本",
    async (port) => {
      await expect(runLoader(`?vitePort=${port}`)).rejects.toThrow(
        "vitePort 不是端口号",
      );
    },
  );

  it("拒绝非法入口名", () => {
    expect(() => viteLoader("../CharList")).toThrow("Widget 名称");
  });
});

describe("devWidget", () => {
  it("新建 Widget 的开发页带上加载片段和自引用", () => {
    const html = devWidget("CharList");
    expect(html).toContain(
      `<includeonly>\n<div id="root"></div>\n${viteLoader("CharList")}\n</includeonly>`,
    );
    expect(html).toContain("<noinclude>{{#widget:CharList/dev}}</noinclude>");
  });
});

describe("syncDevPage", () => {
  // Wiki 上的旧 /dev 页面：写死端口，根节点和 noinclude 各不相同
  const charList = `<includeonly>
<div id="root"></div>
<script type="module" src="http://localhost:8081/@vite/client"></script>
<script type="module" src="http://localhost:8081/src/entries/CharList.ts"></script>
</includeonly><noinclude><div style="display:none" id="filter-data">{{#cargo_query:
tables=chara
}}</div>{{#widget:CharList/dev}}</noinclude>`;
  const spineViewer = `<includeonly>
<script type="module" src="http://localhost:8081/@vite/client"></script>
<div style="display:none" id="SPINEDATA" type="json" class="navigation-not-searchable"><!--{$data}--></div>
<div id="spine-root" data-id="<!--{$id}-->" data-disable-patch="<!--{$disablePatch}-->"></div>
<script type="module" src="http://localhost:8081/src/entries/SpineViewer.ts"></script>
</includeonly><noinclude>{{#widget:SpineViewer/dev|data={}}}</noinclude>`;

  it("两个写死端口的标签换成加载片段，其余内容不动", () => {
    expect(syncDevPage(charList)).toBe(`<includeonly>
<div id="root"></div>
${viteLoader("CharList")}
</includeonly><noinclude><div style="display:none" id="filter-data">{{#cargo_query:
tables=chara
}}</div>{{#widget:CharList/dev}}</noinclude>`);
  });

  it("@vite/client 和入口分开放时也能换掉，保留 Smarty 参数", () => {
    expect(syncDevPage(spineViewer)).toBe(`<includeonly>
<div style="display:none" id="SPINEDATA" type="json" class="navigation-not-searchable"><!--{$data}--></div>
<div id="spine-root" data-id="<!--{$id}-->" data-disable-patch="<!--{$disablePatch}-->"></div>
${viteLoader("SpineViewer")}
</includeonly><noinclude>{{#widget:SpineViewer/dev|data={}}}</noinclude>`);
  });

  it("同步过的页面再跑一次不变", () => {
    const synced = syncDevPage(charList);
    expect(syncDevPage(synced)).toBe(synced);
  });

  it("旧版加载片段整段换成当前版本", () => {
    const outdated = devWidget("CharList").replace(
      viteLoader("CharList"),
      `<script type="module" data-prts-vite>
import("http://localhost:8080/src/entries/CharList.ts");
</script>`,
    );
    expect(syncDevPage(outdated)).toBe(devWidget("CharList"));
  });

  it.each([
    ["没有入口标签", '<includeonly><div id="root"></div></includeonly>'],
    ["两个入口标签", `${charList}\n${charList}`],
  ])("%s时报错，交给调用方跳过", (_, page) => {
    expect(() => syncDevPage(page)).toThrow("应有一处加载 Vite 入口");
  });
});
