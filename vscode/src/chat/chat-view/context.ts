import * as vscode from 'vscode'

import {
    isCodyIgnoredFile,
    isError,
    isFileURI,
    MAX_BYTES_PER_FILE,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    truncateTextNearestLine,
    uriBasename,
    type CodyCommand,
    type ConfigurationUseContext,
    type Result,
} from '@sourcegraph/cody-shared'

import { getContextForCommand } from '../../commands/utils/get-context'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import type { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'

import { viewRangeToRange } from './chat-helpers'
import type { CodebaseStatusProvider } from './CodebaseStatusProvider'
import type { ContextItem } from './SimpleChatModel'

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'

export async function getEnhancedContext(
    useContextConfig: ConfigurationUseContext,
    editor: VSCodeEditor,
    embeddingsClient: CachedRemoteEmbeddingsClient,
    localEmbeddings: LocalEmbeddingsController | null,
    symf: SymfRunner | null,
    codebaseStatusProvider: CodebaseStatusProvider,
    text: string,
    internalUnstable: boolean
): Promise<ContextItem[]> {
    if (internalUnstable) {
        return getEnhancedContextFused(
            useContextConfig,
            editor,
            embeddingsClient,
            localEmbeddings,
            symf,
            codebaseStatusProvider,
            text
        )
    }
    const searchContext: ContextItem[] = []

    // use user attention context only if config is set to none
    if (useContextConfig === 'none') {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > none')
        searchContext.push(...getVisibleEditorContext(editor))
        return searchContext
    }

    let hasEmbeddingsContext = false
    // Get embeddings context if useContext Config is not set to 'keyword' only
    if (useContextConfig !== 'keyword') {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (start)')
        const localEmbeddingsResults = searchEmbeddingsLocal(localEmbeddings, text)
        const remoteEmbeddingsResults = searchEmbeddingsRemote(
            embeddingsClient,
            codebaseStatusProvider,
            text
        )
        try {
            const r = await localEmbeddingsResults
            hasEmbeddingsContext = hasEmbeddingsContext || r.length > 0
            searchContext.push(...r)
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > local embeddings', error)
        }
        try {
            const r = await remoteEmbeddingsResults
            hasEmbeddingsContext = hasEmbeddingsContext || r.length > 0
            searchContext.push(...r)
        } catch (error) {
            logDebug('SimpleChatPanelProvider', 'getEnhancedContext > remote embeddings', error)
        }
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > embeddings (end)')
    }

    // Fallback to symf if embeddings provided no results or if useContext is set to 'keyword' specifically
    if (!hasEmbeddingsContext && symf) {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > search')
        try {
            searchContext.push(...(await searchSymf(symf, editor, text)))
        } catch (error) {
            // TODO(beyang): handle this error better
            logDebug('SimpleChatPanelProvider.getEnhancedContext', 'searchSymf error', error)
        }
    }

    const priorityContext = await getPriorityContext(text, editor, searchContext)
    return priorityContext.concat(searchContext)
}

async function getEnhancedContextFused(
    useContextConfig: ConfigurationUseContext,
    editor: VSCodeEditor,
    _embeddingsClient: CachedRemoteEmbeddingsClient,
    localEmbeddings: LocalEmbeddingsController | null,
    symf: SymfRunner | null,
    _codebaseStatusProvider: CodebaseStatusProvider,
    text: string
): Promise<ContextItem[]> {
    // use user attention context only if config is set to none
    if (useContextConfig === 'none') {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > none')
        return getVisibleEditorContext(editor)
    }

    const retrievers: Promise<{ strategy: string; items: ContextItem[] }>[] = []
    // Get embeddings context if useContext Config is not set to 'keyword' only
    if (useContextConfig !== 'keyword') {
        // Query local embeddings (dense)
        retrievers.push(
            retrieveContextGracefully(searchEmbeddingsLocal(localEmbeddings, text), 'local-embeddings')
        )
    }
    if (symf) {
        // Query symf context (sparse)
        retrievers.push(retrieveContextGracefully(searchSymf(symf, editor, text), 'symf'))
    }

    const searchContext = await Promise.all(retrievers)

    const fusedContext = fuseContext(searchContext)

    const priorityContext = await getPriorityContext(text, editor, fusedContext)
    return priorityContext.concat(fusedContext)
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
    if (!symf) {
        return []
    }
    const workspaceRoot = editor.getWorkspaceRootUri()
    if (!workspaceRoot || !isFileURI(workspaceRoot)) {
        return []
    }

    const indexExists = await symf.getIndexStatus(workspaceRoot)
    if (indexExists !== 'ready' && !blockOnIndex) {
        void symf.ensureIndex(workspaceRoot, { hard: false })
        return []
    }

    const r0 = (await symf.getResults(userText, [workspaceRoot])).flatMap(async results => {
        const items = (await results).flatMap(
            async (result: Result): Promise<ContextItem[] | ContextItem> => {
                if (isCodyIgnoredFile(result.file)) {
                    return []
                }
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
                    uri: result.file,
                    range,
                    source: 'search',
                    text,
                }
            }
        )
        return (await Promise.all(items)).flat()
    })

    const allResults = (await Promise.all(r0)).flat()

    if (isAgentTesting) {
        // Sort results for deterministic ordering for stable tests. Ideally, we
        // could sort by some numerical score from symf based on how relevant
        // the matches are for the query.
        allResults.sort((a, b) => {
            const byUri = a.uri.fsPath.localeCompare(b.uri.fsPath)
            if (byUri !== 0) {
                return byUri
            }
            return a.text.localeCompare(b.text)
        })
    }

    return allResults
}

