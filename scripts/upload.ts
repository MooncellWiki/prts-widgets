import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";
import { config as loadEnv } from "dotenv";

const BUILD_DIR = "dist";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 文件名里带构建 hash（base64url，8 位）的产物内容不可变，可以让 CDN 和浏览器
// 永久缓存。vite.config.ts 里 nohashEntries 指定的固定文件名入口（sentry.js、
// sw.js、Tooltip.js、DisplayController.js）是站内按名字引用的，改完要立刻生效，
// 所以保持 OSS 默认缓存策略不动。
const HASHED_FILE_RE = /\.[\w-]{8}\.[^.]+(?:\.map)?$/;
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

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

const { REGION, ACCESS_KEY_ID, ACCESS_KEY_SECRET, BUCKET, REMOTE_PATH } =
  process.env;

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
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

for (const file of distSet) {
  const immutable = HASHED_FILE_RE.test(file);
  const result = await store.put(
    path.posix.join(REMOTE_PATH, file),
    path.posix.join(`${BUILD_DIR}/`, file),
    immutable
      ? { headers: { "Cache-Control": IMMUTABLE_CACHE_CONTROL } }
      : undefined,
  );
  console.log(
    "[INFO] Uploaded",
    result.res.status,
    result.name,
    immutable ? "(immutable)" : "",
  );
}
