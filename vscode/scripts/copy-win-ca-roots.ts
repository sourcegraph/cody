import { copyFileSync } from 'node:fs'
import path from 'node:path'

copyFileSync(
    path.join(__dirname, '../../node_modules/win-ca/lib/roots.exe'),
    path.join(path.join(__dirname, '../dist'), 'win-ca-roots.exe')
)
