import ignore, { type Ignore } from 'ignore'
import { URI, Utils } from 'vscode-uri'

import { pathFunctionsForURI } from '../common/path'
import { isWindows } from '../common/platform'
import { uriBasename } from '../common/uri'
import { uriHasPrefix } from '../editor/displayPath'

/**
 * The Cody ignore URI path.
 */
export const CODY_IGNORE_URI_PATH = '.cody/ignore'

/**
 * A glob matching the Cody ignore URI path.
 */
export const CODY_IGNORE_POSIX_GLOB = `**/${CODY_IGNORE_URI_PATH}`

type ClientWorkspaceRootURI = string

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
export class IgnoreHelper {
    /**
     * A map of workspace roots to their ignore rules.
     */
    private workspaceIgnores = new Map<ClientWorkspaceRootURI, Ignore>()
    public hasCodyIgnoreFiles = false
    /**
     * Check if the configuration is enabled or not
     * Do not ignore files if the feature is not enabled
     * TODO: Remove this once it's ready for GA
     */
    public isActive = false
    public setActiveState(isActive: boolean): void {
        this.isActive = isActive
    }

    /**
     * Builds and caches a single ignore set for all nested ignore files within a workspace root.
     * @param workspaceRoot The workspace root.
     * @param ignoreFiles The URIs and content of all ignore files within the root.
     */
    public setIgnoreFiles(workspaceRoot: URI, ignoreFiles: IgnoreFileContent[]): void {
        if (!this.isActive) {
            return
        }

        this.ensureAbsolute('workspaceRoot', workspaceRoot)

        const rules = this.getDefaultIgnores()
        for (const ignoreFile of ignoreFiles) {
            this.ensureValidCodyIgnoreFile('ignoreFile.uri', ignoreFile.uri)

            // Compute the relative path from the workspace root to the folder this ignore
            // file applies to.
            const effectiveDir = ignoreFileEffectiveDirectory(ignoreFile.uri)
            const relativeFolderUriPath = pathFunctionsForURI(workspaceRoot).relative(
                workspaceRoot.path,
                effectiveDir.path
            )

            // Build the ignore rule with the relative folder path applied to the start of each rule.
            for (let ignoreLine of ignoreFile.content.split('\n')) {
                // Trim off any trailing comments.
                ignoreLine = ignoreLine.split('#')[0]

                // Skip any lines that are now empty.
                ignoreLine = ignoreLine.trim()
                if (!ignoreLine.length) {
                    continue
                }

                let isInverted = false
                if (ignoreLine.startsWith('!')) {
                    ignoreLine = ignoreLine.slice(1)
                    isInverted = true
                }

                // Gitignores always use POSIX/forward slashes, even on Windows.
                const ignoreRule = relativeFolderUriPath.length
                    ? `${relativeFolderUriPath}/${ignoreLine}`
                    : ignoreLine
                rules.add((isInverted ? '!' : '') + ignoreRule)
            }
        }

        this.workspaceIgnores.set(workspaceRoot.toString(), rules)
        if (ignoreFiles.length && !this.hasCodyIgnoreFiles) {
            this.hasCodyIgnoreFiles = true
        }
    }

    public clearIgnoreFiles(workspaceRoot: URI): void {
        this.workspaceIgnores.delete(workspaceRoot.toString())
    }

    public isIgnored(uri: URI): boolean {
        // Do not ignore if the feature is not enabled
        if (!this.isActive) {
            return false
        }

        // Return all https URIs on the assumption that they origin from
        // remote context (e.g. unified, multi-repo) files, which are already
        // filtered by the backend to respect codyignore files during sync time.
        if (uri.scheme === 'https') {
            return false
        }

        // Ignore all other non-file URIs
        if (uri.scheme !== 'file') {
            return true
        }

        this.ensureFileUri('uri', uri)
        this.ensureAbsolute('uri', uri)
        const workspaceRoot = this.findWorkspaceRoot(uri)

        // Not in workspace so just use default rules against the filename.
        // This ensures we'll never send something like `.env` but it won't handle
        // if default rules include folders like `a/b` because we have nothing to make
        // a relative path from.
        if (!workspaceRoot) {
            return this.getDefaultIgnores().ignores(uriBasename(uri))
        }

        const relativePath = pathFunctionsForURI(workspaceRoot).relative(workspaceRoot.path, uri.path)
        const rules = this.workspaceIgnores.get(workspaceRoot.toString()) ?? this.getDefaultIgnores()
        return rules.ignores(relativePath) ?? false
    }

    private findWorkspaceRoot(file: URI): URI | undefined {
        const candidates = Array.from(this.workspaceIgnores.keys()).filter(workspaceRoot =>
            uriHasPrefix(file, URI.parse(workspaceRoot), isWindows())
        )
        // If this file was inside multiple workspace roots, take the shortest one since it will include
        // everything the nested one does (plus potentially extra rules).
        candidates.sort((a, b) => a.length - b.length)
        const selected = candidates.at(0)
        return selected ? URI.parse(selected) : undefined
    }

    private ensureFileUri(name: string, uri: URI): void {
        if (uri.scheme !== 'file') {
            throw new Error(`${name} should be a file URI: "${uri}"`)
        }
    }

    private ensureAbsolute(name: string, uri: URI): void {
        if (!uri.path.startsWith('/')) {
            throw new Error(`${name} should be absolute: "${uri.toString()}"`)
        }
    }

    private ensureValidCodyIgnoreFile(name: string, uri: URI): void {
        this.ensureAbsolute('ignoreFile.uri', uri)
        if (!uri.path.endsWith(CODY_IGNORE_URI_PATH)) {
            throw new Error(`${name} should end with "${CODY_IGNORE_URI_PATH}": "${uri.toString()}"`)
        }
    }

    private getDefaultIgnores(): Ignore {
        return ignore().add('.env')
    }
}

export interface IgnoreFileContent {
    uri: URI
    content: string
}

/**
 * Return the directory that a .cody/ignore file applies to.
 */
export function ignoreFileEffectiveDirectory(ignoreFile: URI): URI {
    return Utils.joinPath(ignoreFile, '..', '..')
}
