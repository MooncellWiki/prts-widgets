import path from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";
import { config as loadEnv } from "dotenv";

import {
  collectPublishFiles,
  listRemoteFiles,
  obsoleteFiles,
  remotePrefix,
} from "./deploy/files";
import { legacyFiles } from "./legacy";

const BUILD_DIR = "dist";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv({
  path: [path.join(__dirname, "../.env.dev"), path.join(__dirname, "../.env")],
  quiet: true,
});

const distSet = new Set(
  collectPublishFiles(path.join(__dirname, "..", BUILD_DIR)),
);
console.log("[INFO] Dist set:", distSet);

// 旧皮肤上的干员一览 / 公招计算 / 敌人一览 / 道具一览直接引改版前的构建产物（见 scripts/legacy），不在本次 dist 里也得留着
const legacySet = legacyFiles();

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
const remoteFiles = await listRemoteFiles(store, prefix);
console.log("[INFO] List result:", remoteFiles);
const removingFiles = obsoleteFiles(remoteFiles, prefix, distSet, legacySet);

console.log("[INFO] Removing files:", removingFiles);

if (removingFiles.length === 0) {
  console.log("[INFO] No files to remove.");
} else {
  // OSS DeleteMultipleObjects 单次最多 1000 个对象。
  for (let offset = 0; offset < removingFiles.length; offset += 1000) {
    const deleteResult = await store.deleteMulti(
      removingFiles.slice(offset, offset + 1000),
    );
    console.log("[INFO] Delete result:", deleteResult.deleted);
  }
}
