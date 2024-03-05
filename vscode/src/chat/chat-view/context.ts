import * as vscode from 'vscode'

import {
    type ConfigurationUseContext,
    type ContextItem,
    MAX_BYTES_PER_FILE,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    type Result,
    isFileURI,
    truncateTextNearestLine,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'

import type { RemoteSearch } from '../../context/remote-search'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { ContextRankingController } from '../../local-context/context-ranking'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import { viewRangeToRange } from './chat-helpers'

interface GetEnhancedContextOptions {
    strategy: ConfigurationUseContext
    editor: VSCodeEditor
    text: string
    providers: {
        localEmbeddings: LocalEmbeddingsController | null
        symf: SymfRunner | null
        remoteSearch: RemoteSearch | null
    }
    featureFlags: {
        fusedContext: boolean
    }
    hints: {
        maxChars: number
    }
    contextRanking: ContextRankingController | null
    // TODO(@philipp-spiess): Add abort controller to be able to cancel expensive retrievers
}
export async function getEnhancedContext({
    strategy,
    editor,
    text,
    providers,
    featureFlags,
    hints,
    contextRanking,
}: GetEnhancedContextOptions): Promise<ContextItem[]> {
    if (contextRanking) {
        return getEnhancedContextFromRanker({
            strategy,
            editor,
            text,
            providers,
            featureFlags,
            hints,
            contextRanking,
        })
    }
    if (featureFlags.fusedContext) {
        return getEnhancedContextFused({
            strategy,
            editor,
            text,
            providers,
            featureFlags,
            hints,
            contextRanking,
        })
    }

    return wrapInActiveSpan('chat.enhancedContext', async span => {
        const searchContext: ContextItem[] = []

        // use user attention context only if config is set to none
        if (strategy === 'none') {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > none')
            searchContext.push(...getVisibleEditorContext(editor))
            return searchContext
        }

        let hasEmbeddingsContext = false
        // Get embeddings context if useContext Config is not set to 'keyword' only
        if (strategy !== 'keyword') {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (start)')
            const localEmbeddingsResults = searchEmbeddingsLocal(providers.localEmbeddings, text)
            try {
                const r = await localEmbeddingsResults
                hasEmbeddingsContext = hasEmbeddingsContext || r.length > 0
                searchContext.push(...r)
            } catch (error) {
                logDebug('SimpleChatPanelProvider', 'getEnhancedContext > local embeddings', error)
            }
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (end)')
        }

        if (strategy !== 'embeddings') {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > search')
            if (providers.remoteSearch) {
                try {
                    searchContext.push(...(await searchRemote(providers.remoteSearch, text)))
                } catch (error) {
                    // TODO: Error reporting
                    logDebug('SimpleChatPanelProvider.getEnhancedContext', 'remote search error', error)
                }
            }
            if (providers.symf) {
                try {
                    searchContext.push(...(await searchSymf(providers.symf, editor, text)))
                } catch (error) {
                    // TODO(beyang): handle this error better
                    logDebug('SimpleChatPanelProvider.getEnhancedContext', 'searchSymf error', error)
                }
            }
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > search (end)')
        }

        const priorityContext = await getPriorityContext(text, editor, searchContext)
        return priorityContext.concat(searchContext)
    })
}

async function getEnhancedContextFused({
    strategy,
    editor,
    text,
    providers,
    hints,
}: GetEnhancedContextOptions): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.enhancedContextFused', async () => {
        // use user attention context only if config is set to none
        if (strategy === 'none') {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > none')
            return getVisibleEditorContext(editor)
        }

        // Get embeddings context if useContext Config is not set to 'keyword' only
        const embeddingsContextItemsPromise =
            strategy !== 'keyword'
                ? retrieveContextGracefully(
                      searchEmbeddingsLocal(providers.localEmbeddings, text),
                      'local-embeddings'
                  )
                : []

        // Get search (symf or remote search) context if config is not set to 'embeddings' only
        const localSearchContextItemsPromise =
            providers.symf && strategy !== 'embeddings'
                ? retrieveContextGracefully(searchSymf(providers.symf, editor, text), 'symf')
                : []
        const remoteSearchContextItemsPromise =
            providers.remoteSearch && strategy !== 'embeddings'
                ? await retrieveContextGracefully(
                      searchRemote(providers.remoteSearch, text),
                      'remote-search'
                  )
                : []
        const keywordContextItemsPromise = (async () => [
            ...(await localSearchContextItemsPromise),
            ...(await remoteSearchContextItemsPromise),
        ])()

        const [embeddingsContextItems, keywordContextItems] = await Promise.all([
            embeddingsContextItemsPromise,
            keywordContextItemsPromise,
        ])

        const fusedContext = fuseContext(keywordContextItems, embeddingsContextItems, hints.maxChars)

        const priorityContext = await getPriorityContext(text, editor, fusedContext)
        return priorityContext.concat(fusedContext)
    })
}

