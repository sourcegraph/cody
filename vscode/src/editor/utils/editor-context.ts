import fuzzysort from 'fuzzysort'
import throttle from 'lodash/throttle'
import * as vscode from 'vscode'

import {
    type ContextFileType,
    type ContextItem,
    type ContextItemFile,
    ContextItemSource,
    type ContextItemSymbol,
    type ContextItemWithContent,
    type Editor,
    type PromptString,
    type RangeData,
    type SymbolKind,
    TokenCounterUtils,
    contextFiltersProvider,
    currentResolvedConfig,
    displayPath,
    graphqlClient,
    isAbortError,
    isDefined,
    isErrorLike,
    isWindows,
    logError,
    openCtx,
    toRangeData,
} from '@sourcegraph/cody-shared'

import { URI } from 'vscode-uri'
import { getOpenTabsUris } from '.'
import { toVSCodeRange } from '../../common/range'
import { findWorkspaceFiles } from './findWorkspaceFiles'

// Some matches we don't want to ignore because they might be valid code (for example `bin/` in Dart)
// but could also be junk (`bin/` in .NET). If a file path contains a segment matching any of these
// items it will be ranked low unless the users query contains the exact segment.
const lowScoringPathSegments = ['bin']

/**
 * This is expensive for large repos (e.g. Chromium), so we only do it max once every 10 seconds.
 *
 * We do NOT allow passing a cancellation token because that is highly likely to result in buggy
 * behavior for a throttled function. If the first call to {@link findWorkspaceFiles} is cancelled,
 * we still want it to complete so that its results are cached for subsequent calls. If we cancel
 * and it throws an exception, then we lose all work we did until the cancellation and could
 * potentially swallow errors and return (and cache) incomplete data.
 */
const throttledFindFiles = throttle(() => findWorkspaceFiles(), 10000)

interface FileContextItemsOptions {
    query: string
    maxResults: number
    range: RangeData | undefined
    repositoriesNames?: string[]
}

/**
 * Searches all workspaces for files matching the given string. VS Code doesn't
 * provide an API for fuzzy file searching, only precise globs, so we recreate
 * it by getting a list of all files across all workspaces and using fuzzysort.
 * Large files over 1MB are filtered.
 */
