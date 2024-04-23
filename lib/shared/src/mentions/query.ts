import type { ContextMentionProvider, ContextMentionProviderID } from './api'

/**
 * The parsed representation of a user's (partial or complete) input of an @-mention query.
 */
export interface MentionQuery {
    /**
     * The type of context item to search for.
     */
    provider: 'file' | 'symbol' | 'default' | ContextMentionProviderID

    /**
     * The user's text input, to be interpreted as a fuzzy-matched query. It is stripped of any
     * prefix characters that indicate the {@link MentionQuery.provider}, such as `#` for symbols.
     */
    text: string
}

/**
 * Parse an @-mention query. The {@link query} value is whatever the UI determines is the query
 * based on the current text input; it is not the full value of a message that may or may not
 * contain an @-mention.
 *
 * The {@link query} MUST be stripped of the trigger character (usually `@`). The only valid case
 * where {@link query} may begin with `@` is if the user is searching for context items that contain
 * `@`, such as if the user typed `@@foo` to mention a file that is literally named `@foo.js`.
 */
export function parseMentionQuery(
    query: string,
    contextMentionProviders: Pick<ContextMentionProvider, 'id' | 'triggerPrefixes'>[]
): MentionQuery {
    if (query === '') {
        return { provider: 'default', text: '' }
    }

    if (query.startsWith('#')) {
        return { provider: 'symbol', text: query.slice(1) }
    }

    for (const provider of contextMentionProviders) {
        if (provider.triggerPrefixes.some(trigger => query.startsWith(trigger))) {
            return { provider: provider.id, text: query }
        }
    }

    return { provider: 'file', text: query }
}

const PUNCTUATION = ',\\+\\*\\$\\@\\|#{}\\(\\)\\^\\[\\]!\'"<>;'

const TRIGGERS = '@'

/** Chars we expect to see in a mention (non-space, non-punctuation). */
const VALID_CHARS = '[^' + TRIGGERS + PUNCTUATION + '\\s]'

const MAX_LENGTH = 250

const RANGE_REGEXP = '(?::\\d+(?:-\\d*)?)?'

const AT_MENTIONS_REGEXP = new RegExp(
    '(?<maybeLeadingWhitespace>^|\\s|\\()(?<replaceableString>' +
        '[' +
        TRIGGERS +
        ']' +
        '(?<matchingString>#?(?:' +
        VALID_CHARS +
        '){0,' +
        MAX_LENGTH +
        '}' +
        RANGE_REGEXP +
        ')' +
        ')$'
)

/**
 * The location and content of a mention in free-form user text input.
 */
export interface MentionTrigger {
    /** The number of characters from the start of the text to the mention trigger (`@`). */
    leadOffset: number

    /**
     * The string that is used to query for the context item to mention (to be passed to
     * {@link parseMentionQuery}).
     */
    matchingString: string

    /**
     * Equal to `@` + {@link matchingString}. The entire string that should be replaced with the
     * context item when the at-mention reference is chosen.
     */
    replaceableString: string
}

/**
 * Scans free-form user text input (in a chat message editor, for example) for possible mentions
 * with the `@` trigger character.
 *
 * The {@link textBeforeCursor} is all of the text in the input field before the text insertion
 * point cursor. For example, if the input field looks like `hello
 * @foo█bar`, then {@link textBeforeCursor} should be `hello @foo`.
 */
export function scanForMentionTriggerInUserTextInput(textBeforeCursor: string): MentionTrigger | null {
    const match = AT_MENTIONS_REGEXP.exec(textBeforeCursor)
    if (match?.groups) {
        return {
            leadOffset: match.index + match.groups.maybeLeadingWhitespace.length,
            matchingString: match.groups.matchingString,
            replaceableString: match.groups.replaceableString,
        }
    }
    return null
}