async function getEnhancedContextFromRanker({
    editor,
    text,
    providers,
    contextRanking,
}: GetEnhancedContextOptions): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.enhancedContextRanker', async span => {
        // Get all possible context items to rank
        let searchContext = getVisibleEditorContext(editor)

        const embeddingsContextItemsPromise = retrieveContextGracefully(
            searchEmbeddingsLocal(providers.localEmbeddings, text),
            'local-embeddings'
        )

        const localSearchContextItemsPromise = providers.symf
            ? retrieveContextGracefully(searchSymf(providers.symf, editor, text), 'symf')
            : []

        const remoteSearchContextItemsPromise = providers.remoteSearch
            ? await retrieveContextGracefully(
                  searchRemote(providers.remoteSearch, text),
                  'remote-search'
              )
            : []

        const keywordContextItemsPromise = (async () => [
            ...(await localSearchContextItemsPromise),
            ...(await remoteSearchContextItemsPromise),
        ])()

        const [embeddingsContextItems, keywordContextItems] = await Promise.all([
            embeddingsContextItemsPromise,
            keywordContextItemsPromise,
        ])

        searchContext = searchContext.concat(keywordContextItems).concat(embeddingsContextItems)
        const editorContext = await getPriorityContext(text, editor, searchContext)
        const allContext = editorContext.concat(searchContext)
        if (!contextRanking) {
            return allContext
        }
        const rankedContext = wrapInActiveSpan('chat.enhancedContextRanker.reranking', () =>
            contextRanking.rankContextItems(text, allContext)
        )
        return rankedContext
    })
}

async function searchRemote(
    remoteSearch: RemoteSearch | null,
    userText: string
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.embeddings.remote', async () => {
        if (!remoteSearch) {
            return []
        }
        return (await remoteSearch.query(userText)).map(result => {
            return {
                type: 'file',
                content: result.content,
                range: new vscode.Range(result.startLine, 0, result.endLine, 0),
                uri: result.uri,
                source: 'unified',
                repoName: result.repoName,
                title: result.path,
                revision: result.commit,
            }
        })
    })
}

/**
 * Uses symf to conduct a local search within the current workspace folder
 */
async function searchSymf(
    symf: SymfRunner | null,
    editor: VSCodeEditor,
    userText: string,
    blockOnIndex = false
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.symf', async () => {
        if (!symf) {
            return []
        }
        const workspaceRoot = editor.getWorkspaceRootUri()
        if (!workspaceRoot || !isFileURI(workspaceRoot)) {
            return []
        }

        const indexExists = await symf.getIndexStatus(workspaceRoot)
        if (indexExists !== 'ready' && !blockOnIndex) {
            void symf.ensureIndex(workspaceRoot, {
                retryIfLastAttemptFailed: false,
                ignoreExisting: false,
            })
            return []
        }

        // trigger background reindex if the index is stale
        void symf?.reindexIfStale(workspaceRoot)

        const r0 = (await symf.getResults(userText, [workspaceRoot])).flatMap(async results => {
            const items = (await results).flatMap(
                async (result: Result): Promise<ContextItem[] | ContextItem> => {
                    const range = new vscode.Range(
                        result.range.startPoint.row,
                        result.range.startPoint.col,
                        result.range.endPoint.row,
                        result.range.endPoint.col
                    )

                    let text: string | undefined
                    try {
                        text = await editor.getTextEditorContentForFile(result.file, range)
                        if (!text) {
                            return []
                        }
                    } catch (error) {
                        logError(
                            'SimpleChatPanelProvider.searchSymf',
                            `Error getting file contents: ${error}`
                        )
                        return []
                    }
                    return {
                        type: 'file',
                        uri: result.file,
                        range,
                        source: 'search',
                        content: text,
                    }
                }
            )
            return (await Promise.all(items)).flat()
        })

        return (await Promise.all(r0)).flat()
    })
}

