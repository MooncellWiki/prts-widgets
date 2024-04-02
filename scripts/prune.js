import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import OSS from "ali-oss";

const isDistFiles = (file) => file.endsWith(".js") || file.endsWith(".js.map");

const __dirname = dirname(fileURLToPath(import.meta.url));
const localDistFiles = new Set(
  fs.readdirSync(join(__dirname, "../dist/")).filter((ele) => isDistFiles(ele)),
);
console.log("[INFO] local js files:", localDistFiles);

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
console.log(
  "[INFO] list result:",
  result.objects.map((object) => object.name),
);

const removingFiles = result.objects
  .filter(
    (object) =>
      isDistFiles(object.name) &&
      !localDistFiles.has(object.name.replace(REMOTE_PATH, "")),
  )
  .map((file) => file.name);
console.log("[INFO] removing files:", removingFiles);

const deleteResult = await store.deleteMulti(removingFiles);
console.log("[INFO] delete result:", deleteResult.deleted);
