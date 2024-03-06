import type { URI } from 'vscode-uri'

import type { RangeData } from '../common/range'
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

/** {@link ContextItem} with the `content` field set to the content. */
export type ContextItemWithContent = ContextItem & Required<Pick<ContextItem, 'content'>>

/**
 * A system chat message that adds a context item to the conversation.
 */
export interface ContextMessage extends Required<Message> {
    /**
     * Context messages are always "from" the human. (In the future, this could be from "system" for
     * LLMs that support that kind of message, but that `speaker` value is not currently supported
     * by the `Message` type.)
     */
    speaker: 'human'

    /**
     * The context item that this message introduces into the conversation.
     */
    file: ContextItem
}
