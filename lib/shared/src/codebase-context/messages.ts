import type { URI } from 'vscode-uri'

import type { RangeData } from '../common/range'
import type { Message } from '../sourcegraph-api'

export type ContextFileType = 'file' | 'symbol'

/**
 * Fields that are common to any context item included in chat messages.
 */
interface ContextItemCommon {
    /**
     * The URI of the document (such as a file) where this context resides.
     */
    uri: URI

    /**
     * If only a subset of a file is included as context, the range of that subset.
     */
    range?: RangeData

    /**
     * The content, either the entire document or the range subset.
     */
    content?: string

    repoName?: string
    revision?: string

    /**
     * For anything other than a file or symbol, the title to display (e.g., "Terminal Output").
     */
    title?: string

    /**
     * The source of this context item.
     */
    source?: ContextItemSource
}

/**
 * The source of this context.
 */
export enum ContextItemSource {
    /** From embeddings search */
    Embeddings = 'embeddings',

    /** Explicitly @-mentioned by the user in chat */
    User = 'user',

    /** From local keyword search */
    Keyword = 'keyword',

    /** From the current editor state and open tabs/documents */
    Editor = 'editor',

    Filename = 'filename',

    /** From symf search */
    Search = 'search',

    /** Remote search */
    Unified = 'unified',

    /** Selected code from the current editor */
    Selection = 'selection',

    /** Output from the terminal */
    Terminal = 'terminal',
}

/**
 * An item (such as a file or symbol) that is included as context in a chat message.
 */
export type ContextItem = ContextItemFile | ContextItemSymbol

/**
 * A file (or a subset of a file given by a range) that is included as context in a chat message.
 */
export interface ContextItemFile extends ContextItemCommon {
    type: 'file'

    /**
     * Whether the file is too large to be included as context.
     */
    isTooLarge?: boolean
}

/**
 * A symbol (which is a range within a file) that is included as context in a chat message.
 */
export type ContextItemSymbol = ContextItemCommon & {
    type: 'symbol'

    /** The name of the symbol, used for presentation only (not semantically meaningful). */
    symbolName: string

    /** The kind of symbol, used for presentation only (not semantically meaningful). */
    kind: SymbolKind
}

/** The valid kinds of a symbol. */
export type SymbolKind = 'class' | 'function' | 'method'

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