export async function getFileContextFiles(options: FileContextItemsOptions): Promise<ContextItemFile[]> {
    let { query, maxResults, repositoriesNames, range } = options

    if (!query.trim()) {
        return []
    }

    // TODO [VK] Support fuzzy find logic that we have for local file resolution
    if (repositoriesNames) {
        const [filePath] = query?.split(':') || []
        const filesOrError = await graphqlClient.getRemoteFiles(repositoriesNames, filePath)

        if (isErrorLike(filesOrError)) {
            return []
        }

        const ignoredRepoNames = new Map<string, boolean>(
            await Promise.all(
                filesOrError
                    .map(item => item.repository.name)
                    .map(
                        async repoName =>
                            [repoName, await contextFiltersProvider.isRepoNameIgnored(repoName)] as const
                    )
            )
        )

        return filesOrError.map<ContextItemFile>(item => ({
            range,
            type: 'file',
            // If range is presented we assume that file content passes size limitation
            // since we don't have access to file content in this file resolver.
            size: range ? 100 : item.file.byteSize,
            source: ContextItemSource.User,
            remoteRepositoryName: item.repository.name,
            isIgnored: ignoredRepoNames.get(item.repository.name),
            uri: URI.file(`${item.repository.name}/${item.file.path}`),
        }))
    }

    const uris = await throttledFindFiles()
    if (!uris) {
        return []
    }

    if (isWindows()) {
        // On Windows, if the user has typed forward slashes, map them to backslashes before
        // running the search so they match the real paths.
        query = query.replaceAll('/', '\\')
    }

    // Add on the relative URIs for search, so we only search the visible part
    // of the path and not the full FS path.
    const urisWithRelative = uris.map(uri => ({
        uri,
        relative: displayPath(uri),
    }))
    const results = fuzzysort.go(query, urisWithRelative, {
        key: 'relative',
        limit: maxResults,
        // We add a threshold for performance as per fuzzysort’s
        // recommendations. Testing with sg/sg path strings, somewhere over 10k
        // threshold is where it seems to return results that make no sense. VS
        // Code’s own fuzzy finder seems to cap out much higher. To be safer and
        // to account for longer paths from even deeper source trees we use
        // 100k. We may want to revisit this number if we get reports of missing
        // file results from very large repos.
        threshold: -100000,
    })

    const openDocuments = new Set<string>()
    for (const uri of getOpenTabsUris()) {
        // Using `.path` instead of `Uri.toString()` for performance reasons. This is
        // a performance sensitive code path so we should void redundant work.
        openDocuments.add(uri.path)
    }
    const LARGE_SCORE = 100000
    const adjustedResults = [...results].map(result => {
        // Boost results for documents that are open in the editor.
        if (openDocuments.has(result.obj.uri.path)) {
            return {
                ...result,
                score: result.score + LARGE_SCORE,
            }
        }
        // Apply a penalty for segments that are in the low scoring list.
        const segments = result.obj.uri.path.split(/[\/\\]/).filter(segment => segment !== '')
        for (const lowScoringPathSegment of lowScoringPathSegments) {
            if (segments.includes(lowScoringPathSegment) && !query.includes(lowScoringPathSegment)) {
                return {
                    ...result,
                    score: result.score - LARGE_SCORE,
                }
            }
        }
        return result
    })
    // fuzzysort can return results in different order for the same query if
    // they have the same score :( So we do this hacky post-limit sorting (first
    // by score, then by path) to ensure the order stays the same.
    const sortedResults = (
        await Promise.all(
            adjustedResults
                .sort((a, b) => {
                    return (
                        b.score - a.score ||
                        new Intl.Collator(undefined, { numeric: true }).compare(
                            a.obj.uri.path,
                            b.obj.uri.path
                        )
                    )
                })
                .map(result => createContextFileFromUri(result.obj.uri, ContextItemSource.User, 'file'))
        )
    ).flat()

    // TODO(toolmantim): Add fuzzysort.highlight data to the result so we can show it in the UI

    return await filterContextItemFiles(sortedResults)
}

export async function getSymbolContextFiles(
    query: string,
    maxResults = 20,
    remoteRepositoriesNames?: string[]
): Promise<ContextItemSymbol[]> {
    query = query.trim()
    if (query.startsWith('#')) {
        query = query.slice(1)
    }

    if (remoteRepositoriesNames) {
        const symbolsOrError = await graphqlClient.getRemoteSymbols(remoteRepositoriesNames, query)

        if (isErrorLike(symbolsOrError)) {
            return []
        }

        const ignoredRepoNames = new Map<string, boolean>(
            await Promise.all(
                symbolsOrError
                    .map(item => item.repository.name)
                    .map(
                        async repoName =>
                            [repoName, await contextFiltersProvider.isRepoNameIgnored(repoName)] as const
                    )
            )
        )

        return symbolsOrError.flatMap<ContextItemSymbol>(item =>
            item.symbols.map(symbol => ({
                type: 'symbol',
                remoteRepositoryName: item.repository.name,
                uri: URI.file(`${item.repository.name}/${symbol.location.resource.path}`),
                isIgnored: ignoredRepoNames.get(item.repository.name),
                source: ContextItemSource.User,
                symbolName: symbol.name,
                // TODO [VK] Support other symbols kind
                kind: 'function',
            }))
        )
    }

    // doesn't support cancellation tokens :(
    const queryResults = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        query
    )

    const relevantQueryResults = queryResults?.filter(
        symbol =>
            (symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Interface ||
                symbol.kind === vscode.SymbolKind.Enum ||
                symbol.kind === vscode.SymbolKind.Struct ||
                symbol.kind === vscode.SymbolKind.Constant ||
                // in TS an export const is considered a variable
                symbol.kind === vscode.SymbolKind.Variable) &&
            // TODO(toolmantim): Remove once https://github.com/microsoft/vscode/pull/192798 is in use (test: do a symbol search and check no symbols exist from node_modules)
            !symbol.location?.uri?.fsPath.includes('node_modules/')
    )

    const results = fuzzysort.go(query, relevantQueryResults, {
        key: 'name',
        limit: maxResults,
        all: true,
    })

    // TODO(toolmantim): Add fuzzysort.highlight data to the result so we can show it in the UI

    const symbols = results.map(result => result.obj)

    if (!symbols.length) {
        return []
    }

    const matches = await Promise.all(
        symbols.map(symbol =>
            createContextFileFromUri(
                symbol.location.uri,
                ContextItemSource.User,
                'symbol',
                symbol.location.range,
                // TODO(toolmantim): Update the kinds to match above
                symbol.kind === vscode.SymbolKind.Class ? 'class' : 'function',
                symbol.name
            )
        )
    )

    return matches.flat()
}

