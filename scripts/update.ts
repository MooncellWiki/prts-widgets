import fs from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { edit, login } from './api.js'
const __dirname = dirname(fileURLToPath(import.meta.url))
function readDist() {
  const json = fs.readFileSync(join(__dirname, '../dist/manifest.json'), {
    encoding: 'utf8',
  })
  const manifest: Record<string, { file: string }> = JSON.parse(json)
  const result: Record<string, { fileName: string; content: string }> = {}
  Object.values(manifest).forEach((v) => {
    const name = v.file.split('.')[0]
    result[name] = {
      fileName: v.file,
      content: fs.readFileSync(join(__dirname, '../dist/', v.file), {
        encoding: 'utf8',
      }),
    }
  })
  return result
}
async function main() {
  if (process.argv[2] === '-h' || process.argv.length < 3) {
    console.log('node .\\cli\\update.mjs username password')
    return
  }
  const dist = readDist()
  const username = process.argv[2]
  const password = process.argv[3]
  await login(username, password)
  const tmpls = fs.readdirSync(join(__dirname, '../templates/'))
  await Promise.allSettled(
    tmpls.map((tmpl) => {
      const name = tmpl.replace('.html', '')
      let content = fs.readFileSync(join(__dirname, '../templates/', tmpl), {
        encoding: 'utf8',
      })

      const script: string = dist[name].content
        .replaceAll(
          'sourceMappingURL=',
          'sourceMappingURL=https://static.prts.wiki/widgets/release/',
        )
        .trim()
      content = content
        .replaceAll('__SCRIPT_CONTENT__', script)
        .replaceAll(
          '__SCRIPT_PATH__',
          `https://static.prts.wiki/widgets/release/${dist[name].fileName}`,
        )
      return edit(`Widget:${name}`, content)
    }),
  )
}

main()
