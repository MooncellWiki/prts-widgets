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
const store = new OSS({
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

//List REMOTE_PATH dir objects, not including subdirs
const result = await store.listV2({
  prefix: REMOTE_PATH,
  delimiter: "/",
  "max-keys": 1000,
});
console.log(
  "[INFO] List result:",
  result.objects.map((object) => object.name),
);

const removingFiles = result.objects
  .filter(
    (object) =>
      !distSet.has(object.name.replace(REMOTE_PATH, "")) &&
      object.name !== REMOTE_PATH,
  )
  .map((file) => file.name);
console.log("[INFO] Removing files:", removingFiles);

if (removingFiles.length === 0) {
  console.log("[INFO] No files to remove.");
} else {
  const deleteResult = await store.deleteMulti(removingFiles);
  console.log("[INFO] Delete result:", deleteResult.deleted);
}
