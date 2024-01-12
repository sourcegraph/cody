import path from 'path'

import ignore, { type Ignore } from 'ignore'
import { type URI } from 'vscode-uri'

/**
 * The Cody ignore file path in the native platform style (backslashes on Windows).
 *
 * e.g: `C:\\Users\\me\\my-project\\.cody\\ignore` or `Users/username/my-project/.cody/ignore`
 */
export const CODY_IGNORE_FILENAME = path.join('.cody', 'ignore')

/**
 * The Cody ignore file path in POSIX style (always forward slashes).
 */
export const CODY_IGNORE_FILENAME_POSIX_GLOB = path.posix.join('**', '.cody', 'ignore')

/**
 * A helper to efficiently check if a file should be ignored from a set
 * of nested ignore files.
 *
 * Callers must call `setIgnoreFiles` for each workspace root with the full set of ignore files (even
 * if there are zero) at startup (or when new workspace folders are added) and any time an ignore file
 * is modified/created/deleted.
 *
 * `clearIgnoreFiles` should be called for workspace roots as they are removed.
 */
type ClientWorkspaceRoot = string
export class IgnoreHelper {
    /**
     * A map of workspace roots to their ignore rules.
     */
    private workspaceIgnores = new Map<ClientWorkspaceRoot, Ignore>()

    /**
     * Check if the configuration is enabled or not
     * Do not ignore files if the feature is not enabled
     * TODO: Remove this once it's ready for GA
     */
    private isActive = false
    public setActiveState(isActive: boolean): void {
        this.isActive = isActive
    }

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

            // Compute the relative path from the workspace root to the folder this ignore
            // file applies to.
            const folderPath = ignoreFilePath.slice(0, -CODY_IGNORE_FILENAME.length)
            const relativeFolderPath = path.relative(workspaceRoot, folderPath)

            // Build the ignore rule with the relative folder path applied to the start of each rule.
            for (let ignoreLine of ignoreFile.content.split('\n')) {
                // Skip blanks/ comments
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

    public isIgnored(uri: URI): boolean {
        // Do not ignore if the feature is not enabled
        if (!this.isActive) {
            return false
        }

        // Ignore all non-file URIs
        if (uri.scheme !== 'file') {
            return true
        }

        this.ensureFileUri('uri', uri)
        this.ensureAbsolute('uri.fsPath', uri.fsPath)
        const workspaceRoot = this.findWorkspaceRoot(uri.fsPath)

        // Not in workspace so just use default rules against the filename.
        // This ensures we'll never send something like `.env` but it won't handle
        // if default rules include folders like `a/b` because we have nothing to make
        // a relative path from.
        if (!workspaceRoot) {
            return this.getDefaultIgnores().ignores(path.basename(uri.fsPath))
        }

        const relativePath = path.relative(workspaceRoot, uri.fsPath)
        const rules = this.workspaceIgnores.get(workspaceRoot) ?? this.getDefaultIgnores()
        return rules.ignores(relativePath) ?? false
    }

    private findWorkspaceRoot(filePath: string): string | undefined {
        const candidates = Array.from(this.workspaceIgnores.keys()).filter(workspaceRoot =>
            filePath.toLowerCase().startsWith(workspaceRoot.toLowerCase())
        )
        // If this file was inside multiple workspace roots, take the shortest one since it will include
        // everything the nested one does (plus potentially extra rules).
        candidates.sort((a, b) => a.length - b.length)
        return candidates.at(0)
    }

    private ensureFileUri(name: string, uri: URI): void {
        if (uri.scheme !== 'file') {
            throw new Error(`${name} should be a file URI: "${uri}"`)
        }
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
