import fs from "node:fs";
import path from "node:path";

import type OSS from "ali-oss";

/** OSS 产物清单：保留 POSIX 相对路径，Wiki 模板和构建元数据不发布。 */
export function collectPublishFiles(buildDir: string): string[] {
  const files: string[] = [];
  function walk(relative: string) {
    for (const entry of fs.readdirSync(path.join(buildDir, relative), {
      withFileTypes: true,
    })) {
      if (entry.name.startsWith(".")) continue;
      if (!relative && entry.name === "templates") continue;
      const name = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  walk("");
  return files.sort();
}

// 固定页面/入口五分钟缓存；Vite 的 8 位 hash 资源内容不可变。
export function cacheControlFor(file: string): string {
  return /\.[\w-]{8}\.[^.]+(?:\.map)?$/.test(path.posix.basename(file))
    ? "public, max-age=31536000, immutable"
    : "public, max-age=300";
}

/** 末尾必须有 /，避免 production 前缀误匹配 production-backup。 */
export function remotePrefix(remotePath: string): string {
  const prefix = remotePath.replace(/^\/+|\/+$/g, "");
  if (!prefix) throw new Error("REMOTE_PATH must name a non-root directory");
  return `${prefix}/`;
}

type ObjectLister = {
  listV2: (
    query: OSS.ListV2ObjectsQuery,
  ) => Promise<
    Pick<
      OSS.ListV2ObjectResult,
      "objects" | "isTruncated" | "nextContinuationToken"
    >
  >;
};

/** 不传 delimiter，列出所有子目录；收齐清单后才允许进入删除阶段。 */
export async function listRemoteFiles(
  store: ObjectLister,
  prefix: string,
): Promise<string[]> {
  const names: string[] = [];
  let token: string | undefined;
  const seenTokens = new Set<string>();
  for (;;) {
    const result = await store.listV2({
      prefix,
      "max-keys": 1000,
      ...(token ? { "continuation-token": token } : {}),
    });
    names.push(...(result.objects ?? []).map((object) => object.name));
    if (!result.isTruncated) return names;
    token = result.nextContinuationToken;
    if (!token || seenTokens.has(token))
      throw new Error(
        "OSS listing is truncated without a new continuation token",
      );
    seenTokens.add(token);
  }
}

export function obsoleteFiles(
  remoteNames: readonly string[],
  prefix: string,
  published: ReadonlySet<string>,
  legacy: ReadonlySet<string>,
): string[] {
  return remoteNames.filter((name) => {
    if (!name.startsWith(prefix) || name.endsWith("/")) return false;
    const relative = name.slice(prefix.length);
    return (
      !published.has(relative) && !legacy.has(relative.replace(/\.map$/, ""))
    );
  });
}
