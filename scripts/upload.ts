import path from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";
import { config as loadEnv } from "dotenv";

import {
  cacheControlFor,
  collectPublishFiles,
  remotePrefix,
} from "./deploy/files";

const BUILD_DIR = "dist";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 文件名里带构建 hash（base64url，8 位）的产物内容不可变，可以让 CDN 和浏览器
// 永久缓存。vite.config.ts 里 nohashEntries 指定的固定文件名入口（sentry.js、
// sw.js、Tooltip.js、DisplayController.js）是站内按名字引用的，改完要尽快生效，
// 只给短缓存。static.prts.wiki 的 CDN 在 /widgets/production/ 上开了「优先遵循
// 源站缓存策略」，两类文件的 CDN 缓存时长都以这里写进 OSS 的 Cache-Control 为准；
// 不写的话 CDN 按该目录规则缓存 1 年，部署后只能手动刷新。

loadEnv({
  path: [path.join(__dirname, "../.env.dev"), path.join(__dirname, "../.env")],
  quiet: true,
});

const buildDir = path.join(__dirname, "..", BUILD_DIR);
const distSet = new Set(collectPublishFiles(buildDir));
console.log("[INFO] Dist set:", distSet);

const {
  REGION,
  ENDPOINT,
  ACCESS_KEY_ID,
  ACCESS_KEY_SECRET,
  BUCKET,
  REMOTE_PATH,
} = process.env;

if (
  !REGION ||
  !ACCESS_KEY_ID ||
  !ACCESS_KEY_SECRET ||
  !BUCKET ||
  !REMOTE_PATH
) {
  throw new Error(
    "Missing required environment variables: REGION, ACCESS_KEY_ID, ACCESS_KEY_SECRET, BUCKET, REMOTE_PATH",
  );
}

const store = new OSS({
  region: REGION,
  // CI 跑在海外 runner 上，设 ENDPOINT 走传输加速域名；不设则按 REGION 走普通外网域名
  endpoint: ENDPOINT,
  secure: true,
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

const prefix = remotePrefix(REMOTE_PATH);
// 先上传带 hash 的依赖，最后发布可变页面壳，避免新页面短暂引用未上传的资源。
const files = [...distSet].sort(
  (a, b) => Number(a.endsWith(".html")) - Number(b.endsWith(".html")),
);
for (const file of files) {
  const cacheControl = cacheControlFor(file);
  const result = await store.put(
    path.posix.join(prefix, file),
    path.join(buildDir, file),
    { headers: { "Cache-Control": cacheControl } },
  );
  console.log(
    "[INFO] Uploaded",
    result.res.status,
    result.name,
    `(${cacheControl})`,
  );
}
