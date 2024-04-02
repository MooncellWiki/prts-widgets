import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";

const __dirname = dirname(fileURLToPath(import.meta.url));
const localJSFiles = new Set(
  fs
    .readdirSync(join(__dirname, "../dist/"))
    .filter((file) => file.endsWith(".js")),
);
console.log("[INFO] local js files:", localJSFiles);

const { REGION, ACCESS_KEY_ID, ACCESS_KEY_SECRET, BUCKET, REMOTE_PATH } =
  process.env;
const store = new OSS({
  region: REGION,
  accessKeyId: ACCESS_KEY_ID,
  accessKeySecret: ACCESS_KEY_SECRET,
  bucket: BUCKET,
});

//List REMOTE_PATH dir objects, not including subdirs
const result = await store.listV2({ prefix: REMOTE_PATH, delimiter: "/" });
const removingFiles = result.objects.filter(
  (object) =>
    object.name.endsWith(".js") &&
    !localJSFiles.has(object.name.replace(REMOTE_PATH, "")),
);
console.log("[INFO] removing files:", removingFiles);
const deleteResult = await store.deleteMulti(
  removingFiles.map((file) => file.name),
);
console.log("[INFO] delete result:", deleteResult);
