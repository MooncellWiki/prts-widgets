import { DEFAULT_VITE_PORT } from "./widget.ts";

import type { Plugin } from "vite";

/** pnpm dev 时在 Vite 的地址后面列出 Wiki 上的 /dev 调试链接。 */
export function devWidgetLinks(widgetNames: readonly string[]): Plugin {
  return {
    name: "prts:dev-widget-links",
    apply: "serve",
    configureServer(server) {
      // 包住 printUrls：紧跟在 Local/Network 后面打印，按 u 或换端口重启时也会再打印
      const printUrls = server.printUrls;
      server.printUrls = () => {
        printUrls();
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") return;

        const { info } = server.config.logger;
        if (address.port === DEFAULT_VITE_PORT) {
          info("  ➜  Wiki:    https://prts.wiki/w/Widget:<名称>/dev");
          return;
        }
        // 端口被占用换了端口，/dev 页面要带上 vitePort 才连得到这个实例
        info(`  ➜  Wiki:    当前端口 ${address.port}，调试链接：`);
        for (const name of widgetNames)
          info(
            `             https://prts.wiki/w/Widget:${name}/dev?vitePort=${address.port}`,
          );
      };
    },
  };
}
