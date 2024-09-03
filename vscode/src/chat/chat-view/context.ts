import * as vscode from 'vscode'

import {
    type ConfigurationUseContext,
    type ContextItem,
    type ContextItemRepository,
    ContextItemSource,
    type ContextItemTree,
    MAX_BYTES_PER_FILE,
    NUM_CODE_RESULTS,
    NUM_TEXT_RESULTS,
    type PromptString,
    type Result,
    isAbortError,
    isFileURI,
    truncateTextNearestLine,
    uriBasename,
    wrapInActiveSpan,
} from '@sourcegraph/cody-shared'
import type { RemoteSearch } from '../../context/remote-search'
import { resolveContextItems } from '../../editor/utils/editor-context'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { LocalEmbeddingsController } from '../../local-context/local-embeddings'
import type { SymfRunner } from '../../local-context/symf'
import { logDebug, logError } from '../../log'

export interface HumanInput {
    text: PromptString
    mentions: ContextItem[]
}

/**
 * Resolve all @-mentions, including special @-mentions that refer to corpuses (not individual
 * documents) like `@repository` and `@directory`, for which context search is performed.
 */
export async function resolveContext({
    strategy,
    editor,
    input,
    providers: { remoteSearch, symf, localEmbeddings },
    signal,
}: {
    strategy: ConfigurationUseContext
    editor: VSCodeEditor
    input: HumanInput
    providers: {
        localEmbeddings: LocalEmbeddingsController | null
        symf: SymfRunner | null
        remoteSearch: RemoteSearch | null
    }
    signal?: AbortSignal
}): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.resolveCorpusContextMentions', async () => {
        // use user attention context only if config is set to none
        if (strategy === 'none') {
            logDebug('ChatController', 'resolveContext > none')
            return getVisibleEditorContext(editor)
        }

        const repoMentions = input.mentions.filter(
            (item): item is ContextItemRepository => item.type === 'repository'
        )
        const treeMentions = input.mentions.filter(
            (item): item is ContextItemTree => item.type === 'tree'
        )
        const otherMentions = input.mentions.filter(
            (item): item is Exclude<ContextItem, ContextItemRepository | ContextItemTree> =>
                item.type !== 'repository' && item.type !== 'tree'
        )

        // Right now, repo mentions are always remote (remoteSearch), and tree mentions are always
        // local (symf or embeddings).

        // Remote search:
        const repoContextSearchResults =
            remoteSearch && repoMentions.length > 0
                ? retrieveContextGracefully(
                      searchRemote(
                          remoteSearch,
                          input.text,
                          repoMentions.map(m => m.repoID),
                          signal
                      ),
                      'remote-search'
                  )
                : []

        // Symf search:
        const treeContextSymfSearchResults =
            symf && strategy !== 'embeddings' && treeMentions.length > 0
                ? Promise.all(
                      treeMentions.map(tree =>
                          retrieveContextGracefully(
                              searchSymf(symf, editor, tree.uri, input.text),
                              `symf ${tree.name}`
                          )
                      )
                  ).then(v => v.flat())
                : Promise.resolve([])

        // Embeddings search. Note that this is hard-coded to only work on a single workspace root
        // and is not scoped to a dir, so we just run it once. TODO: Make it scoped to a dir.
        const treeContextEmbeddingsSearchResults =
            localEmbeddings && strategy !== 'keyword' && treeMentions.length > 0
                ? retrieveContextGracefully(
                      searchEmbeddingsLocal(localEmbeddings, input.text),
                      'local-embeddings'
                  )
                : Promise.resolve([])

        // Other @-mentions:
        const otherMentionsResolved = resolveContextItems(editor, otherMentions, input.text, signal)

        const allContext: ContextItem[] = (
            await Promise.all([
                repoContextSearchResults,
                treeContextSymfSearchResults,
                treeContextEmbeddingsSearchResults,
                otherMentionsResolved,
            ])
        ).flat()
        const priorityContext = await getPriorityContext(input.text, editor, allContext)
        return priorityContext.concat(allContext)
    })
}

async function searchRemote(
    remoteSearch: RemoteSearch,
    input: PromptString,
    repoIDs: string[],
    signal?: AbortSignal
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.search.remote', async () => {
        if (!remoteSearch) {
            return []
        }
        return (await remoteSearch.query(input, repoIDs, signal)).map(result => {
            return {
                type: 'file',
                content: result.content,
                range: new vscode.Range(result.startLine, 0, result.endLine, 0),
                uri: result.uri,
                source: ContextItemSource.Unified,
                repoName: result.repoName,
                title: result.path,
                revision: result.commit,
            } satisfies ContextItem
        })
    })
}