async function searchEmbeddingsLocal(
    localEmbeddings: LocalEmbeddingsController | null,
    text: string
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.embeddings.local', async () => {
        if (!localEmbeddings) {
            return []
        }

        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching local embeddings')
        const contextItems: ContextItem[] = []
        const embeddingsResults = await localEmbeddings.getContext(
            text,
            NUM_CODE_RESULTS + NUM_TEXT_RESULTS
        )

        for (const result of embeddingsResults) {
            const range = new vscode.Range(
                new vscode.Position(result.startLine, 0),
                new vscode.Position(result.endLine, 0)
            )

            contextItems.push({
                type: 'file',
                uri: result.uri,
                range,
                content: result.content,
                source: 'embeddings',
            })
        }
        return contextItems
    })
}

const userAttentionRegexps: RegExp[] = [
    /editor/,
    /(open|current|this|entire)\s+file/,
    /current(ly)?\s+open/,
    /have\s+open/,
]

function getCurrentSelectionContext(editor: VSCodeEditor): ContextItem[] {
    const selection = editor.getActiveTextEditorSelection()
    if (!selection?.selectedText) {
        return []
    }
    let range: vscode.Range | undefined
    if (selection.selectionRange) {
        range = new vscode.Range(
            selection.selectionRange.start.line,
            selection.selectionRange.start.character,
            selection.selectionRange.end.line,
            selection.selectionRange.end.character
        )
    }

    return [
        {
            type: 'file',
            content: selection.selectedText,
            uri: selection.fileUri,
            range,
            source: 'selection',
        },
    ]
}

function getVisibleEditorContext(editor: VSCodeEditor): ContextItem[] {
    return wrapInActiveSpan('chat.context.visibleEditorContext', () => {
        const visible = editor.getActiveTextEditorVisibleContent()
        const fileUri = visible?.fileUri
        if (!visible || !fileUri) {
            return []
        }
        if (!visible.content.trim()) {
            return []
        }
        return [
            {
                type: 'file',
                text: visible.content,
                uri: fileUri,
                source: 'editor',
            },
        ]
    })
}

async function getPriorityContext(
    text: string,
    editor: VSCodeEditor,
    retrievedContext: ContextItem[]
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.priority', async () => {
        const priorityContext: ContextItem[] = []
        const selectionContext = getCurrentSelectionContext(editor)
        if (selectionContext.length > 0) {
            priorityContext.push(...selectionContext)
        } else if (needsUserAttentionContext(text)) {
            // Query refers to current editor
            priorityContext.push(...getVisibleEditorContext(editor))
        } else if (needsReadmeContext(editor, text)) {
            // Query refers to project, so include the README
            let containsREADME = false
            for (const contextItem of retrievedContext) {
                const basename = uriBasename(contextItem.uri)
                if (
                    basename.toLocaleLowerCase() === 'readme' ||
                    basename.toLocaleLowerCase().startsWith('readme.')
                ) {
                    containsREADME = true
                    break
                }
            }
            if (!containsREADME) {
                priorityContext.push(...(await getReadmeContext()))
            }
        }
        return priorityContext
    })
}

