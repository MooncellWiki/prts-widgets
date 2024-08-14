import { registerRoute } from "workbox-routing";
import { NetworkFirst } from "workbox-strategies";
registerRoute(/\.php/, new NetworkFirst({ networkTimeoutSeconds: 5 }));
registerRoute(
  /^https:\/\/(m\.)?(fgo|prts).wiki\/w\//,
  new NetworkFirst({ networkTimeoutSeconds: 5 }),
);
registerRoute(
  /^https:\/\/torappu.prts.wiki\/api/,
  new NetworkFirst({ networkTimeoutSeconds: 5 }),
);