/**
 * Gets context files for each open editor tab in VS Code.
 * Filters out large files over 1MB to avoid expensive parsing.
 */
export async function getOpenTabsContextFile(): Promise<ContextItemFile[]> {
    return await filterContextItemFiles(
        (
            await Promise.all(
                getOpenTabsUris().map(uri =>
                    createContextFileFromUri(uri, ContextItemSource.User, 'file')
                )
            )
        ).flat()
    )
}

async function createContextFileFromUri(
    uri: vscode.Uri,
    source: ContextItemSource,
    type: 'symbol',
    selectionRange: vscode.Range,
    kind: SymbolKind,
    symbolName: string
): Promise<ContextItemSymbol[]>
async function createContextFileFromUri(
    uri: vscode.Uri,
    source: ContextItemSource,
    type: 'file',
    selectionRange?: vscode.Range
): Promise<ContextItemFile[]>
async function createContextFileFromUri(
    uri: vscode.Uri,
    source: ContextItemSource,
    type: ContextFileType,
    selectionRange?: vscode.Range,
    kind?: SymbolKind,
    symbolName?: string
): Promise<ContextItem[]> {
    const range = toRangeData(selectionRange)
    return [
        type === 'file'
            ? {
                  type,
                  uri,
                  range,
                  source,
                  isIgnored: Boolean(await contextFiltersProvider.isUriIgnored(uri)),
              }
            : {
                  type,
                  symbolName: symbolName!,
                  uri,
                  range,
                  source,
                  kind: kind!,
              },
    ]
}

/**
 * Filters the given context files to remove files larger than 1MB and non-text files.
 */
export async function filterContextItemFiles(
    contextFiles: ContextItemFile[]
): Promise<ContextItemFile[]> {
    const filtered = []
    for (const cf of contextFiles) {
        // Remove file larger than 1MB and non-text files
        // NOTE: Sourcegraph search only includes files up to 1MB
        const fileStat = await vscode.workspace.fs.stat(cf.uri)?.then(
            stat => stat,
            error => undefined
        )
        if (cf.type !== 'file' || fileStat?.type !== vscode.FileType.File || fileStat?.size > 1000000) {
            continue
        }
        // TODO (bee) consider a better way to estimate the token size of a file
        // We cannot get the exact token size without parsing the file, which is expensive.
        // Instead, we divide the file size in bytes by 4.5 for non-markdown as a rough estimate of the token size.
        // For markdown files, we divide by 3.5 because they tend to have more text and fewer code blocks and whitespaces.
        //
        // NOTE: This provides the frontend with a rough idea of when to display large files with a warning based
        // on available tokens, so that it can prompt the user to import the file via '@file-range' or
        // via 'right-click on a selection' that only involves reading a single context item, allowing us to read
        // the file content on-demand instead of in bulk. We would then label the file size more accurately with the tokenizer.
        cf.size = Math.floor(fileStat.size / (cf.uri.fsPath.endsWith('.md') ? 3.5 : 4.5))
        filtered.push(cf)
    }
    return filtered
}

