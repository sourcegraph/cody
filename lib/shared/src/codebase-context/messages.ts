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
    content?: string | null

    repoName?: string
    revision?: string

    /**
     * For anything other than a file or symbol, the title to display (e.g., "Terminal Output").
     */
    title?: string

    /**
     * The description of the context item used to display in mentions menu.
     */
    description?: string

    /**
     * The source of this context item.
     */
    source?: ContextItemSource

    /**
     * The token count of the item's content.
     */
    size?: number

    /**
     * Whether the item is excluded by Cody Ignore.
     */
    isIgnored?: boolean

    /**
     * Whether the content of the item is too large to be included as context.
     */
    isTooLarge?: boolean

    /**
     * If isTooLarage is true, the reason why the file was deemed too long to be included in the context.
     */
    isTooLargeReason?: string

    /**
     * The ID of the {@link ContextMentionProvider} that supplied this context item (or `undefined`
     * if from a built-in context source such as files and symbols).
     */
    provider?: string

    /**
     * Lucid icon name for the context item
     */
    icon?: string

    /**
     * Optional metadata about where this context item came from or how it was scored, which
     * can help a user or dev working on Cody understand why this item is appearing in context.
     */
    metadata?: string[]
}

/**
 * The source of this context.
 */
export enum ContextItemSource {
    /** From embeddings search */
    Embeddings = 'embeddings',

    /** Explicitly @-mentioned by the user in chat */
    User = 'user',

    /** From the current editor state and open tabs/documents */
    Editor = 'editor',

    /** From symf search */
    Search = 'search',

    /** In initial context */
    Initial = 'initial',

    /** Remote search */
    Unified = 'unified',

    /** Selected code from the current editor */
    Selection = 'selection',

    /** Output from the terminal */
    Terminal = 'terminal',

    /** From source control history */
    History = 'history',
}

/**
 * An item (such as a file or symbol) that is included as context in a chat message.
 */
export type ContextItem =
    | ContextItemFile
    | ContextItemRepository
    | ContextItemTree
    | ContextItemSymbol
    | ContextItemOpenCtx

/**
 * A context item that represents a repository.
 */
export interface ContextItemRepository extends ContextItemCommon {
    type: 'repository'
    repoName: string
    repoID: string
    content: null
}

/**
 * A context item that represents a tree (directory).
 */
export interface ContextItemTree extends ContextItemCommon {
    type: 'tree'

    /** Only workspace root trees are supported right now. */
    isWorkspaceRoot: true

    content: null
    name: string
}

/**
 * An OpenCtx context item returned from a provider.
 */
export interface ContextItemOpenCtx extends ContextItemCommon {
    type: 'openctx'
    provider: 'openctx'
    title: string
    uri: URI
    providerUri: string
    mention?: {
        uri: string
        data?: any
        description?: string
    }
}

/**
 * A file (or a subset of a file given by a range) that is included as context in a chat message.
 */
export interface ContextItemFile extends ContextItemCommon {
    type: 'file'

    /**
     * Name of remote repository, this is how mention resolve logic checks
     * that we need to resolve this context item mention via remote search file
     */
    remoteRepositoryName?: string
}

/**
 * A symbol (which is a range within a file) that is included as context in a chat message.
 */
export interface ContextItemSymbol extends ContextItemCommon {
    type: 'symbol'

    /** The name of the symbol, used for presentation only (not semantically meaningful). */
    symbolName: string

    /** The kind of symbol, used for presentation only (not semantically meaningful). */
    kind: SymbolKind

    /**
     * Name of remote repository, this is how mention resolve logic checks
     * that we need to resolve this context item mention via remote search file
     */
    remoteRepositoryName?: string
}

/** The valid kinds of a symbol. */
export type SymbolKind = 'class' | 'function' | 'method'

/** {@link ContextItem} with the `content` field set to the content. */
export type ContextItemWithContent = ContextItem & { content: string }

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

export const GENERAL_HELP_LABEL = 'Search for a file to include, or type # for symbols...'
export const NO_SYMBOL_MATCHES_HELP_LABEL = ' (language extensions may be loading)'
export const FILE_RANGE_TOOLTIP_LABEL = 'Type a line range to include, e.g. 5-10...'
export const LARGE_FILE_WARNING_LABEL =
    'File too large. Add line range with : or use @# to choose a symbol'
export const IGNORED_FILE_WARNING_LABEL = 'File ignored by an admin setting.'
