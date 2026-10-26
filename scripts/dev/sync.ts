import { readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

import { edit, getContent, login } from "../api";

import { syncDevPage } from "./widget";

const SUMMARY = "dev 页面改为按 URL 的 vitePort 连接本地 Vite";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [username, password] = args.filter((arg) => arg !== "--dry-run");
  if (args.includes("-h") || (!dryRun && !password)) {
    console.log("pnpm dev:sync --dry-run");
    console.log("pnpm dev:sync username password");
    return;
  }

  if (!dryRun) await login(username, password);

  const names = readdirSync(path.join(import.meta.dirname, "../../templates/"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => file.slice(0, -5));

  for (const name of names) {
    const title = `Widget:${name}/dev`;
    const page = await getContent(title);
    if (page === undefined) {
      console.log(`[跳过] ${title} 不存在`);
      continue;
    }

    let synced: string;
    try {
      synced = syncDevPage(page);
    } catch (error) {
      console.log(`[跳过] ${title}：${(error as Error).message}`);
      continue;
    }
    if (synced === page) {
      console.log(`[不变] ${title}`);
      continue;
    }

    if (!dryRun) await edit(title, synced, SUMMARY);
    console.log(`[${dryRun ? "待更新" : "已更新"}] ${title}`);
  }
}

main();
