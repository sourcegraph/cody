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
    type ConfigurationUseContext,
    type Result,
} from '@sourcegraph/cody-shared'

import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'
import type { CachedRemoteEmbeddingsClient } from '../CachedRemoteEmbeddingsClient'

import { viewRangeToRange } from './chat-helpers'
import type { CodebaseStatusProvider } from './CodebaseStatusProvider'
import type { ContextItem } from './SimpleChatModel'

const isAgentTesting = process.env.CODY_SHIM_TESTING === 'true'

export interface GetEnhancedContextOptions {
    strategy: ConfigurationUseContext
    editor: VSCodeEditor
    text: string
    providers: {
        codebaseStatusProvider: CodebaseStatusProvider
        embeddingsClient: CachedRemoteEmbeddingsClient
        localEmbeddings: LocalEmbeddingsController | null
        symf: SymfRunner | null
    }
    featureFlags: {
        internalUnstable: boolean
    }
    hints: {
        maxChars: number
    }
    // TODO(@philipp-spiess): Add abort controller to be able to cancel expensive retrievers
}
export async function getEnhancedContext({
    strategy,
    editor,
    text,
    providers,
    featureFlags,
    hints,
}: GetEnhancedContextOptions): Promise<ContextItem[]> {
    if (featureFlags.internalUnstable) {
        return getEnhancedContextFused({
            strategy,
            editor,
            text,
            providers,
            featureFlags,
            hints,
        })
    }
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
        const remoteEmbeddingsResults = searchEmbeddingsRemote(
            providers.embeddingsClient,
            providers.codebaseStatusProvider,
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
    if (!hasEmbeddingsContext && providers.symf) {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > search')
        try {
            searchContext.push(...(await searchSymf(providers.symf, editor, text)))
        } catch (error) {
            // TODO(beyang): handle this error better
            logDebug('SimpleChatPanelProvider.getEnhancedContext', 'searchSymf error', error)
        }
    }

    const priorityContext = await getPriorityContext(text, editor, searchContext)
    return priorityContext.concat(searchContext)
}

async function getEnhancedContextFused({
    strategy,
    editor,
    text,
    providers,
    hints,
}: GetEnhancedContextOptions): Promise<ContextItem[]> {
    // use user attention context only if config is set to none
    if (strategy === 'none') {
        logDebug('SimpleChatPanelProvider', 'getEnhancedContext > none')
        return getVisibleEditorContext(editor)
    }

    // Get embeddings context if useContext Config is not set to 'keyword' only
    const keywordContextItemsPromise =
        strategy !== 'keyword'
            ? retrieveContextGracefully(
                  searchEmbeddingsLocal(providers.localEmbeddings, text),
                  'local-embeddings'
              )
            : []
    const searchContextItemsPromise = providers.symf
        ? retrieveContextGracefully(searchSymf(providers.symf, editor, text), 'symf')
        : []

    const [keywordContextItems, searchContextItems] = await Promise.all([
        keywordContextItemsPromise,
        searchContextItemsPromise,
    ])

    const fusedContext = fuseContext(keywordContextItems, searchContextItems, hints.maxChars)

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
        const len = item.text.length

        if (charsUsed + len <= maxKeywordChars) {
            charsUsed += len
            fused.push(item)
        }
    }

    for (const item of embeddingsItems) {
        const len = item.text.length

        if (charsUsed + len <= maxChars) {
            charsUsed += len
            fused.push(item)
        }
    }

    return fused
}
