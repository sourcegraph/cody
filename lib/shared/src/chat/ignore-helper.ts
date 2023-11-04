import path from 'path'

import ignore, { Ignore } from 'ignore'

import { CODY_IGNORE_FILENAME } from './context-filter'

/**
 * A helper to efficiently check if a file should be ignored from a set
 * of nested ignore files.
 *
 * Callers must call `setIgnoreFiles` for each workspace root with the full set of ignore files
 * from the tree at startup (or when new workspace folders are added) and any time an ignore file is
 * modified/created/deleted.
 *
 * `clearIgnoreFiles` should be called for workspace roots as they are removed.
 */
export class IgnoreHelper {
    /**
     * A map of workspace roots to their ignore rules.
     */
    private workspaceIgnores = new Map<string, Ignore>()

    /**
     * Builds and caches a single ignore set for all nested ignore files within a workspace root.
     * @param workspaceRoot The full absolute path to the workspace root.
     * @param ignoreFiles The full absolute paths and content of all ignore files within the root.
     */
    public setIgnoreFiles(workspaceRoot: string, ignoreFiles: IgnoreFileContent[]): void {
        this.ensureAbsolute('workspaceRoot', workspaceRoot)

        const rules = this.getDefaultIgnores()
        for (const ignoreFile of ignoreFiles) {
            const ignoreFilePath = ignoreFile.filePath
            this.ensureValidCodyIgnoreFile('ignoreFile.path', ignoreFilePath)

            // Compute the relative path rom the workspace root to the folder this ignore
            // file applies to.
            const folderPath = ignoreFilePath.slice(0, -CODY_IGNORE_FILENAME.length)
            const relativeFolderPath = path.relative(workspaceRoot, folderPath)

            // Build the ignore rule with the relative folder path applied to the start of each rule.
            for (let ignoreLine of ignoreFile.content.split('\n')) {
                // Skip blanks/comments
                ignoreLine = ignoreLine.trim()
                if (!ignoreLine.length || ignoreLine.startsWith('#')) {
                    continue
                }

                let isInverted = false
                if (ignoreLine.startsWith('!')) {
                    ignoreLine = ignoreLine.slice(1)
                    isInverted = true
                }

                // Gitignores always use POSIX/forward slashes, even on Windows.
                const ignoreRule = relativeFolderPath.length
                    ? relativeFolderPath.replaceAll(path.sep, path.posix.sep) + path.posix.sep + ignoreLine
                    : ignoreLine
                rules.add((isInverted ? '!' : '') + ignoreRule)
            }
        }

        this.workspaceIgnores.set(workspaceRoot, rules)
    }

    public clearIgnoreFiles(workspaceRoot: string): void {
        this.workspaceIgnores.delete(workspaceRoot)
    }

    public isIgnored(workspaceRoot: string, filePath: string): boolean {
        this.ensureAbsolute('workspaceRoot', workspaceRoot)
        this.ensureAbsolute('filePath', filePath)

        const relativePath = path.relative(workspaceRoot, filePath)
        if (relativePath.startsWith('..')) {
            throw new Error(`filePath must be within workspaceRoot:
                               filePath: ${filePath}
                               workspaceRoot: ${workspaceRoot}`)
        }

        const rules = this.workspaceIgnores.get(workspaceRoot) ?? this.getDefaultIgnores()
        return rules.ignores(relativePath) ?? false
    }

    private ensureAbsolute(name: string, filePath: string): void {
        if (!path.isAbsolute(filePath)) {
            throw new Error(`${name} should be absolute: "${filePath}"`)
        }
    }

    private ensureValidCodyIgnoreFile(name: string, filePath: string): void {
        this.ensureAbsolute('ignoreFile.path', filePath)
        if (!filePath.endsWith(CODY_IGNORE_FILENAME)) {
            throw new Error(`${name} should end with "${CODY_IGNORE_FILENAME}": "${filePath}"`)
        }
    }

    private getDefaultIgnores(): Ignore {
        return ignore().add('.env')
    }
}

interface IgnoreFileContent {
    filePath: string
    content: string
}
