import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";

const BUILD_DIR = "dist";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  const result = await store.put(
    path.posix.join(REMOTE_PATH, file),
    path.posix.join(`${BUILD_DIR}/`, file),
  );
  console.log("[INFO] Uploaded", result.res.status, result.name);
}
