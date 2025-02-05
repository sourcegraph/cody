import type { SerializedElementNode, SerializedLexicalNode, SerializedTextNode } from 'lexical'
import type { SerializedPromptEditorValue } from './editorState'
import type { SerializedContextItem, SerializedContextItemMentionNode } from './nodes'

export const AT_MENTION_SERIALIZED_PREFIX = 'cody://serialized.v1'
const AT_MENTION_SERIALIZATION_END = '_'
const BASE_64_CHARACTERS = '[A-Za-z0-9+/]+={0,2}'

function unicodeSafeBtoa(str: string) {
    return btoa(encodeURIComponent(str))
}

function unicodeSafeAtob(str: string) {
    return decodeURIComponent(atob(str))
}

const CURRENT_TO_HYDRATABLE = {
    'current-selection': 'cody://selection',
    'current-file': 'cody://current-file',
    'current-repository': 'cody://repository',
    'current-directory': 'cody://current-dir',
    'current-open-tabs': 'cody://tabs',
}

function isCurrentKey(value: string): value is keyof typeof CURRENT_TO_HYDRATABLE {
    return Object.keys(CURRENT_TO_HYDRATABLE).includes(value)
}

/**
 * This function serializes a SerializedPromptEditorValue into a string representation that contains serialized
 * elements for contextMentionItems as a base64 encoded string or cody:// syntax for current mentions.
 * The result can be used with the deserialize function to rebuild the editor state.
 *
 * @param m SerializedPromptEditorValue
 */
export function serialize(m: SerializedPromptEditorValue): string {
    const nodes: SerializedLexicalNode[] = renderChildNodes(m.editorState.lexicalEditorState.root)
    let t = ''
    for (const n of nodes) {
        if (n.type === 'text') {
            t += (n as SerializedTextNode).text
        } else if (n.type === 'contextItemMention') {
            const contextItemMention: SerializedContextItem = (n as SerializedContextItemMentionNode)
                .contextItem
            if (isCurrentKey(contextItemMention.type)) {
                t += CURRENT_TO_HYDRATABLE[contextItemMention.type]
            } else {
                t +=
                    `${AT_MENTION_SERIALIZED_PREFIX}?data=${unicodeSafeBtoa(
                        JSON.stringify(n, undefined, 0)
                    )}` + AT_MENTION_SERIALIZATION_END
            }
        } else {
            throw Error('Unhandled node type in atMentionsSerializer.serialize: ' + n.type)
        }
    }
    return t
}

function renderChildNodes(node: SerializedLexicalNode): SerializedLexicalNode[] {
    switch (node.type) {
        case 'root':
        case 'paragraph': {
            const c = (node as SerializedElementNode).children
            const result: SerializedLexicalNode[] = []
            for (let i = 0; i < c.length; i++) {
                result.push(...renderChildNodes(c[i]))
                // Looking ahead is for adding newlines between paragraphs. We can't append a newline after a
                // paragraph, because that will lead to increasing amounts of newlines at the end of the prompt.
                if (c[i].type === 'paragraph' && c[i + 1]?.type === 'paragraph') {
                    result.push(NEW_LINE_NODE)
                }
            }
            return result
        }
        default:
            return [node]
    }
}

const NEW_LINE_NODE = {
    type: 'text',
    text: '\n',
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    version: 1,
}

function deserializeContextMentionItem(s: string) {
    return JSON.parse(
        unicodeSafeAtob(new URL(s).searchParams.get('data')?.replace(AT_MENTION_SERIALIZATION_END, '')!)
    )
}