/**
 * Uses symf to conduct a local search within the current workspace folder
 */
export async function searchSymf(
    symf: SymfRunner | null,
    editor: VSCodeEditor,
    workspaceRoot: vscode.Uri,
    userText: PromptString,
    blockOnIndex = false
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.symf', async () => {
        if (!symf) {
            return []
        }
        if (!isFileURI(workspaceRoot)) {
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
                        text = truncateSymfResult(text)
                    } catch (error) {
                        logError('ChatController.searchSymf', `Error getting file contents: ${error}`)
                        return []
                    }

                    const metadata: string[] = [
                        'source:symf-index',
                        'score:' + result.blugeScore.toFixed(0),
                    ]
                    if (result.heuristicBoostID) {
                        metadata.push('boost:' + result.heuristicBoostID)
                    }
                    return {
                        type: 'file',
                        uri: result.file,
                        range,
                        source: ContextItemSource.Search,
                        content: text,
                        metadata,
                    }
                }
            )
            return (await Promise.all(items)).flat()
        })

        return (await Promise.all(r0)).flat()
    })
}

export async function searchEmbeddingsLocal(
    localEmbeddings: LocalEmbeddingsController,
    text: PromptString,
    numResults: number = NUM_CODE_RESULTS + NUM_TEXT_RESULTS
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.embeddings.local', async span => {
        logDebug('ChatController', 'resolveContext > searching local embeddings')
        const contextItems: ContextItem[] = []
        const embeddingsResults = await localEmbeddings.getContext(text, numResults)
        span.setAttribute('numResults', embeddingsResults.length)

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
                source: ContextItemSource.Embeddings,
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
                content: visible.content,
                uri: fileUri,
                source: ContextItemSource.Editor,
            },
        ] satisfies ContextItem[]
    })
}

export async function getPriorityContext(
    text: PromptString,
    editor: VSCodeEditor,
    retrievedContext: ContextItem[]
): Promise<ContextItem[]> {
    return wrapInActiveSpan('chat.context.priority', async () => {
        const priorityContext: ContextItem[] = []
        if (needsUserAttentionContext(text)) {
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

function needsUserAttentionContext(input: PromptString): boolean {
    const inputLowerCase = input.toString().toLowerCase()
    // If the input matches any of the `editorRegexps` we assume that we have to include
    // the editor context (e.g., currently open file) to the overall message context.
    for (const regexp of userAttentionRegexps) {
        if (inputLowerCase.match(regexp)) {
            return true
        }
    }
    return false
}

function needsReadmeContext(editor: VSCodeEditor, input: PromptString): boolean {
    const stringInput = input.toString().toLowerCase()
    const question = extractQuestion(stringInput)
    if (!question) {
        return false
    }

    // split input into words, discarding spaces and punctuation
    const words = stringInput.split(/\W+/).filter(w => w.length > 0)
    const bagOfWords = Object.fromEntries(words.map(w => [w, true]))

    let containsProjectSignifier = false
    const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name
    if (workspaceName && stringInput.includes('@' + workspaceName)) {
        containsProjectSignifier = true
    } else {
        const projectSignifiers = [
            'project',
            'repository',
            'repo',
            'library',
            'package',
            'module',
            'codebase',
        ]
        for (const p of projectSignifiers) {
            if (bagOfWords[p]) {
                containsProjectSignifier = true
                break
            }
        }
    }

    let containsQuestionIndicator = false
    for (const q of ['what', 'how', 'describe', 'explain']) {
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
            range,
            source: ContextItemSource.Editor,
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

export async function retrieveContextGracefully<T>(
    promise: Promise<T[]>,
    strategy: string
): Promise<T[]> {
    try {
        logDebug('ChatController', `resolveContext > ${strategy} (start)`)
        return await promise
    } catch (error) {
        if (isAbortError(error)) {
            logError('ChatController', `resolveContext > ${strategy}' (aborted)`)
            throw error
        }
        logError('ChatController', `resolveContext > ${strategy}' (error)`, error)
        return []
    } finally {
        logDebug('ChatController', `resolveContext > ${strategy} (end)`)
    }
}

const maxSymfBytes = 2_048
export function truncateSymfResult(text: string): string {
    if (text.length >= maxSymfBytes) {
        text = text.slice(0, maxSymfBytes)
        const j = text.lastIndexOf('\n')
        if (j !== -1) {
            text = text.slice(0, j)
        }
    }
    return text
}
