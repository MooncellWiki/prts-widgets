import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { RenderedShell, shells as shellsType } from "../src/prerender";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundlePath = path.join(__dirname, "../dist-ssr/index.js");
const templatesDir = path.join(__dirname, "../dist/templates");

if (!fs.existsSync(bundlePath)) {
  throw new Error(
    `SSR bundle not found at ${bundlePath}, run "vite build -c vite.config.prerender.ts" first`,
  );
}

const { renderShell, shells } = (await import(
  pathToFileURL(bundlePath).href
)) as {
  renderShell: (name: string) => Promise<RenderedShell | null>;
  shells: typeof shellsType;
};

for (const name of Object.keys(shells)) {
  const templatePath = path.join(templatesDir, `${name}.html`);
  if (!fs.existsSync(templatePath)) {
    console.warn(`[prerender] template not found, skipped: ${templatePath}`);
    continue;
  }

  const rendered = await renderShell(name);
  if (!rendered) continue;
  const { html, styles, container } = rendered;

  const source = fs.readFileSync(templatePath, { encoding: "utf8" });
  const containerPattern = new RegExp(`(<div id="${container}"[^>]*>)(</div>)`);
  if (!containerPattern.test(source)) {
    console.warn(
      `[prerender] container #${container} not found in ${name}.html, skipped`,
    );
    continue;
  }

  let result = source.replace(
    containerPattern,
    (_, open: string, close: string) => `${open}${html}${close}`,
  );
  if (styles) result = result.replace("</head>", () => `${styles}</head>`);

  fs.writeFileSync(templatePath, result);
  console.log(
    `[prerender] ${name}: +${(html.length / 1024).toFixed(1)}KiB html, +${(
      styles.length / 1024
    ).toFixed(1)}KiB styles`,
  );
}
