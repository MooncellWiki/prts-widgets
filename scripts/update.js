import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { edit, login } from "./api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  if (process.argv[2] === "-h" || process.argv.length < 3) {
    console.log(String.raw`node .\cli\update.mjs username password`);
    return;
  }
  const username = process.argv[2];
  const password = process.argv[3];
  await login(username, password);
  const tmpls = fs.readdirSync(path.join(__dirname, "../dist/templates/"));
  await Promise.allSettled(
    tmpls.map((tmpl) => {
      const name = tmpl.replace(".html", "");
      let content = fs.readFileSync(
        path.join(__dirname, "../dist/templates/", tmpl),
        {
          encoding: "utf8",
        },
      );
      return edit(
        `Widget:${name}`,
        content.replace("<head>", "").replace("</head>", ""),
      );
    }),
  );
}

main();
