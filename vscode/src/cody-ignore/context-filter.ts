import { ContextFiltersProvider, type IsIgnored, contextFiltersProvider } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { type CodyIgnoreFeature, showCodyIgnoreNotification } from './notification'

type IgnoreRecord = Record<string, boolean>

interface CachedExcludeData {
    gitignoreExclude: IgnoreRecord
    ignoreExclude: IgnoreRecord
    sgignoreExclude: IgnoreRecord
}

const excludeCache = new Map<string, CachedExcludeData>()
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

    let gitignoreExclude: IgnoreRecord = {}
    let ignoreExclude: IgnoreRecord = {}
    let sgignoreExclude: IgnoreRecord = {}

    if (useIgnoreFiles && workspaceFolder) {
        gitignoreExclude = await readIgnoreFile(vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore'))
        ignoreExclude = await readIgnoreFile(vscode.Uri.joinPath(workspaceFolder.uri, '.ignore'))
        sgignoreExclude = await readIgnoreFile(
            vscode.Uri.joinPath(workspaceFolder.uri, '.sourcegraph', '.ignore')
        )

        setupFileWatcher(workspaceFolder, '.gitignore')
        setupFileWatcher(workspaceFolder, '.ignore')
        setupFileWatcher(workspaceFolder, '.sourcegraph/.ignore')
    }

    excludeCache.set(cacheKey, { gitignoreExclude, ignoreExclude, sgignoreExclude })
}

function setupFileWatcher(workspaceFolder: vscode.WorkspaceFolder, filename: string): void {
    const watcherKey = `${workspaceFolder.uri.toString()}:${filename}`
    if (fileWatchers.has(watcherKey)) {
        return
    }

    const pattern = new vscode.RelativePattern(workspaceFolder, filename)
    const watcher = vscode.workspace.createFileSystemWatcher(pattern)

    const updateCache = async () => {
        const cacheKey = getCacheKey(workspaceFolder)
        const cached = excludeCache.get(cacheKey)
        if (!cached) return

        const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, filename)
        const ignoreData = await readIgnoreFile(fileUri)

        if (filename === '.gitignore') {
            cached.gitignoreExclude = ignoreData
        } else if (filename === '.ignore') {
            cached.ignoreExclude = ignoreData
        } else if (filename === '.sourcegraph/.ignore') {
            cached.sgignoreExclude = ignoreData
        }
    }

    watcher.onDidChange(updateCache)
    watcher.onDidCreate(updateCache)
    watcher.onDidDelete(() => {
        const cacheKey = getCacheKey(workspaceFolder)
        const cached = excludeCache.get(cacheKey)
        if (!cached) return

        if (filename === '.gitignore') {
            cached.gitignoreExclude = {}
        } else if (filename === '.ignore') {
            cached.ignoreExclude = {}
        } else if (filename === '.sourcegraph/.ignore') {
            cached.sgignoreExclude = {}
        }
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
    const gitignoreExclude = cached?.gitignoreExclude ?? {}
    const ignoreExclude = cached?.ignoreExclude ?? {}
    const sgignoreExclude = cached?.sgignoreExclude ?? {}

    const mergedExclude: IgnoreRecord = {
        ...filesExclude,
        ...searchExclude,
        ...gitignoreExclude,
        ...ignoreExclude,
        ...sgignoreExclude,
    }
    const excludePatterns = Object.keys(mergedExclude).filter(key => mergedExclude[key] === true)
    return `{${excludePatterns.join(',')}}`
}

async function readIgnoreFile(uri: vscode.Uri): Promise<IgnoreRecord> {
    const ignore: IgnoreRecord = {}
    try {
        const data = await vscode.workspace.fs.readFile(uri)
        for (let line of Buffer.from(data).toString('utf-8').split('\n')) {
            if (line.startsWith('!')) {
                continue
            }

            // Strip comment and trailing whitespace.
            line = line.replace(/\s*(#.*)?$/, '')

            if (line === '') {
                continue
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