async function searchEmbeddingsLocal(
    localEmbeddings: LocalEmbeddingsController | null,
    text: string
): Promise<ContextItem[]> {
    if (!localEmbeddings) {
        return []
    }

    logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching local embeddings')
    const contextItems: ContextItem[] = []
    const embeddingsResults = await localEmbeddings.getContext(text, NUM_CODE_RESULTS + NUM_TEXT_RESULTS)

    for (const result of embeddingsResults) {
        const range = new vscode.Range(
            new vscode.Position(result.startLine, 0),
            new vscode.Position(result.endLine, 0)
        )

        // Filter out ignored files
        if (!isCodyIgnoredFile(result.uri)) {
            contextItems.push({
                uri: result.uri,
                range,
                text: result.content,
                source: 'embeddings',
            })
        }
    }
    return contextItems
}

// Note: does not throw error if remote embeddings are not available, just returns empty array
async function searchEmbeddingsRemote(
    embeddingsClient: CachedRemoteEmbeddingsClient | null,
    codebaseStatusProvider: CodebaseStatusProvider,
    text: string
): Promise<ContextItem[]> {
    if (!embeddingsClient) {
        return []
    }
    const codebase = await codebaseStatusProvider?.currentCodebase()
    if (!codebase?.remote) {
        return []
    }
    const repoId = await embeddingsClient.getRepoIdIfEmbeddingExists(codebase.remote)
    if (isError(repoId)) {
        throw new Error(`Error retrieving repo ID: ${repoId}`)
    }
    if (!repoId) {
        return []
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.at(0)
    if (!workspaceFolder) {
        return []
    }

    logDebug('SimpleChatPanelProvider', 'getEnhancedContext > searching remote embeddings')
    const contextItems: ContextItem[] = []
    const embeddings = await embeddingsClient.search(
        workspaceFolder.uri,
        [repoId],
        text,
        NUM_CODE_RESULTS,
        NUM_TEXT_RESULTS
    )
    if (isError(embeddings)) {
        throw new Error(`Error retrieving embeddings: ${embeddings}`)
    }
    for (const codeResult of embeddings.codeResults) {
        const range = new vscode.Range(
            new vscode.Position(codeResult.startLine, 0),
            new vscode.Position(codeResult.endLine, 0)
        )
        if (!isCodyIgnoredFile(codeResult.uri)) {
            contextItems.push({
                uri: codeResult.uri,
                range,
                text: codeResult.content,
                source: 'embeddings',
            })
        }
    }

    for (const textResult of embeddings.textResults) {
        const range = new vscode.Range(
            new vscode.Position(textResult.startLine, 0),
            new vscode.Position(textResult.endLine, 0)
        )
        if (!isCodyIgnoredFile(textResult.uri)) {
            contextItems.push({
                uri: textResult.uri,
                range,
                text: textResult.content,
                source: 'embeddings',
            })
        }
    }

    return contextItems
}

const userAttentionRegexps: RegExp[] = [
    /editor/,
    /(open|current|this|entire)\s+file/,
    /current(ly)?\s+open/,
    /have\s+open/,
]

function getCurrentSelectionContext(editor: VSCodeEditor): ContextItem[] {
    const selection = editor.getActiveTextEditorSelection()
    if (!selection?.selectedText || isCodyIgnoredFile(selection.fileUri)) {
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
            text: selection.selectedText,
            uri: selection.fileUri,
            range,
            source: 'selection',
        },
    ]
}

function getVisibleEditorContext(editor: VSCodeEditor): ContextItem[] {
    const visible = editor.getActiveTextEditorVisibleContent()
    const fileUri = visible?.fileUri
    if (!visible || !fileUri) {
        return []
    }
    if (isCodyIgnoredFile(fileUri) || !visible.content.trim()) {
        return []
    }
    return [
        {
            text: visible.content,
            uri: fileUri,
            source: 'editor',
        },
    ]
}

