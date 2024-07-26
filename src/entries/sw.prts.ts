import { registerRoute, setDefaultHandler } from "workbox-routing";
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkFirst,
  NetworkOnly,
} from "workbox-strategies";
registerRoute(/\.php/, new NetworkFirst({ networkTimeoutSeconds: 5 }));
registerRoute(
  /^https:\/\/(m\.)?(fgo|prts).wiki\/w\//,
  new NetworkFirst({ networkTimeoutSeconds: 5 }),
);
registerRoute(
  /^https:\/\/torappu.prts.wiki\/api/,
  new NetworkFirst({ networkTimeoutSeconds: 5 }),
);
registerRoute(/^https:\/\/static\.prts\.wiki/, new CacheFirst());

registerRoute(/^https:\/\/hm\.baidu\.com.*/, new NetworkOnly());
registerRoute(/^https:\/\/www\.google\.com.*/, new NetworkOnly());
registerRoute(/^https:\/\/ingest\.sentry\.mooncell\.wiki.*/, new NetworkOnly());
setDefaultHandler(new StaleWhileRevalidate());
