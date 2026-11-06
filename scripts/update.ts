import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { edit, type EditResult, login } from "./api";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "../dist/templates/");

// 以前所有页面一次并发提交，每次都有一批随机页面请求失败，又被 Promise.allSettled
// 吞掉，CI 照样是绿的。现在逐个提交，失败的隔一会儿重试。
const RETRY_DELAYS_MS = [5000, 15_000];

function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  // fetch 网络错误的 message 只有 "fetch failed"，具体原因在 cause 里
  const { cause } = error;
  return cause instanceof Error
    ? `${error.message}（${cause.message}）`
    : error.message;
}

async function editWithRetry(
  title: string,
  content: string,
): Promise<EditResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await edit(title, content);
    } catch (error) {
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) throw error;
      console.warn(
        `[update] ${title} 第 ${attempt + 1} 次提交失败，${delay / 1000}s 后重试：${describeError(error)}`,
      );
      await sleep(delay);
    }
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "-h" || process.argv.length < 4) {
    console.log("tsx scripts/update.ts username password");
    return;
  }

  const username = process.argv[2];
  const password = process.argv[3];

  await login(username, password);

  const failed: string[] = [];
  for (const tmpl of fs.readdirSync(TEMPLATES_DIR)) {
    const title = `Widget:${tmpl.replace(".html", "")}`;
    const content = fs
      .readFileSync(path.join(TEMPLATES_DIR, tmpl), { encoding: "utf8" })
      .replace("<head>", "")
      .replace("</head>", "");

    try {
      const result = await editWithRetry(title, content);
      console.log(
        `[update] ${title} ${result.nochange ? "无变化" : `已更新（rev ${result.newrevid}）`}`,
      );
    } catch (error) {
      failed.push(title);
      console.error(`[update] ${title} 更新失败：${describeError(error)}`);
    }
  }

  if (failed.length > 0) {
    console.error(
      `[update] ${failed.length} 个页面更新失败：${failed.join("、")}`,
    );
    process.exitCode = 1;
  }
}

await main();
