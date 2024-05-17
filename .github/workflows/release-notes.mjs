import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const text = `| | |
|-|-|
${readdirSync("./dist")
  .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
  .map(
    (name) =>
      `|${name}|${Math.floor(statSync(path.join("./dist", name)).size / 1024)}KB|`,
  )
  .join("\r\n")}`;
writeFileSync("release-note.md", text);
