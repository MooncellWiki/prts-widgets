import fs from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";

const BUILD_DIR = "dist";
const isDistFiles = (file) => file.endsWith(".js") || file.endsWith(".js.map");

const __dirname = dirname(fileURLToPath(import.meta.url));
const distFiles = new Set(
  fs
    .readdirSync(join(__dirname, `../${BUILD_DIR}/`))
    .filter((ele) => isDistFiles(ele)),
);
console.log("[INFO] local js files:", distFiles);

const { REGION, ACCESS_KEY_ID, ACCESS_KEY_SECRET, BUCKET, REMOTE_PATH } =
  process.env;
const store = new OSS({
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

for (const file of distFiles) {
  const result = await store.put(
    posix.join(REMOTE_PATH, file),
    posix.join(`${BUILD_DIR}/`, file),
  );
  console.log("[INFO] Uploaded", result.res.status, result.name);
}
