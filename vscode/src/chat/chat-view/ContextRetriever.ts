import path from 'node:path'
import type { Span } from '@opentelemetry/api'
import {
    type ContextItem,
    type ContextItemFile,
    type ContextItemOpenCtx,
    type ContextItemRepository,
    ContextItemSource,
    type ContextItemSymbol,
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
import { getContextStrategy, retrieveContextGracefully, searchSymf } from './context'

interface StructuredMentions {
    repos: ContextItemRepository[]
    trees: ContextItemTree[]
    files: ContextItemFile[]
    symbols: ContextItemSymbol[]
    openCtx: ContextItemOpenCtx[]
}

export function toStructuredMentions(mentions: ContextItem[]): StructuredMentions {
    const repos: ContextItemRepository[] = []
    const trees: ContextItemTree[] = []
    const files: ContextItemFile[] = []
    const symbols: ContextItemSymbol[] = []
    const openCtx: ContextItemOpenCtx[] = []
    for (const mention of mentions) {
        switch (mention.type) {
            case 'repository':
                repos.push(mention)
                break
            case 'tree':
                trees.push(mention)
                break
            case 'file':
                files.push(mention)
                break
            case 'symbol':
                symbols.push(mention)
                break
            case 'openctx':
                openCtx.push(mention)
                break
        }
    }
    return { repos, trees, files, symbols, openCtx }
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
    /**
     * The absolute path on local disk
     */
    local?: vscode.Uri

    /**
     * List of repository remotes associated with the codebase.
     * If this list is empty, then we were unable to discover a remote.
     * If it contains more than one element, then there are multiple remotes associated
     * with the codebase checked out to the local path.
     */
    remoteRepos: {
        name: string
        id: string
    }[]
}

/**
 * Extract codebase roots from @-mentions
 */
async function codebaseRootsFromMentions(
    { repos, trees }: StructuredMentions,
    signal?: AbortSignal
): Promise<Root[]> {
    const remoteRepos: Root[] = repos.map(r => ({
        remoteRepos: [
            {
                id: r.repoID,
                name: r.repoName,
            },
        ],
    }))

    const treesToRepoNames = await Promise.all(
        trees.map(async tree => ({
            tree,
            names: await repoNameResolver.getRepoNamesFromWorkspaceUri(tree.uri, signal),
        }))
    )
    const localRepoNames = treesToRepoNames.flatMap(t => t.names)
    const localRepoIDs = await graphqlClient.getRepoIds(localRepoNames, localRepoNames.length, signal)
    if (isError(localRepoIDs)) {
        throw localRepoIDs
    }
    const uriToId: { [uri: string]: string } = {}
    for (const r of localRepoIDs) {
        uriToId[r.name] = r.id
    }

    const seenLocalURIs = new Set<string>()
    const localRoots: Root[] = []
    for (const { tree, names } of treesToRepoNames) {
        if (seenLocalURIs.has(tree.uri.toString())) {
            continue
        }
        localRoots.push({
            local: tree.uri,
            remoteRepos: names
                .filter(name => uriToId[name])
                .map(name => ({
                    id: uriToId[name],
                    name,
                })),
        })
        seenLocalURIs.add(tree.uri.toString())
    }

    return [...remoteRepos, ...localRoots]
}

/**
 * ContextRetriever is a class responsible for retrieving broader context from the codebase
 */
export class ContextRetriever implements vscode.Disposable {
    constructor(
        private editor: VSCodeEditor,
        private symf: SymfRunner | undefined,
        private llms: SourcegraphCompletionsClient
    ) {}

    public dispose(): void {
        this.symf?.dispose()
    }

    public async retrieveContext(
        mentions: StructuredMentions,
        inputTextWithoutContextChips: PromptString,
        span: Span,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const roots = await codebaseRootsFromMentions(mentions, signal)
        return this._retrieveContext(roots, inputTextWithoutContextChips, span, signal)
    }

    private async _retrieveContext(
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

        // Retrieve context from locally edited files
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
            this.retrieveLiveContext(query, rewrittenQuery.rewritten, changedFiles, signal),
            this.retrieveIndexedContext(roots, query, rewrittenQuery.rewritten, span, signal),
        ])

        const { keep: filteredIndexedContext } = filterLocallyModifiedFilesOutOfRemoteContext(
            roots,
            changedFilesByRoot,
            indexedContext
        )

        return [...liveContext, ...filteredIndexedContext]
    }

    private async retrieveLiveContext(
        originalQuery: PromptString,
        rewrittenQuery: string,
        files: string[],
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        if (files.length === 0) {
            return []
        }
        if (!this.symf) {
            logDebug('ContextRetriever', 'symf not available, skipping live context')
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

    private async retrieveIndexedContext(
        roots: Root[],
        originalQuery: PromptString,
        rewrittenQuery: string,
        span: Span,
        signal?: AbortSignal
    ): Promise<ContextItem[]> {
        const repoIDsOnRemote = new Set<string>()
        const localRootURIs = new Map<string, FileURI>()
        for (const root of roots) {
            if (root.remoteRepos.length > 0) {
                // Note: we just take the first remote. In the future,
                // we could try to choose the best remote or query each
                // in succession.
                for (const rr of root.remoteRepos) {
                    if (rr.id) {
                        repoIDsOnRemote.add(rr.id)
                        break
                    }
                }
            } else if (root.local && isFileURI(root.local)) {
                localRootURIs.set(root.local.toString(), root.local)
            } else {
                throw new Error(
                    `Codebase root ${JSON.stringify(root)} is missing both remote and local root`
                )
            }
        }

        const remoteResultsPromise = this.retrieveIndexedContextFromRemote(
            [...repoIDsOnRemote],
            rewrittenQuery,
            signal
        )
        const localResultsPromise = this.retrieveIndexedContextLocally(
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

    private async retrieveIndexedContextFromRemote(
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

    private async retrieveIndexedContextLocally(
        localRootURIs: vscode.Uri[],
        originalQuery: PromptString,
        span: Span
    ): Promise<ContextItem[]> {
        if (localRootURIs.length === 0) {
            return []
        }

        // Legacy context retrieval
        const config = getConfiguration()
        const contextStrategy = await getContextStrategy(config.useContext)
        span.setAttribute('strategy', contextStrategy)

        // symf retrieval
        const symf = this.symf
        if (symf && contextStrategy !== 'embeddings' && localRootURIs.length > 0) {
            const localRootResults = await Promise.all(
                localRootURIs.map(rootURI =>
                    // TODO(beyang): retire searchSymf and retrieveContextGracefully
                    // (see invocation of symf in retrieveLiveContext)
                    retrieveContextGracefully(
                        searchSymf(symf, this.editor, rootURI, originalQuery),
                        `symf ${rootURI.path}`
                    )
                )
            )
            return localRootResults.flat()
        }

        return []
    }
}

function contextSearchResultToContextItem(result: ContextSearchResult): ContextItem | undefined {
    if (result.startLine < 0 || result.endLine < 0) {
        logDebug(
            'ContextRetriever',
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
        const localRoot = roots[i].local
        if (!localRoot || !isFileURI(localRoot)) {
            continue
        }

        const remoteRepos = roots[i].remoteRepos
        if (remoteRepos.length === 0) {
            continue
        }

        const relLocalFiles: Set<string> = new Set()
        for (const localFile of localFilesByRoot[i]) {
            relLocalFiles.add(path.relative(localRoot.fsPath, localFile))
        }
        for (const remoteRepo of remoteRepos) {
            repoNameToLocalFiles.set(remoteRepo.name, relLocalFiles)
        }
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