export async function resolveContextItems(
    editor: Editor,
    items: ContextItem[],
    input: PromptString,
    signal?: AbortSignal
): Promise<ContextItemWithContent[]> {
    return (
        await Promise.all(
            items.map(async (item: ContextItem): Promise<ContextItemWithContent[] | null> => {
                try {
                    return await resolveContextItem(item, editor, input, signal)
                } catch (error) {
                    if (isAbortError(error)) {
                        throw error
                    }
                    void vscode.window.showErrorMessage(
                        `Cody could not include context from ${item.uri}. (Reason: ${error})`
                    )
                    return null
                }
            })
        )
    )
        .filter(isDefined)
        .flat()
}

async function resolveContextItem(
    item: ContextItem,
    editor: Editor,
    input: PromptString,
    signal?: AbortSignal
): Promise<ContextItemWithContent[]> {
    const resolvedItems: ContextItemWithContent[] = item.provider
        ? await resolveContextMentionProviderContextItem(item, input, signal)
        : item.type === 'file' || item.type === 'symbol'
          ? [await resolveFileOrSymbolContextItem(item, editor, signal)]
          : []
    return await Promise.all(
        resolvedItems.map(async resolvedItem => ({
            ...resolvedItem,
            size: resolvedItem.size ?? (await TokenCounterUtils.countTokens(resolvedItem.content)),
        }))
    )
}

async function resolveContextMentionProviderContextItem(
    { provider: providerUri, ...item }: ContextItem,
    input: PromptString,
    signal?: AbortSignal
): Promise<ContextItemWithContent[]> {
    if (item.type !== 'openctx') {
        return []
    }

    const openCtxClient = openCtx.controller
    if (!openCtxClient) {
        return []
    }

    if (!item.mention) {
        logError('OpenCtx', 'resolving context item is missing mention parameter', item)
        return []
    }

    const mention = {
        ...item.mention,
        title: item.title,
    }

    const items = await openCtxClient.items(
        { message: input.toString(), mention },
        { providerUri: item.providerUri }
    )
    // TODO(sqs): add `signal` arg to openCtxClient.items
    signal?.throwIfAborted()

    return items
        .map((item): (ContextItemWithContent & { providerUri: string }) | null =>
            item.ai?.content
                ? {
                      type: 'openctx',
                      title: item.title,
                      uri: URI.parse(item.url || item.providerUri),
                      providerUri: item.providerUri,
                      content: item.ai.content,
                      provider: 'openctx',
                  }
                : null
        )
        .filter(context => context !== null) as ContextItemWithContent[]
}

async function resolveFileOrSymbolContextItem(
    contextItem: ContextItemFile | ContextItemSymbol,
    editor: Editor,
    signal?: AbortSignal
): Promise<ContextItemWithContent> {
    if (contextItem.remoteRepositoryName) {
        // Get only actual file path without repository name
        const repository = contextItem.remoteRepositoryName
        const path = contextItem.uri.path.slice(repository.length + 1, contextItem.uri.path.length)
        const ranges = contextItem.range
            ? { startLine: contextItem.range.start.line, endLine: contextItem.range.end.line + 1 }
            : undefined

        const { auth } = await currentResolvedConfig()
        const resultOrError = await graphqlClient.getFileContent(repository, path, ranges, signal)

        if (!isErrorLike(resultOrError)) {
            return {
                ...contextItem,
                title: path,
                uri: URI.parse(`${auth.serverEndpoint}${repository}/-/blob${path}`),
                content: resultOrError,
                repoName: repository,
                source: ContextItemSource.Unified,
                size: await TokenCounterUtils.countTokens(resultOrError),
            }
        }
    }

    const content =
        contextItem.content ??
        (await editor.getTextEditorContentForFile(contextItem.uri, toVSCodeRange(contextItem.range)))
    signal?.throwIfAborted()

    return {
        ...contextItem,
        content,
        size: contextItem.size ?? (await TokenCounterUtils.countTokens(content)),
    }
}
