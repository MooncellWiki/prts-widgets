import { writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { create, login } from "./api.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function index(): Promise<void> {
  if (process.argv[2] === "-h" || process.argv.length < 5) {
    console.log("pnpm run create WidgetName username password");
    return;
  }

  let name = process.argv[2];
  name = name[0].toUpperCase() + name.slice(1);
  const username = process.argv[3];
  const password = process.argv[4];

  const entry = path.resolve(__dirname, `../src/entries/${name}.ts`);
  console.log(`${entry} created`);

  writeFileSync(
    entry,
    `import { createApp } from 'vue';
import 'virtual:uno.css';
import ${name} from '../widgets/${name}.vue';

const ele = document.getElementById('root');
if (ele?.dataset?.item) {
    createApp(${name}, { item: ele.dataset.item }).mount(ele);
} else {
    console.error('data-item or ele not found', ele);
}
  `,
  );

  const tmplEntry = path.resolve(__dirname, `../templates/${name}.html`);
  writeFileSync(
    tmplEntry,
    `<includeonly><div id="root"></div><head></head><script type="module" src="/src/entries/${name}.ts"></script></includeonly><noinclude>{{Documentation}}[[分类:由机器人维护的小部件]]</noinclude>`,
  );
  console.log(`${tmplEntry} created`);

  await login(username, password);
  console.log(`login as ${username}`);

  await create(
    `Widget:${name}`,
    `
<includeonly><div id="root"></div><!--inject your release script here--></includeonly><noinclude>{{Documentation}}[[分类:由机器人维护的小部件]]</noinclude>
  `,
  );
  console.log(`https://prts.wiki/w/Widget:${name} created`);

  await create(
    `Widget:${name}/doc`,
    `
[https://github.com/MooncellWiki/prts-widgets 源码]
{{#widget:${name}}}
  `,
  );
  console.log(`https://prts.wiki/w/Widget:${name}/doc created`);

  await create(
    `Widget:${name}/dev`,
    `
<includeonly>
<div id="root"></div>
<script type="module" src="http://localhost:8080/@vite/client"></script>
<script type="module" src="http://localhost:8080/src/entries/${name}.ts"></script>
</includeonly><noinclude>{{#widget:${name}/dev}}</noinclude>
  `,
  );
  console.log(`https://prts.wiki/w/Widget:${name}/dev created`);
  console.log("success!");
}

index();
