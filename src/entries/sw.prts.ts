import { registerRoute, setDefaultHandler } from "workbox-routing";
import {
  StaleWhileRevalidate,
  CacheFirst,
  NetworkFirst,
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

registerRoute(/^https:\/\/hm\.baidu\.com.*/, new NetworkFirst());
registerRoute(/^https:\/\/www\.google\.com.*/, new NetworkFirst());
registerRoute(
  /^https:\/\/ingest\.sentry\.mooncell\.wiki.*/,
  new NetworkFirst(),
);
setDefaultHandler(new StaleWhileRevalidate());
