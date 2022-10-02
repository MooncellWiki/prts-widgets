import { writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { checkPageExist, edit, login } from './api.mjs';

async function index() {
    if (process.argv[2] === '-h' || process.argv.length < 5) {
        console.log('node .\\cli\\index.mjs widgetName username password');
        return;
    }
    const name = process.argv[2];
    if (await checkPageExist(`widget:${name}`)) {
        console.log(`https://prts.wiki/w/widget:${name} already exist!`);
        return;
    }
    const username = process.argv[3];
    const password = process.argv[4];
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const entry = path.resolve(__dirname, `../src/entries/${name}.tsx`);
    console.log(`${entry} created`);
    writeFileSync(
        entry,
        `
import { render } from "preact";
import "virtual:windi.css";

const ele = document.getElementById("root");
render(<div>hello world</div>, ele);
  `,
    );
    await login(username, password);
    console.log(`login as ${username}`);
    await edit(
        `Widget:${name}`,
        `
<includeonly><div id="root"></div><!--inject your release script here--></includeonly><noinclude>{{Documentation}}</noinclude>
  `,
    );
    console.log(`https://prts.wiki/w/Widget:${name} created`);
    await edit(
        `Widget:${name}/doc`,
        `
[https://github.com/MooncellWiki/prts-micro-frontends 源码]
{{#widget:${name}}}
  `,
    );
    console.log(`https://prts.wiki/w/Widget:${name}/doc created`);
    await edit(
        `Widget:${name}/dev`,
        `
<includeonly>
<div id="root"></div>
<script type="module" src="http://localhost:3000/@vite/client"></script>
<script type="module" src="http://localhost:3000/src/entries/${name}.tsx"></script>
</includeonly><noinclude>{{#widget:${name}/dev}}</noinclude>
  `,
    );
    console.log(`https://prts.wiki/w/Widget:${name}/dev created`);
    console.log(`success!`);
}
index();
