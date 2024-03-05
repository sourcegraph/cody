import type { URI } from 'vscode-uri'

import type { RangeData } from '../common/range'
import { displayPath } from '../editor/displayPath'
import type { Message } from '../sourcegraph-api'

// tracked for telemetry purposes. Which context source provided this context file.
// embeddings: context file returned by the embeddings client
// user: context file provided by the user explicitly via chat input
// keyword: the context file returned from local keyword search
// editor: context file retrieved from the current editor
// search: context file returned by symf search
// selection: selected code from the current editor
// terminal: output from shell terminal
// unified: remote search
export type ContextFileSource =
    | 'embeddings'
    | 'user'
    | 'keyword'
    | 'editor'
    | 'filename'
    | 'search'
    | 'unified'
    | 'selection'
    | 'terminal'

export type ContextFileType = 'file' | 'symbol'

export type SymbolKind = 'class' | 'function' | 'method'

interface ContextItemCommon {
    uri: URI
    range?: RangeData
    repoName?: string
    revision?: string

    /**
     * For anything other than a file or symbol, the title to display (e.g., "Terminal Output").
     */
    title?: string

    source?: ContextFileSource
    content?: string
}

export type ContextItem = ContextItemFile | ContextItemSymbol
export type ContextItemFile = ContextItemCommon & { type: 'file' }
export type ContextItemSymbol = ContextItemCommon & {
    type: 'symbol'

    /** The fuzzy name of the symbol (if this represents a symbol). */
    symbolName: string

    kind: SymbolKind
}

export interface ContextMessage extends Required<Message> {
    file?: ContextItem
}

export function getContextMessageWithResponse(
    text: string,
    file: ContextItem,
    response = 'Ok.',
    source: ContextFileSource = 'editor'
): ContextMessage[] {
    file.source = file.source || source

    return [
        { speaker: 'human', text, file },
        { speaker: 'assistant', text: response },
    ]
}

export function createContextMessageByFile(item: ContextItem, content: string): ContextMessage[] {
    if (!content) {
        content = item.content ?? ''
    }
    if (!content) {
        return []
    }
    return [
        {
            speaker: 'human',
            text:
                item.type === 'file'
                    ? `Context from file path ${displayPath(item.uri)}:\n${content}`
                    : `${item.symbolName} is a ${item.kind} symbol from file path ${displayPath(
                          item.uri
                      )}:\n${content}`,

            file: item,
        },
        { speaker: 'assistant', text: 'OK.' },
    ]
}
