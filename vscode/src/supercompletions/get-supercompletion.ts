import {
    type ChatClient,
    type Message,
    PromptString,
    contextFiltersProvider,
    getSimplePreamble,
    isAbortError,
    logDebug,
} from '@sourcegraph/cody-shared'
import levenshtein from 'js-levenshtein'
import * as uuid from 'uuid'
import * as vscode from 'vscode'
import { ASSISTANT_EXAMPLE, HUMAN_EXAMPLE, MODEL, PROMPT, SYSTEM } from './prompt'
import type { RecentEditsRetriever } from './recent-edits/recent-edits-retriever'
import { fixIndentation } from './utils/fix-indentation'
import { fuzzyFindLocation } from './utils/fuzzy-find-location'

interface SuperCompletionsParams {
    document: vscode.TextDocument
    abortSignal: AbortSignal

    // Context
    recentEditsRetriever: RecentEditsRetriever
    chat: ChatClient
}

export interface Supercompletion {
    id: string
    location: vscode.Location
    summary: string
    current: string
    updated: string
}

export async function* getSupercompletions({
    document,
    abortSignal,

    recentEditsRetriever,
    chat,
}: SuperCompletionsParams): AsyncGenerator<Supercompletion> {
    if (await contextFiltersProvider.instance!.isUriIgnored(document.uri)) {
        return null
    }

    const diff = await recentEditsRetriever.getDiff(document.uri)
    if (diff === null) {
        return null
    }

    const messages = buildInteraction(document, diff)

    for await (const rawChange of generateRawChanges(chat, messages, abortSignal)) {
        const supercompletion = parseRawChange(document, rawChange)
        if (!supercompletion) {
            continue
        }
        logDebug('supercompletions', 'candidate', { verbose: supercompletion })
        yield supercompletion
    }
}

interface RawChange {
    summary: string
    change: string
}
async function* generateRawChanges(
    chat: ChatClient,
    messages: Message[],
    abortSignal: AbortSignal
): AsyncGenerator<RawChange> {
    const stream = chat.chat(
        messages,
        { model: MODEL, temperature: 0.1, maxTokensToSample: 1000 },
        abortSignal
    )

    let processedLastIndex = 0
    for await (const message of stream) {
        switch (message.type) {
            case 'change': {
                const completion = message.text

                const match = completion
                    .slice(processedLastIndex)
                    .match(/<next-change>(.*)<\/next-change>/s)

                if (match?.index) {
                    processedLastIndex = processedLastIndex + match.index + match[0].length
                    const change = match[1]
                    const summaryMatch = change.match(/<summary>(.*)<\/summary>/s)
                    const changeMatch = change.match(/<change>(.*)<\/change>/s)

                    if (!summaryMatch || !changeMatch) {
                        logDebug('supercompletions', 'error', 'invalid change block', {
                            verbose: change,
                        })
                        continue
                    }

                    yield {
                        summary: summaryMatch[1],
                        change: changeMatch[1],
                    }
                }
                break
            }
            case 'complete': {
                break
            }
            case 'error': {
                if (isAbortError(message.error)) {
                    return
                }
                throw message.error
            }
        }
    }
}

