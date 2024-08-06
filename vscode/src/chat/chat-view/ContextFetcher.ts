import path from 'node:path'
import {
    type ContextItem,
    ContextItemSource,
    type ContextSearchResult,
    type PromptString,
    type SourcegraphCompletionsClient,
    graphqlClient,
    isFileURI,
} from '@sourcegraph/cody-shared'
import { isError } from 'lodash'
import * as vscode from 'vscode'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import { rewriteKeywordQuery } from '../../local-context/rewrite-keyword-query'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { gitLocallyModifiedFiles } from '../../repository/git-extension-api'
import type { Root } from './context'

interface ContextQuery {
    userQuery: PromptString
    roots: Root[]
}

interface RewrittenQuery extends ContextQuery {
    rewritten: string
}

export class ContextFetcher implements vscode.Disposable {
    constructor(
        private editor: VSCodeEditor,
        private symf: SymfRunner | undefined,
        private llms: SourcegraphCompletionsClient
    ) {}

    public dispose(): void {
        this.symf?.dispose()
    }

    public async fetchContext(query: ContextQuery, signal?: AbortSignal): Promise<ContextItem[]> {
        const rewritten = await rewriteKeywordQuery(this.llms, query.userQuery, signal)
        const rewrittenQuery = {
            ...query,
            rewritten,
        }

        // Fetch context from locally edited files
        const localRoots: vscode.Uri[] = []
        for (const root of query.roots) {
            if (!root.local) {
                continue
            }
            localRoots.push(root.local)
        }
        const changedFilesByRoot = await Promise.all(
            localRoots.map(root => gitLocallyModifiedFiles(root, signal))
        )
        const changedFiles = changedFilesByRoot.flat()

        const [liveContext, indexedContext] = await Promise.all([
            this.fetchLiveContext(rewrittenQuery, changedFiles, signal),
            this.fetchIndexedContext(rewrittenQuery, signal),
        ])

        const { keep: filteredIndexedContext } = filterLocallyModifiedFilesOutOfRemoteContext(
            query.roots,
            changedFilesByRoot,
            indexedContext
        )

        return [...liveContext, ...filteredIndexedContext]
    }

    private async fetchLiveContext(
        query: RewrittenQuery,
        files: string[],
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        if (files.length === 0) {
            return []
        }
        if (!this.symf) {
            logDebug('ContextFetcher', 'symf not available, skipping live context')
            return []
        }
        const results = await this.symf.getLiveResults(query.userQuery, query.rewritten, files, signal)
        return (
            await Promise.all(
                results.map(async (r): Promise<ContextItem | ContextItem[]> => {
                    signal?.throwIfAborted()
                    const range = new vscode.Range(
                        r.range.startPoint.row,
                        r.range.startPoint.col,
                        r.range.endPoint.row,
                        r.range.endPoint.col
                    )
                    let text: string | undefined
                    try {
                        text = await this.editor.getTextEditorContentForFile(r.file, range)
                    } catch (error) {
                        logError('ChatController.searchSymf', `Error getting file contents: ${error}`)
                        return []
                    }
                    return {
                        type: 'file',
                        uri: r.file,
                        range,
                        source: ContextItemSource.Search,
                        content: text,
                    }
                })
            )
        ).flat()
    }

    private async fetchIndexedContext(
        query: RewrittenQuery,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const repoIDs = query.roots
            .flatMap(r => r.remoteRepo?.id)
            .filter((id): id is string => id !== undefined)
        const result = await graphqlClient.contextSearch(repoIDs, query.rewritten, signal)
        if (isError(result)) {
            throw result
        }
        return result?.flatMap(r => contextSearchResultToContextItem(r) ?? []) ?? []
    }
}

function contextSearchResultToContextItem(result: ContextSearchResult): ContextItem | undefined {
    if (result.startLine < 0 || result.endLine < 0) {
        logDebug(
            'ContextFetcher',
            'ignoring server context result with invalid range',
            result.repoName,
            result.uri.toString()
        )
        return undefined
    }
    return {
        type: 'file',
        content: result.content,
        range: new vscode.Range(result.startLine, 0, result.endLine, 0),
        uri: result.uri,
        source: ContextItemSource.Unified,
        repoName: result.repoName,
        title: result.path,
        revision: result.commit,
    }
}

/**
 * Return a filtered list of remoteContextItems with the local files from
 * each root removed.
 */
export function filterLocallyModifiedFilesOutOfRemoteContext(
    roots: Root[],
    localFilesByRoot: string[][],
    remoteContextItems: ContextItem[]
): { keep: ContextItem[]; remove: ContextItem[] } {
    // Construct map from repo name to local files to filter out of remote context
    const repoNameToLocalFiles: Map<string, Set<string>> = new Map()
    for (let i = 0; i < roots.length; i++) {
        const remoteRepo = roots[i].remoteRepo
        if (!remoteRepo) {
            continue
        }

        const localRoot = roots[i].local
        if (!localRoot || !isFileURI(localRoot)) {
            continue
        }

        const relLocalFiles: Set<string> = new Set()
        for (const localFile of localFilesByRoot[i]) {
            relLocalFiles.add(path.relative(localRoot.fsPath, localFile))
        }
        repoNameToLocalFiles.set(remoteRepo.name, relLocalFiles)
    }

    const keep: ContextItem[] = []
    const remove: ContextItem[] = []
    for (const item of remoteContextItems) {
        if (!item.repoName) {
            keep.push(item)
            continue
        }
        const localFiles = repoNameToLocalFiles.get(item.repoName)
        if (!localFiles) {
            keep.push(item)
            continue
        }
        if (item.type === 'file' && item.title && localFiles.has(item.title)) {
            remove.push(item)
            continue
        }
        keep.push(item)
    }
    return { keep, remove }
}
