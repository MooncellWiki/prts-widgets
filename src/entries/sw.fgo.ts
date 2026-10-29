import { registerRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";

// 保留 FGO 原来的策略，Workbox 随 Worker 一起打包，不再动态加载旧版发行文件。
registerRoute(
  /^https:\/\/(m\.)?fgo\.wiki\/w\//,
  new NetworkFirst({ networkTimeoutSeconds: 6 }),
);
registerRoute(/\.php/, new NetworkFirst({ networkTimeoutSeconds: 6 }));
registerRoute(/^https:\/\/browser\.sentry-cdn\.com\//, new CacheFirst());
registerRoute(/^https:\/\/[^/]+\.bytecdntp\.com\//, new CacheFirst());
registerRoute(/^https:\/\/[^/]+\.pstatp\.com\//, new CacheFirst());
