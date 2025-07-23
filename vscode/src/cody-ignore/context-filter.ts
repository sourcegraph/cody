import { ContextFiltersProvider, type IsIgnored, contextFiltersProvider } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type CodyIgnoreFeature, showCodyIgnoreNotification } from './notification'

type IgnoreRecord = Record<string, boolean>

const excludeCache = new Map<string, IgnoreRecord>()
const fileWatchers = new Map<string, vscode.FileSystemWatcher>()

function getCacheKey(workspaceFolder: vscode.WorkspaceFolder | null): string {
    return workspaceFolder?.uri.toString() ?? 'no-workspace'
}

export async function initializeCache(workspaceFolder: vscode.WorkspaceFolder | null): Promise<void> {
    const cacheKey = getCacheKey(workspaceFolder)
    if (excludeCache.has(cacheKey)) {
        return
    }

    const useIgnoreFiles = vscode.workspace
        .getConfiguration('', workspaceFolder)
        .get<boolean>('search.useIgnoreFiles')

    let sgignoreExclude: IgnoreRecord = {}

    if (useIgnoreFiles && workspaceFolder) {
        sgignoreExclude = await readIgnoreFile(
            vscode.Uri.joinPath(workspaceFolder.uri, '.cody', 'ignore')
        )

        setupFileWatcher(workspaceFolder)
    }

    excludeCache.set(cacheKey, sgignoreExclude)
}

function setupFileWatcher(workspaceFolder: vscode.WorkspaceFolder): void {
    const filename = '.cody/ignore'
    const watcherKey = `${workspaceFolder.uri.toString()}:${filename}`
    if (fileWatchers.has(watcherKey)) {
        return
    }

    const pattern = new vscode.RelativePattern(workspaceFolder, filename)
    const watcher = vscode.workspace.createFileSystemWatcher(pattern)

    const updateCache = async () => {
        const cacheKey = getCacheKey(workspaceFolder)

        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filename)
        const ignoreData = await readIgnoreFile(fileUri)
        excludeCache.set(cacheKey, ignoreData)
    }

    watcher.onDidChange(updateCache)
    watcher.onDidCreate(updateCache)
    watcher.onDidDelete(() => {
        const cacheKey = getCacheKey(workspaceFolder)
        excludeCache.delete(cacheKey)
    })

    fileWatchers.set(watcherKey, watcher)
}

export async function getExcludePattern(
    workspaceFolder: vscode.WorkspaceFolder | null
): Promise<string> {
    await initializeCache(workspaceFolder)

    const config = vscode.workspace.getConfiguration('', workspaceFolder)
    const filesExclude = config.get<IgnoreRecord>('files.exclude', {})
    const searchExclude = config.get<IgnoreRecord>('search.exclude', {})

    const cacheKey = getCacheKey(workspaceFolder)
    const cached = excludeCache.get(cacheKey)
    const sgignoreExclude = cached ?? {}
    const mergedExclude: IgnoreRecord = {
        ...filesExclude,
        ...searchExclude,
        ...sgignoreExclude,
    }
    const excludePatterns = Object.keys(mergedExclude).filter(key => mergedExclude[key] === true)
    return `{${excludePatterns.join(',')}}`
}

export async function readIgnoreFile(uri: vscode.Uri): Promise<IgnoreRecord> {
    const ignore: IgnoreRecord = {}
    try {
        const data = await vscode.workspace.fs.readFile(uri)
        for (let line of Buffer.from(data).toString('utf-8').split('\n')) {
            if (line.startsWith('!')) {
                continue
            }

            // Strip comment and whitespace.
            line = line.replace(/\s*(#.*)?$/, '').trim()

            if (line === '') {
                continue
            }

            // Replace , with . that contain commas to avoid typos for entries such as
            // *,something
            if (line.includes(',')) {
                line = line.replace(',', '.')
            }

            if (line.endsWith('/')) {
                line = line.slice(0, -1)
            }
            if (!line.startsWith('/') && !line.startsWith('**/')) {
                line = `**/${line}`
            }
            ignore[line] = true
        }
    } catch {}
    return ignore
}

/**
 * Dispose all file watchers and clear caches. Call this when the extension is deactivated.
 */
function disposeFileWatchers(): void {
    for (const watcher of fileWatchers.values()) {
        watcher.dispose()
    }
    fileWatchers.clear()
    excludeCache.clear()
}

export async function isUriIgnoredByContextFilterWithNotification(
    uri: vscode.Uri,
    feature: CodyIgnoreFeature
): Promise<IsIgnored> {
    const isIgnored = await contextFiltersProvider.isUriIgnored(uri)
    if (isIgnored) {
        showCodyIgnoreNotification(feature, isIgnored)
    }
    return isIgnored
}

/**
 * Initialize the ContextFiltersProvider with exclude pattern getter.
 * Returns a disposable that cleans up the configuration when disposed.
 */
export function initializeContextFiltersProvider(): vscode.Disposable {
    // Set up exclude pattern getter for ContextFiltersProvider
    ContextFiltersProvider.excludePatternGetter = {
        getExcludePattern,
        getWorkspaceFolder: (uri: vscode.Uri) => vscode.workspace.getWorkspaceFolder(uri) ?? null,
    }

    // Return disposable that cleans up the configuration
    return {
        dispose: disposeFileWatchers,
    }
}