const START_DELIMINATOR = /^[<]{6,8} ORIGINAL$/
const MIDDLE_DELIMINATOR = /^[=]{6,8}$/
const END_DELIMINATOR = /^[>]{6,8} UPDATED$/
function parseRawChange(
    document: vscode.TextDocument,
    { change, summary }: RawChange
): Supercompletion | null {
    const lines = change.split('\n')
    const originalLines = []
    const updatedLines = []
    let state: null | 'original' | 'updated' | 'complete' = null
    for (const line of lines) {
        if (state === null) {
            if (START_DELIMINATOR.test(line)) {
                state = 'original'
                continue
            }
            continue
        }
        if (state === 'original') {
            if (MIDDLE_DELIMINATOR.test(line)) {
                state = 'updated'
                continue
            }
            originalLines.push(line)
            continue
        }
        if (state === 'updated') {
            if (END_DELIMINATOR.test(line)) {
                state = 'complete'
                continue
            }
            updatedLines.push(line)
        }
    }

    if (state !== 'complete') {
        logDebug(
            'supercompletions',
            'error',
            'could not find change deliminators',
            { state },
            {
                verbose: change,
            }
        )
        return null
    }

    const original = originalLines.join('\n')
    let updated = updatedLines.join('\n')

    const result = fuzzyFindLocation(document, original)
    if (!result) {
        return null
    }
    const { location, distance } = result
    const current = document.getText(location.range)

    if (distance > 0) {
        updated = fixIndentation(current, original, updated)
    }

    // Filter out trivial changes. This is mostly to filter out when the LLM
    // includes the recent change as a proposed changed
    if (levenshtein(current, updated) < 2) {
        console.log('skipped trivial change')
        return null
    }

    const fullSupercompletion = {
        id: uuid.v4(),
        location,
        summary,
        current,
        updated,
    } satisfies Supercompletion

    return removeContextRows(document, fullSupercompletion)
}

function buildInteraction(document: vscode.TextDocument, diff: PromptString): Message[] {
    const indentation = PromptString.fromEditorIndentString(
        document.uri,
        vscode.workspace,
        vscode.window
    )

    const preamble = getSimplePreamble(MODEL, 1, 'Default', SYSTEM.replaceAll('____', indentation))

    const prompt = PROMPT.replaceAll('{filename}', PromptString.fromDisplayPath(document.uri))
        .replaceAll('{source}', PromptString.fromDocumentText(document))
        .replaceAll('{git-diff}', diff)
        .replaceAll('____', indentation)

    return [
        ...preamble,
        { speaker: 'human', text: HUMAN_EXAMPLE.replaceAll('____', indentation) },
        { speaker: 'assistant', text: ASSISTANT_EXAMPLE.replaceAll('____', indentation) },
        { speaker: 'human', text: prompt },
    ]
}

// This function takes a supercompletion and adjusts the location to removes all
// but one context row on each side (rows which are the same in both the current
// and the updated text).
function removeContextRows(
    document: vscode.TextDocument,
    supercompletion: Supercompletion
): Supercompletion {
    const currentLines = supercompletion.current.split('\n')
    const updatedLines = supercompletion.updated.split('\n')

    const minLines = Math.min(currentLines.length, updatedLines.length)

    const initialStartLine = supercompletion.location.range.start.line
    const initialEndLine = supercompletion.location.range.end.line
    let startLine = initialStartLine
    let endLine = initialEndLine

    // Start from beginning. We can use the same index for both arrays
    for (let i = 0; i < minLines; i++) {
        if (currentLines[i] !== updatedLines[i] || startLine === endLine) {
            break
        }
        startLine++
    }

    // Start from the end. Calculate the indexes independently
    for (let i = 0; i < minLines; i++) {
        const ci = currentLines.length - i - 1
        const ui = updatedLines.length - i - 1
        if (currentLines[ci] !== updatedLines[ui] || startLine === endLine) {
            break
        }
        endLine--
    }

    if (startLine === endLine) {
        // Include one context line before and after the insertion, if the change is
        // a pure insertion
        startLine = Math.max(0, startLine - 1)
        // endLine is kept since the selection will span towards the end of the line anyways
    }

    const newCurrent = currentLines
        .slice(startLine - initialStartLine, currentLines.length + endLine - initialEndLine)
        .join('\n')
    const newUpdated = updatedLines
        .slice(startLine - initialStartLine, updatedLines.length + endLine - initialEndLine)
        .join('\n')

    const newRange = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length)

    return {
        ...supercompletion,
        location: new vscode.Location(supercompletion.location.uri, newRange),
        current: newCurrent,
        updated: newUpdated,
    }
}
