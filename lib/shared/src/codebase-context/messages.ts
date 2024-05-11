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
     *
     * @deprecated Whether a {@link ContextItem} is too large is a function of many things (the
     * model's context window size, the user's current message input, the size of the other
     * at-mentioned context items, etc.), and it is not a property of a context item per se. The
     * `isTooLarge` field should be computed much later (closer to where it's used and where the
     * latest UI state is known) and should not be a field here. For past messages stored in the
     * {@link SerializedChatTranscript}, the `isTooLarge` makes more sense, but we should separate
     * serialized context items into a different type altogether.
     */
    isTooLarge?: boolean

    /**
     * The ID of the {@link ContextMentionProvider} that supplied this context item (or `undefined`
     * if from a built-in context source such as files and symbols).
     */
    provider?: string
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

    /** From URI */
    Uri = 'uri',

    /** From a package repository */
    Package = 'package',

    /** From source control history */
    History = 'history',

    /** From Github API */
    Github = 'github',
}

/**
 * An item (such as a file or symbol) that is included as context in a chat message.
 */
export type ContextItem =
    | ContextItemFile
    | ContextItemSymbol
    | ContextItemPackage
    | ContextItemGithubPullRequest
    | ContextItemGithubIssue

/**
 * A Github pull request that is included as context in a chat message.
 */
export interface ContextItemGithubPullRequest extends ContextItemCommon {
    type: 'github_pull_request'

    /**
     * the owner of the repository.
     */
    owner: string

    /**
     * the name of the repository.
     */
    repoName: string

    /**
     *  the number for this pull request.
     */
    pullNumber: number

    /**
     * the title of this pull request.
     */
    title: string
}

/**
 * A Github issue that is included as context in a chat message.
 */
export interface ContextItemGithubIssue extends ContextItemCommon {
    type: 'github_issue'

    /**
     * the owner of the repository.
     */
    owner: string

    /**
     * the name of the repository.
     */
    repoName: string

    /**
     *  the number for this issue.
     */
    issueNumber: number

    /**
     * the title of this issue.
     */
    title: string
}

/**
 * A package repository that is included as context in a chat message.
 */
export interface ContextItemPackage extends ContextItemCommon {
    type: 'package'

    /**
     * the repository id for this package.
     */
    repoID: string

    /**
     * the title for this package.
     */
    title: string
    /**
     * the ecosystem for this package.
     */
    ecosystem: string
    /**
     * the name for this package.
     */
    name: string
}

/**
 * A file (or a subset of a file given by a range) that is included as context in a chat message.
 */
export interface ContextItemFile extends ContextItemCommon {
    type: 'file'
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
