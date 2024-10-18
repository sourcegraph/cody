import type { RangeData } from '../common/range'
import {
    type ContextMentionProviderID,
    type ContextMentionProviderMetadata,
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
} from './api'

/**
 * The parsed representation of a user's (partial or complete) input of an @-mention query.
 */
export interface MentionQuery {
    /**
     * Interaction ID is used to indicate for what view instance this data will
     * be used. This is primarily used to record telemetry events. If no
     * Interaction ID is specified it is assumed that the data is not shown to
     * the user.
     */
    interactionID?: string | number | undefined | null

    /**
     * The type of context item to search for, or null to find suggested items across (possibly) all
     * providers.
     */
    provider: ContextMentionProviderID | null

    /**
     * The user's text input, to be interpreted as a fuzzy-matched query.
     */
    text: string

    /**
     * The line range in the query, if any.
     */
    range?: RangeData

    /**
     * If the query suffix resembles a partially typed range suffix (such as `foo.txt:`,
     * `foo.txt:1`, or `foo.txt:12-`).
     */
    maybeHasRangeSuffix?: boolean

    /**
     * To control source of standard mention suggestions (files and symbols),
     * search API will try to find suggestions across remote repositories
     * user has on their instance. (Cody Web use case)
     */
    contextRemoteRepositoriesNames?: string[]
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
    provider: Pick<ContextMentionProviderMetadata, 'id'> | null
): MentionQuery {
    if (provider) {
        return { provider: provider.id, text: query }
    }

    if (query === '') {
        return { provider: null, text: '' }
    }

    // Special-case '#' as a trigger prefix for symbols.
    if (query.startsWith('#')) {
        return { provider: SYMBOL_CONTEXT_MENTION_PROVIDER.id, text: query.slice(1) }
    }

    const { textWithoutRange, maybeHasRangeSuffix, range } = extractRangeFromFileMention(query)
    return {
        provider: FILE_CONTEXT_MENTION_PROVIDER.id,
        text: textWithoutRange,
        maybeHasRangeSuffix,
        range,
    }
}

const RANGE_SUFFIX_REGEXP = /:(?:(\d+)-?)?(\d+)?$/
const LINE_RANGE_REGEXP = /:(\d+)-(\d+)$/

/**
 * Parses the line range (if any) at the end of a string like `foo.txt:1-2`. Because this means "all
 * of lines 1 and 2", the returned range actually goes to the start of line 3 to ensure all of line
 * 2 is included. Also, lines in mentions are 1-indexed while `RangeData` is 0-indexed.
 */
export function extractRangeFromFileMention(query: string): {
    textWithoutRange: string
    maybeHasRangeSuffix: boolean
    range?: RangeData
} {
    const maybeHasRangeSuffix = RANGE_SUFFIX_REGEXP.test(query)

    const match = query.match(LINE_RANGE_REGEXP)
    if (match === null) {
        return { textWithoutRange: query.replace(RANGE_SUFFIX_REGEXP, ''), maybeHasRangeSuffix }
    }

    let startLine = Number.parseInt(match[1], 10)
    let endLine = Number.parseInt(match[2], 10)
    if (startLine > endLine) {
        // Reverse range so that startLine is always before endLine.
        ;[startLine, endLine] = [endLine, startLine]
    }
    return {
        textWithoutRange: query.slice(0, -match[0].length),
        maybeHasRangeSuffix: true,
        range: {
            start: { line: startLine - 1, character: 0 },
            end: { line: endLine, character: 0 },
        },
    }
}

const PUNCTUATION = ',\\+\\*\\$\\|#{}\\(\\)\\^\\[\\]!\'"<>;'

const TRIGGERS = '@'

const MAX_LENGTH = 250

const RANGE_REGEXP = '(?::\\d+(?:-\\d*)?)?'

function generateAtMentionsRegExp(params: {
    includeWhitespace: boolean
}): RegExp {
    const { includeWhitespace } = params
    /** Chars we expect to see in a mention. */
    const validChars = '[^' + PUNCTUATION + (includeWhitespace ? '' : '\\s') + ']'

    return new RegExp(
        '(?<maybeLeadingWhitespace>^|\\s|\\()(?<replaceableString>' +
            '[' +
            TRIGGERS +
            ']' +
            '(?<matchingString>#?(?:' +
            validChars +
            '){0,' +
            MAX_LENGTH +
            '}' +
            RANGE_REGEXP +
            ')' +
            ')$'
    )
}

/**
 * Used to scan for mentions in the quick pick menu.
 */
const AT_MENTIONS_REGEXP_NO_SPACES = generateAtMentionsRegExp({ includeWhitespace: false })

/**
 * Used to scan for mentions in the Lexical input.
 */
const AT_MENTIONS_REGEXP_ALLOW_SPACES = generateAtMentionsRegExp({ includeWhitespace: true })

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

interface ScanForMentionsParams {
    textBeforeCursor: string
    includeWhitespace: boolean
}

/**
 * Scans free-form user text input (in a chat message editor, for example) for possible mentions
 * with the `@` trigger character.
 *
 * The {@link textBeforeCursor} is all of the text in the input field before the text insertion
 * point cursor. For example, if the input field looks like `hello
 * @foo█bar`, then {@link textBeforeCursor} should be `hello @foo`.
 */
export function scanForMentionTriggerInUserTextInput(
    params: ScanForMentionsParams
): MentionTrigger | null {
    const { textBeforeCursor, includeWhitespace } = params
    const atMentionRegex = includeWhitespace
        ? AT_MENTIONS_REGEXP_ALLOW_SPACES
        : AT_MENTIONS_REGEXP_NO_SPACES

    const match = atMentionRegex.exec(textBeforeCursor)

    if (match?.groups) {
        return {
            leadOffset: match.index + match.groups.maybeLeadingWhitespace.length,
            matchingString: match.groups.matchingString,
            replaceableString: match.groups.replaceableString,
        }
    }
    return null
}
