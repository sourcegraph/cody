import path from 'node:path'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    type ContextItemRepository,
    ContextItemSource,
    type ContextItemTree,
    type ContextSearchResult,
    type FileURI,
    type PromptString,
    type SourcegraphCompletionsClient,
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
import { repoNameResolver } from '../../repository/repo-name-resolver'
import { type HumanInput, getContextStrategy, retrieveContextGracefully, searchSymf } from './context'

interface Input extends HumanInput {
    inputTextWithoutContextChips: PromptString
}

interface StructuredMentions {
    repos: ContextItemRepository[]
    trees: ContextItemTree[]
    other: Exclude<ContextItem, ContextItemRepository | ContextItemTree>[]
}

function toStructuredMentions(mentions: ContextItem[]): StructuredMentions {
    const repos: ContextItemRepository[] = []
    const trees: ContextItemTree[] = []
    const other: Exclude<ContextItem, ContextItemRepository | ContextItemTree>[] = []
    for (const mention of mentions) {
        switch (mention.type) {
            case 'repository':
                repos.push(mention)
                break
            case 'tree':
                trees.push(mention)
                break
            default:
                other.push(mention)
                break
        }
    }
    return { repos, trees, other }
}

/**
 * A Root instance represents the root of a codebase.
 *
 * If the codebase exists locally, then the `local` property indicates where in the local filesystem the
 * codebase exists.
 * If the codebase exists remotely on Sourcegraph, then the `remoteRepo` property indicates the name of the
 * remote repository and its ID.
 *
 * It is possible for both fields to be set, if the codebase exists on Sourcegraph and is checked out locally.
 */
export interface Root {
    local?: vscode.Uri
    remoteRepo?: {
        name: string
        id: string
    }
}

/**
 * Extract codebase roots from @-mentions
 */
async function codebaseRootsFromMentions(
    { repos, trees }: StructuredMentions,
    signal?: AbortSignal
): Promise<Root[]> {
    const remoteRepos: Root[] = repos.map(r => ({
        remoteRepo: {
            id: r.repoID,
            name: r.repoName,
        },
    }))

    const g = await Promise.all(
        trees.map(async tree => {
            const repoURIs = await repoNameResolver.getRepoNamesFromWorkspaceUri(tree.uri, signal)
            if (repoURIs.length === 0) {
                return []
            }
            // TODO(beyang): pass through all remotes? Should ensure we select the origin first?
            return {
                repoURI: repoURIs[0],
                local: tree.uri,
            }
            // return repoURIs.map(repoURI => ({
            //     repoURI,
            //     local: tree.uri,
            // }))
        })
    )
    const localRepoURIs = Array.from(new Set(g.flat()))
    const localRepoIDs = await graphqlClient.getRepoIds(
        localRepoURIs.map(({ repoURI }) => repoURI),
        localRepoURIs.length,
        signal
    )
    if (isError(localRepoIDs)) {
        throw localRepoIDs
    }
    const uriToId: { [uri: string]: string } = {}
    for (const r of localRepoIDs) {
        uriToId[r.name] = r.id
    }
    const localRoots: Root[] = []
    for (const repoWithURI of localRepoURIs) {
        localRoots.push({
            local: repoWithURI.local,
            remoteRepo: {
                id: uriToId[repoWithURI.repoURI],
                name: repoWithURI.repoURI,
            },
        })
    }

    return [...remoteRepos, ...localRoots]
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

    public async fetchContext(
        { mentions, inputTextWithoutContextChips }: Input,
        span: Span,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const structuredMentions = toStructuredMentions(mentions)
        const roots = await codebaseRootsFromMentions(structuredMentions, signal)

        console.log(
            '# TODO(beyang): incorporate explicit @-mentions into context',
            structuredMentions.other
        )

        console.log("# TODO(beyang): include 'priority context' (getPriorityContext)")

        return this._fetchContext(roots, inputTextWithoutContextChips, span, signal)
    }

    private async _fetchContext(
        roots: Root[],
        query: PromptString,
        span: Span,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const rewritten = await rewriteKeywordQuery(this.llms, query, signal)
        const rewrittenQuery = {
            ...query,
            rewritten,
        }

        // Fetch context from locally edited files
        const localRoots: vscode.Uri[] = []
        for (const root of roots) {
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
            this.fetchLiveContext(query, rewrittenQuery.rewritten, changedFiles, signal),
            this.fetchIndexedContext(roots, query, rewrittenQuery.rewritten, span, signal),
        ])

        const { keep: filteredIndexedContext } = filterLocallyModifiedFilesOutOfRemoteContext(
            roots,
            changedFilesByRoot,
            indexedContext
        )

        return [...liveContext, ...filteredIndexedContext]
    }

    private async fetchLiveContext(
        originalQuery: PromptString,
        rewrittenQuery: string,
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
        const results = await this.symf.getLiveResults(originalQuery, rewrittenQuery, files, signal)
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
        roots: Root[],
        originalQuery: PromptString,
        rewrittenQuery: string,
        span: Span,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const repoIDsOnRemote = new Set<string>()
        const localRootURIs = new Map<string, FileURI>()
        for (const root of roots) {
            if (root.remoteRepo?.id) {
                repoIDsOnRemote.add(root.remoteRepo.id)
            } else if (root.local && isFileURI(root.local)) {
                localRootURIs.set(root.local.toString(), root.local)
            } else {
                throw new Error(
                    `Codebase root ${JSON.stringify(root)} is missing both remote and local root`
                )
            }
        }

        const remoteResultsPromise = this.fetchIndexedContextFromRemote(
            [...repoIDsOnRemote],
            rewrittenQuery,
            signal
        )
        const localResultsPromise = this.fetchIndexedContextLocally(
            [...localRootURIs.values()],
            originalQuery,
            span
        )

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
        if (repoIDs.length === 0) {
            return []
        }

        const remoteResultPromise = graphqlClient.contextSearch(repoIDs, query, signal)

        const remoteResult = await remoteResultPromise
        if (isError(remoteResult)) {
            throw remoteResult
        }
        return remoteResult?.flatMap(r => contextSearchResultToContextItem(r) ?? []) ?? []
    }

    private async fetchIndexedContextLocally(
        localRootURIs: vscode.Uri[],
        originalQuery: PromptString,
        span: Span
    ): Promise<ContextItem[]> {
        if (localRootURIs.length === 0) {
            return []
        }

        // Fetch using legacy context retrieval
        const config = getConfiguration()
        const contextStrategy = await getContextStrategy(config.useContext)
        span.setAttribute('strategy', contextStrategy)

        // symf fetching
        const symf = this.symf
        if (symf && contextStrategy !== 'embeddings' && localRootURIs.length > 0) {
            const localRootResults = await Promise.all(
                localRootURIs.map(rootURI =>
                    // TODO(beyang): break out of searchSymf and retrieveContextGracefully
                    retrieveContextGracefully(
                        searchSymf(symf, this.editor, rootURI, originalQuery),
                        `symf ${rootURI.path}`
                    )
                )
            )
            return localRootResults.flat()
        }

        // TODO(beyang): local embeddings

        return []
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