function needsUserAttentionContext(input: string): boolean {
    const inputLowerCase = input.toLowerCase()
    // If the input matches any of the `editorRegexps` we assume that we have to include
    // the editor context (e.g., currently open file) to the overall message context.
    for (const regexp of userAttentionRegexps) {
        if (inputLowerCase.match(regexp)) {
            return true
        }
    }
    return false
}

function needsReadmeContext(editor: VSCodeEditor, input: string): boolean {
    input = input.toLowerCase()
    const question = extractQuestion(input)
    if (!question) {
        return false
    }

    // split input into words, discarding spaces and punctuation
    const words = input.split(/\W+/).filter(w => w.length > 0)
    const bagOfWords = Object.fromEntries(words.map(w => [w, true]))

    const projectSignifiers = [
        'project',
        'repository',
        'repo',
        'library',
        'package',
        'module',
        'codebase',
    ]
    const questionIndicators = ['what', 'how', 'describe', 'explain', '?']

    const workspaceUri = editor.getWorkspaceRootUri()
    if (workspaceUri) {
        const rootBase = workspaceUri.toString().split('/').at(-1)
        if (rootBase) {
            projectSignifiers.push(rootBase.toLowerCase())
        }
    }

    let containsProjectSignifier = false
    for (const p of projectSignifiers) {
        if (bagOfWords[p]) {
            containsProjectSignifier = true
            break
        }
    }

    let containsQuestionIndicator = false
    for (const q of questionIndicators) {
        if (bagOfWords[q]) {
            containsQuestionIndicator = true
            break
        }
    }

    return containsQuestionIndicator && containsProjectSignifier
}
async function getReadmeContext(): Promise<ContextItem[]> {
    // global pattern for readme file
    const readmeGlobalPattern = '{README,README.,readme.,Readm.}*'
    const readmeUri = (await vscode.workspace.findFiles(readmeGlobalPattern, undefined, 1)).at(0)
    if (!readmeUri?.path) {
        return []
    }
    const readmeDoc = await vscode.workspace.openTextDocument(readmeUri)
    const readmeText = readmeDoc.getText()
    const { truncated: truncatedReadmeText, range } = truncateTextNearestLine(
        readmeText,
        MAX_BYTES_PER_FILE
    )
    if (truncatedReadmeText.length === 0) {
        return []
    }

    return [
        {
            type: 'file',
            uri: readmeUri,
            content: truncatedReadmeText,
            range: viewRangeToRange(range),
            source: 'editor',
        },
    ]
}

function extractQuestion(input: string): string | undefined {
    input = input.trim()
    const q = input.indexOf('?')
    if (q !== -1) {
        return input.slice(0, q + 1).trim()
    }
    if (input.length < 100) {
        return input
    }
    return undefined
}

async function retrieveContextGracefully<T>(promise: Promise<T[]>, strategy: string): Promise<T[]> {
    try {
        logDebug('SimpleChatPanelProvider', `getEnhancedContext > ${strategy} (start)`)
        return await promise
    } catch (error) {
        logError('SimpleChatPanelProvider', `getEnhancedContext > ${strategy}' (error)`, error)
        return []
    } finally {
        logDebug('SimpleChatPanelProvider', `getEnhancedContext > ${strategy} (end)`)
    }
}

// A simple context fusion engine that picks the top most keyword results to fill up 80% of the
// context window and picks the top ranking embeddings items for the remainder.
export function fuseContext(
    keywordItems: ContextItem[],
    embeddingsItems: ContextItem[],
    maxChars: number
): ContextItem[] {
    let charsUsed = 0
    const fused = []
    const maxKeywordChars = embeddingsItems.length > 0 ? maxChars * 0.8 : maxChars

    for (const item of keywordItems) {
        const len = item.content?.length ?? 0

        if (charsUsed + len <= maxKeywordChars) {
            charsUsed += len
            fused.push(item)
        }
    }

    for (const item of embeddingsItems) {
        const len = item.content?.length ?? 0

        if (charsUsed + len <= maxChars) {
            charsUsed += len
            fused.push(item)
        }
    }

    return fused
}
