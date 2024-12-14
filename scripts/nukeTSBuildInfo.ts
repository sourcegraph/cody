import fs from 'node:fs'
import path from 'node:path'
/// <reference types="@types/bun" >
import { parseArgs } from 'node:util'

const HELP_TEXT = `
clean-ts-artifacts.ts - Clean up TypeScript build artifacts

This script removes leftover incremental build artifacts that can sometimes cause
stale TypeScript errors. It cleans:
- .tsbuildinfo files (TypeScript incremental build info)
- dist/ directories (compiled output)
- out/ directories (compiled output)

Usage:
  bun run scripts/clean-ts-artifacts.ts [options]

Options:
  --force    Actually delete the files (default: dry run only)
  --help     Show this help message
`
const IGNORED_PATHS = [
    '.test',
    'vscode/test-results',
    // Add more paths here
].map(p => path.normalize(p))

function shouldIgnorePath(pathToCheck: string): boolean {
    const relativePath = path.relative(process.cwd(), pathToCheck)
    return IGNORED_PATHS.some(
        ignorePath =>
            relativePath.startsWith(ignorePath) ||
            relativePath.includes(`${path.sep}${ignorePath}${path.sep}`)
    )
}

const args = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        force: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
    },
    allowPositionals: false,
})

if (args.values.help) {
    console.log(HELP_TEXT)
    process.exit(0)
}

function cleanTSArtifacts(dir: string, force: boolean): void {
    if (shouldIgnorePath(dir)) {
        return
    }
    let items: string[]
    try {
        items = fs.readdirSync(dir)
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.error(`⚠️  Directory not found: ${path.relative(process.cwd(), dir)}`)
            return
        }
        throw err
    }

    for (const item of items) {
        const fullPath = path.join(dir, item)
        let stat
        try {
            stat = fs.statSync(fullPath)
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                console.error(`⚠️  File not found: ${path.relative(process.cwd(), fullPath)}`)
                continue
            }
            throw err
        }

        if (stat.isDirectory() && !item.includes('node_modules')) {
            // Recurse into directories, excluding node_modules
            cleanTSArtifacts(fullPath, force)
        } else if (
            item.endsWith('.tsbuildinfo') ||
            (item === 'dist' && stat.isDirectory()) ||
            (item === 'out' && stat.isDirectory())
        ) {
            if (force) {
                try {
                    if (stat.isDirectory()) {
                        fs.rmSync(fullPath, { recursive: true, force: true })
                    } else {
                        fs.unlinkSync(fullPath)
                    }
                    console.log(`✓ Removed: ${path.relative(process.cwd(), fullPath)}`)
                } catch (err) {
                    console.error(`✗ Failed to remove ${path.relative(process.cwd(), fullPath)}:`, err)
                }
            } else {
                console.log(`Would remove: ${path.relative(process.cwd(), fullPath)}`)
            }
        }
    }
}

// Start cleaning from the current directory
console.log(
    args.values.force ? 'Cleaning artifacts...' : 'Dry run (use --force to actually delete)...\n'
)
cleanTSArtifacts(process.cwd(), args.values.force)
