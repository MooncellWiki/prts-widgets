/** 与 vite.config.ts 的 server.port 一致；URL 不带 vitePort 时连这个端口。 */
export const DEFAULT_VITE_PORT = 8080;

export function assertWidgetName(name: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
    throw new Error("Widget 名称必须以字母开头，且只含字母和数字");
}

/**
 * /dev 页面里从本地 Vite 加载入口的片段。Wiki 上的副本用 scripts/dev/sync.ts 按这里更新。
 *
 * 内联 module 脚本本身就是 defer 的，执行时机和原来两个 `<script type="module" src>` 一样。
 * URL 只能指定端口、host 固定 localhost：放开成任意源的话，谁都能构造一个 prts.wiki
 * 链接让访问者在站内执行任意脚本。
 */
export function viteLoader(entry: string): string {
  assertWidgetName(entry);
  return `<script type="module" data-prts-vite>
const port = new URLSearchParams(location.search).get("vitePort") ?? "${DEFAULT_VITE_PORT}";
if (!/^\\d{1,5}$/.test(port)) throw new Error("vitePort 不是端口号：" + port);
const origin = "http://localhost:" + port;
await import(origin + "/@vite/client");
await import(origin + "/src/entries/${entry}.ts");
</script>`;
}

/** 新建 Widget 时生成配套的开发页面。 */
export function devWidget(name: string): string {
  return `<includeonly>
<div id="root"></div>
${viteLoader(name)}
</includeonly><noinclude>{{#widget:${name}/dev}}</noinclude>
`;
}

const VITE_CLIENT_TAG =
  /<script type="module" src="http:\/\/localhost:\d+\/@vite\/client"><\/script>\n?/g;
// 写死端口的旧入口标签，或者之前同步过的 viteLoader
const VITE_ENTRY_TAG =
  /<script type="module" (?:src="http:\/\/localhost:\d+\/src\/entries\/\w+\.ts">|data-prts-vite>[\s\S]*?)<\/script>/g;
const ENTRY_PATH = /\/src\/entries\/(\w+)\.ts/;

/**
 * 把 /dev 页面里加载 Vite 的标签换成当前的 viteLoader。
 * 各页面的根节点、Smarty 参数和 noinclude 里的测试数据都不一样，只动这几个标签。
 */
export function syncDevPage(page: string): string {
  const tags = page.match(VITE_ENTRY_TAG) ?? [];
  if (tags.length !== 1)
    throw new Error(`应有一处加载 Vite 入口，实际 ${tags.length} 处`);
  const entry = ENTRY_PATH.exec(tags[0])?.[1];
  if (!entry) throw new Error("认不出加载的入口");

  const loader = viteLoader(entry);
  return page
    .replace(VITE_CLIENT_TAG, "")
    .replace(VITE_ENTRY_TAG, () => loader);
}
