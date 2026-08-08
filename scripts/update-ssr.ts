import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { config as loadEnv } from "dotenv";

import { edit, login } from "./api";

import type { shells as shellsType } from "../src/prerender";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../dist-ssr/index.js");

loadEnv({
  path: [path.join(__dirname, "../.env.dev"), path.join(__dirname, "../.env")],
  quiet: true,
});

const { PRTS_USERNAME, PRTS_PASSWORD } = process.env;

if (!PRTS_USERNAME || !PRTS_PASSWORD) {
  throw new Error(
    "Missing required environment variables: PRTS_USERNAME, PRTS_PASSWORD",
  );
}

if (!fs.existsSync(bundlePath)) {
  throw new Error(
    `SSR bundle not found at ${bundlePath}, run "pnpm run build" first`,
  );
}

const { shells } = (await import(pathToFileURL(bundlePath).href)) as {
  shells: typeof shellsType;
};

await login(PRTS_USERNAME, PRTS_PASSWORD);

for (const name of Object.keys(shells)) {
  const content = fs.readFileSync(
    path.join(__dirname, "../dist/templates/", `${name}.html`),
    { encoding: "utf8" },
  );
  await edit(
    `Widget:${name}/dev/ssr`,
    content
      .replace("<head>", "")
      .replace("</head>", "")
      .replace("{{Documentation}}", () => `{{#widget:${name}/dev/ssr}}`),
  );
  console.log(
    `[update-ssr] https://prts.wiki/w/Widget:${name}/dev/ssr updated`,
  );
}