const CONTEXT_ITEMS = {
    'cody://selection': {
        description: 'Picks the current selection',
        type: 'current-selection',
        title: 'Current Selection',
        text: 'current selection',
    },
    'cody://current-file': {
        description: 'Picks the current file',
        type: 'current-file',
        title: 'Current File',
        text: 'current file',
    },
    'cody://repository': {
        description: 'Picks the current repository',
        type: 'current-repository',
        title: 'Current Repository',
        text: 'current repository',
    },
    'cody://current-dir': {
        description: 'Picks the current directory',
        type: 'current-directory',
        title: 'Current Directory',
        text: 'current directory',
    },
    'cody://tabs': {
        description: 'Picks the current open tabs',
        type: 'current-open-tabs',
        title: 'Current Open Tabs',
        text: 'current open tabs',
    },
} as const

export function deserializeParagraph(s: string): SerializedLexicalNode[] {
    const parts = s.split(
        new RegExp(
            `(${AT_MENTION_SERIALIZED_PREFIX}\\?data=${BASE_64_CHARACTERS}${AT_MENTION_SERIALIZATION_END})`,
            'g'
        )
    )
    return parts
        .map(part => {
            if (part.startsWith(AT_MENTION_SERIALIZED_PREFIX)) {
                try {
                    return deserializeContextMentionItem(part)
                } catch (e) {
                    console.warn(e)
                    return {
                        type: 'text',
                        text: part,
                        detail: 0,
                        format: 0,
                        mode: 'normal',
                        style: '',
                        version: 1,
                    }
                }
            }
            for (const [uri, item] of Object.entries(CONTEXT_ITEMS)) {
                if (part.includes(uri)) {
                    return createContextItemMention(item, uri)
                }
            }
            return {
                type: 'text',
                text: part,
                detail: 0,
                format: 0,
                mode: 'normal',
                style: '',
                version: 1,
            }
        })
        .filter(node => node.text !== '')
}


function createContextItemMention(
    item: (typeof CONTEXT_ITEMS)[keyof typeof CONTEXT_ITEMS],
    uri: string
) {
    return {
        contextItem: {
            description: item.description,
            id: item.type,
            name: item.type,
            type: item.type,
            title: item.title,
            uri,
        },
        isFromInitialContext: false,
        text: item.text,
        type: 'contextItemMention',
        version: 1,
    }
}

export function splitToWords(s: string): string[] {
    /**
     * Regular expression pattern that matches Cody context mentions in two formats:
     * 1. Built-in shortcuts like 'cody://tabs', 'cody://selection' (defined in CONTEXT_ITEMS)
     * 2. Serialized context items like 'cody://serialized.v1?data=base64data_'
     *
     * For built-in shortcuts: stops at whitespace, periods, or newlines
     * For serialized items: includes everything between 'cody://serialized' and '_'
     *
     * Examples:
     * - "cody://tabs." -> matches "cody://tabs"
     * - "cody://serialized.v1?data=123_." -> matches "cody://serialized.v1?data=123_"
     */
    const pattern = /(cody:\/\/(?:serialized[^_]+_|[^_\s.]+))/
    return s.split(pattern)
}

function deserializeDoc(s: string): SerializedLexicalNode[] {
    const paragraphs = s.split('\n')
    return paragraphs.map(deserializeParagraph).map(children => {
        return {
            type: 'paragraph',
            children,
            direction: 'ltr',
            format: '',
            indent: 0,
            version: 1,
            textStyle: '',
            textFormat: 0,
        }
    })
}

/**
 * Deserializes a prompt editor value from a previously serialized editor value.
 *
 * @param s serialized editor value
 */
export function deserialize(s: string): SerializedPromptEditorValue | undefined {
    const children: SerializedLexicalNode[] = deserializeDoc(s)

    return {
        text: 'text',
        // We don't need to provide the contextItems here, they seem to be
        // resolved just fine when running the prompt.
        contextItems: [],
        editorState: {
            v: 'lexical-v1',
            minReaderV: 'lexical-v1',
            lexicalEditorState: {
                root: {
                    type: 'root',
                    children,
                    format: '',
                    indent: 0,
                    version: 1,
                    direction: 'ltr',
                },
            },
        },
    }
}
