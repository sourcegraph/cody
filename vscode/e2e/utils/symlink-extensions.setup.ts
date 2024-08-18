import fs from 'node:fs/promises'
import path from 'node:path'
import { test as setup } from '@playwright/test'
import { CODY_VSCODE_ROOT_DIR } from './helpers'

//TODO: make options with nice descriptions and validation
export type SymlinkExtensions =
    | {
          vscodeExtensionCacheDir: string
          symlinkExtensions: [string, ...string[]]
      }
    | {
          vscodeExtensionCacheDir?: string
          symlinkExtensions?: [] | null // these paths will get symlinked to the shared extension cache as pre-installed extensions
      }

// biome-ignore lint/complexity/noBannedTypes: <explanation>
setup.extend<{}, SymlinkExtensions>({
    vscodeExtensionCacheDir: [undefined, { scope: 'worker', option: true }],
    symlinkExtensions: [undefined, { scope: 'worker', option: true }],
})('symlink extensions', async ({ vscodeExtensionCacheDir, symlinkExtensions }) => {
    if (typeof vscodeExtensionCacheDir === 'string') {
        await fs.mkdir(vscodeExtensionCacheDir, { recursive: true })
    }
    if (!symlinkExtensions || symlinkExtensions.length === 0) {
        return
    }
    if (typeof vscodeExtensionCacheDir !== 'string') {
        throw new TypeError('vscodeTmpDir is required to symlink extensions')
    }
    if (vscodeExtensionCacheDir) {
        vscodeExtensionCacheDir = path.resolve(CODY_VSCODE_ROOT_DIR, vscodeExtensionCacheDir)
        await fs.mkdir(vscodeExtensionCacheDir, { recursive: true })
    }
    for (const extension of symlinkExtensions) {
        const absoluteDir = path.resolve(CODY_VSCODE_ROOT_DIR, extension)
        //read the package.json as json
        const packageJsonPath = await fs.readFile(path.join(absoluteDir, 'package.json'))
        const packageJson = JSON.parse(packageJsonPath.toString())
        const { publisher, name, version } = packageJson
        if (!publisher || !name || !version) {
            throw new TypeError(
                `package.json for extension ${extension} must have publisher, name, and version`
            )
        }
        try {
            // we look for any extensions with that same name (because they could be an older version)
            const extensions = await fs.readdir(vscodeExtensionCacheDir)
            const removePromises = [
                fs.unlink(path.join(vscodeExtensionCacheDir, 'extensions.json')).catch(() => void 0),
                fs.unlink(path.join(vscodeExtensionCacheDir, '.obsolete')).catch(() => void 0),
            ]
            for (const extension of extensions) {
                if (path.basename(extension).startsWith(`${publisher}.${name}-`)) {
                    // check if this is a symlink or a directory
                    const extensionPath = path.join(vscodeExtensionCacheDir, extension)
                    console.log(extensionPath)
                    removePromises.push(
                        fs.lstat(extensionPath).then(async stat => {
                            if (stat.isSymbolicLink()) {
                                await fs.unlink(extensionPath)
                            }
                            await fs.rm(extensionPath, { force: true, recursive: true })
                        })
                    )
                }
            }
            await Promise.all(removePromises)
        } catch {
            //ignore
        }
        await fs.symlink(
            absoluteDir,
            path.join(vscodeExtensionCacheDir, `${publisher}.${name}-${version}`),
            'dir'
        )
    }
})
