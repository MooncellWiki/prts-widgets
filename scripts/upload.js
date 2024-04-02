import fs from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";

const BUILD_DIR = "dist";
const __dirname = dirname(fileURLToPath(import.meta.url));

const dirents = fs.readdirSync(join(__dirname, `../${BUILD_DIR}/`), {
  withFileTypes: true,
});
const filesNames = dirents
  .filter((dirent) => dirent.isFile())
  .map((dirent) => dirent.name);
const distSet = new Set(filesNames);
console.log("[INFO] Dist set:", distSet);

const { REGION, ACCESS_KEY_ID, ACCESS_KEY_SECRET, BUCKET, REMOTE_PATH } =
  process.env;
const store = new OSS({
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

for (const file of distSet) {
  const result = await store.put(
    posix.join(REMOTE_PATH, file),
    posix.join(`${BUILD_DIR}/`, file),
  );
  console.log("[INFO] Uploaded", result.res.status, result.name);
}
