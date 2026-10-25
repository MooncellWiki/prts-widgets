import type { Plugin } from "vite";

export function devWidgetLinks(widgetNames: readonly string[]): Plugin {
  return {
    name: "prts:dev-widget-links",
    apply: "serve",
    configureServer(server) {
      server.httpServer?.once("listening", () => {
        const address = server.httpServer?.address();
        if (!address || typeof address === "string") return;
        const links = widgetNames.map(
          (name) =>
            `  https://prts.wiki/w/Widget:${name}/dev?vitePort=${address.port}`,
        );
        server.config.logger.info(`\n  Wiki 调试：\n${links.join("\n")}\n`);
      });
    },
  };
}
