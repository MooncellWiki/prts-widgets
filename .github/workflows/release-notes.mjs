import { readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

const text
  = `| | |
|-|-|
${
  readdirSync('./dist')
    .filter(name => name.endsWith('.js') || name.endsWith('.css'))
    .map(
      name =>
        `|${name}|${Math.floor(statSync(join('./dist', name)).size / 1024)}KB|`,
    )
    .join('\r\n')}`
writeFileSync('release-note.md', text)