async function getPriorityContext(
    text: string,
    editor: VSCodeEditor,
    retrievedContext: ContextItem[]
): Promise<ContextItem[]> {
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
    if (!readmeUri || isCodyIgnoredFile(readmeUri)) {
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
            uri: readmeUri,
            text: truncatedReadmeText,
            range: viewRangeToRange(range),
            source: 'editor',
        },
    ]
}

export async function getCommandContext(
    editor: VSCodeEditor,
    command: CodyCommand
): Promise<ContextItem[]> {
    logDebug('SimpleChatPanelProvider.getCommandContext', command.slashCommand)

    const contextItems: ContextItem[] = []
    const contextMessages = await getContextForCommand(editor, command)
    // Turn ContextMessages to ContextItems
    for (const msg of contextMessages) {
        if (msg.file?.uri && msg.file?.content) {
            contextItems.push({
                uri: msg.file?.uri,
                text: msg.file?.content,
                range: viewRangeToRange(msg.file?.range),
                source: msg.file?.source || 'editor',
            })
        }
    }

    // TODO(beyang): add codebase context when command.context.codebase is true

    return contextItems
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

async function retrieveContextGracefully<T>(
    promise: Promise<T[]>,
    strategy: string
): Promise<{ strategy: string; items: T[] }> {
    try {
        logDebug('SimpleChatPanelProvider', `getEnhancedContext > ${strategy} (start)`)
        return { strategy, items: await promise }
    } catch (error) {
        logError('SimpleChatPanelProvider', `getEnhancedContext > ${strategy}' (error)`, error)
        return { strategy, items: [] }
    } finally {
        logDebug('SimpleChatPanelProvider', `getEnhancedContext > ${strategy} (end)`)
    }
}

// k parameter for the reciprocal rank fusion scoring. 60 is the default value in many places
//
// c.f. https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking#how-rrf-ranking-works
const RRF_K = 60
function fuseContext(searchContext: { strategy: string; items: ContextItem[] }[]): ContextItem[] {
    // For every strategy, create a map of snippets by document.
    const resultsByDocument = new Map<string, { [identifier: string]: ContextItem[] }>()
    for (const { strategy, items } of searchContext) {
        for (const item of items) {
            const documentId = item.uri.toString()

            let document = resultsByDocument.get(documentId)
            if (!document) {
                document = {}
                resultsByDocument.set(documentId, document)
            }
            if (!document[strategy]) {
                document[strategy] = []
            }
            document[strategy].push(item)
        }
    }

    // Rank the order of documents using reciprocal rank fusion.
    //
    // For this, we take the top rank of every document from each retrieved set and compute a
    // combined rank. The idea is that a document that ranks highly across multiple retrievers
    // should be ranked higher overall.
    const fusedDocumentScores: Map<string, number> = new Map()
    for (const { strategy, items } of searchContext) {
        items.forEach((item, rank) => {
            const documentId = item.uri.toString()

            // Since every retriever can return many snippets for a given document, we need to
            // only consider the best rank for each document.
            // We can use the previous map by document to find the highest ranked snippet for a
            // retriever
            const isBestRankForRetriever = resultsByDocument.get(documentId)?.[strategy][0] === item
            if (!isBestRankForRetriever) {
                return
            }

            const reciprocalRank = 1 / (RRF_K + rank)

            const score = fusedDocumentScores.get(documentId)
            if (score === undefined) {
                fusedDocumentScores.set(documentId, reciprocalRank)
            } else {
                fusedDocumentScores.set(documentId, score + reciprocalRank)
            }
        })
    }

    const fusedDocuments = [...fusedDocumentScores.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0])

    const fusedContext: ContextItem[] = []
    // Now that we have a sorted list of documents (with the first document being the highest
    // ranked one), we use top-k to combine snippets from each retriever into a result set.
    //
    // We start with the highest ranked document and include all retrieved snippets from this
    // document into the result set, starting with the top retrieved snippet from each retriever
    // and adding entries greedily.
    for (const documentId of fusedDocuments) {
        const resultByDocument = resultsByDocument.get(documentId)
        if (!resultByDocument) {
            continue
        }

        // We want to start iterating over every retrievers first rank, then every retrievers
        // second rank etc. The termination criteria is thus defined to be the length of the
        // largest snippet list of any retriever.
        const maxMatches = Math.max(...Object.values(resultByDocument).map(r => r.length))

        for (let i = 0; i < maxMatches; i++) {
            for (const [_, snippets] of Object.entries(resultByDocument)) {
                if (i >= snippets.length) {
                    continue
                }
                const snippet = snippets[i]

                fusedContext.push(snippet)
            }
        }
    }
    return fusedContext
}
