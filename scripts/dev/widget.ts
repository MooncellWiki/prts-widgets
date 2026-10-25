import { readFileSync } from "node:fs";
import path from "node:path";

const loader = readFileSync(
  path.join(import.meta.dirname, "loader.js"),
  "utf8",
);

/** 新建 Widget 时生成配套的开发页面。 */
export function devWidget(name: string): string {
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name))
    throw new Error("Widget 名称必须以字母开头，且只含字母和数字");

  return `<includeonly>
<div id="root"></div>
<script data-prts-dev-entry="${name}">
${loader}</script>
</includeonly><noinclude>{{#widget:${name}/dev}}</noinclude>
`;
}
