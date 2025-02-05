import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

const DIST_DIRECTORY = path.join(__dirname, '../dist')
const FONT_PATH = path.join(__dirname, '../resources/DejaVuSansMono.ttf')

export async function main(): Promise<void> {
    try {
        copyFonts()
        console.log('Fonts were successfully copied to dist directory')
    } catch (error) {
        console.error('Error copying fonts:', error)
        process.exit(1)
    }
}

void main()

function copyFonts(): void {
    const hasDistDir = existsSync(DIST_DIRECTORY)

    if (!hasDistDir) {
        mkdirSync(DIST_DIRECTORY)
    }

    copyFileSync(FONT_PATH, path.join(DIST_DIRECTORY, 'DejaVuSansMono.ttf'))
}
