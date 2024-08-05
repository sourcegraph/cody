import path from 'node:path'
import {
    type ContextItem,
    ContextItemSource,
    type ContextSearchResult,
    type PromptString,
    type SourcegraphCompletionsClient,
    getContextForChatMessage,
    graphqlClient,
    isFileURI,
} from '@sourcegraph/cody-shared'
import { isError } from 'lodash'
import * as vscode from 'vscode'
import { getConfiguration } from '../../configuration'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import { rewriteKeywordQuery } from '../../local-context/rewrite-keyword-query'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { gitLocallyModifiedFiles } from '../../repository/git-extension-api'
import { type Root, getContextStrategy, resolveContext } from './context'

interface ContextQuery {
    userQuery: PromptString
    mentions: ContextItem[]
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
        const repoIDsOnRemote: string[] = []
        const localRootURIs: vscode.Uri[] = []
        for (const root of query.roots) {
            if (root.remoteRepo?.id) {
                repoIDsOnRemote.push(root.remoteRepo.id)
            } else if (root.local) {
                localRootURIs.push(root.local)
            } else {
                throw new Error(
                    `Codebase root ${JSON.stringify(root)} is missing both remote and local root`
                )
            }
        }

        const remoteResultsPromise = this.fetchIndexedContextFromRemote(
            repoIDsOnRemote,
            query.rewritten,
            signal
        )
        const localResultsPromise = this.fetchIndexedContextLocally(query, signal)

        const [remoteResults, localResults] = await Promise.all([
            remoteResultsPromise,
            localResultsPromise,
        ])
        return remoteResults.concat(localResults)
    }

    private async fetchIndexedContextFromRemote(
        repoIDs: string[],
        query: string,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const remoteResultPromise = graphqlClient.contextSearch(repoIDs, query, signal)

        const remoteResult = await remoteResultPromise
        if (isError(remoteResult)) {
            throw remoteResult
        }
        return remoteResult?.flatMap(r => contextSearchResultToContextItem(r) ?? []) ?? []
    }

    private async fetchIndexedContextLocally(
        query: RewrittenQuery,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        // Fetch using legacy context retrieval
        const config = getConfiguration()
        const contextStrategy = await getContextStrategy(config.useContext)
        // span.setAttribute('strategy', contextStrategy)

        return (
            await Promise.all([
                resolveContext({
                    strategy: contextStrategy,
                    editor: this.editor,
                    // TODO(beyang): should we use original user query or rewritten query here?
                    input: { text: query.userQuery, mentions: query.mentions },
                    providers: {
                        // localEmbeddings: this.localEmbeddings,
                        localEmbeddings: null,
                        symf: this.symf ?? null,
                        // remoteSearch: this.remoteSearch,
                        remoteSearch: null,
                    },
                    signal,
                }),
                getContextForChatMessage(query.userQuery.toString(), signal),
            ])
        ).flat()
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
