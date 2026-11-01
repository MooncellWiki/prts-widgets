import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";
import { config as loadEnv } from "dotenv";

const BUILD_DIR = "dist";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 文件名里带构建 hash（base64url，8 位）的产物内容不可变，可以让 CDN 和浏览器
// 永久缓存。vite.config.ts 里 nohashEntries 指定的固定文件名入口（sentry.js、
// sw.js、Tooltip.js、DisplayController.js）是站内按名字引用的，改完要尽快生效，
// 只给短缓存。static.prts.wiki 的 CDN 在 /widgets/production/ 上开了「优先遵循
// 源站缓存策略」，两类文件的 CDN 缓存时长都以这里写进 OSS 的 Cache-Control 为准；
// 不写的话 CDN 会退回按 Last-Modified 估算（最多 1 小时）。
const HASHED_FILE_RE = /\.[\w-]{8}\.[^.]+(?:\.map)?$/;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const MUTABLE_CACHE_CONTROL = "public, max-age=300";

loadEnv({
  path: [path.join(__dirname, "../.env.dev"), path.join(__dirname, "../.env")],
  quiet: true,
});

const dirents = fs.readdirSync(path.join(__dirname, `../${BUILD_DIR}/`), {
  withFileTypes: true,
});

const filesNames = dirents
  .filter((dirent) => dirent.isFile())
  .map((dirent) => dirent.name);

const distSet = new Set(filesNames);
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

for (const file of distSet) {
  const cacheControl = HASHED_FILE_RE.test(file)
    ? IMMUTABLE_CACHE_CONTROL
    : MUTABLE_CACHE_CONTROL;
  const result = await store.put(
    path.posix.join(REMOTE_PATH, file),
    path.posix.join(`${BUILD_DIR}/`, file),
    { headers: { "Cache-Control": cacheControl } },
  );
  console.log(
    "[INFO] Uploaded",
    result.res.status,
    result.name,
    `(${cacheControl})`,
  );
}
