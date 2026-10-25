// 原样内嵌到 Wiki 的 /dev 页面，不依赖本地服务器来读取端口配置。
(() => {
  const anchor = document.currentScript;
  const entry = anchor.dataset.prtsDevEntry;
  let origin = "http://localhost:8080";

  function loadModule(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`无法加载 ${src}`));
      document.head.append(script);
    });
  }

  async function load() {
    const url = new URL(origin);
    const port = new URLSearchParams(location.search).get("vitePort");
    if (port !== null) {
      if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
        throw new Error("vitePort 必须是 1–65535 之间的端口号");
      url.port = port;
    }
    origin = url.origin;

    // 动态插入的 module 不会像原来的标签那样 defer，等整页容器解析完再挂载。
    if (document.readyState === "loading") {
      await new Promise((resolve) =>
        document.addEventListener("DOMContentLoaded", resolve, { once: true }),
      );
    }

    await loadModule(`${origin}/@vite/client`);
    await loadModule(`${origin}/src/entries/${entry}.ts`);
  }

  load().catch((error) => {
    console.error(`[PRTS dev] ${entry}`, error);
    const message = document.createElement("div");
    message.setAttribute("role", "alert");
    message.textContent =
      `[PRTS dev] ${entry} 加载失败（${origin}）：${error.message}。` +
      "请确认 pnpm dev 已启动，并使用终端打印的对应 Widget 调试链接。";
    anchor.before(message);
  });
})();
