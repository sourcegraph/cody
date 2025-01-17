import type { SerializedElementNode, SerializedLexicalNode, SerializedTextNode } from 'lexical'
import type { SerializedPromptEditorValue } from './editorState'

export const AT_MENTION_SERIALIZED_PREFIX = 'cody://serialized.v1'
const AT_MENTION_SERIALIZATION_END = '_'

function unicodeSafeBtoa(str: string) {
    return btoa(encodeURIComponent(str));
}

function unicodeSafeAtob(str: string) {
    return decodeURIComponent(atob(str));
}

/**
 * This function serializes a SerializedPromptEditorValue into a string representation that contains serialized
 * elements for contextMentionItems as a base64 encoded string. The result can be used with the deserialize function
 * to rebuild the editor state.
 *
 * @param m SerializedPromptEditorValue
 */
export function serialize(m: SerializedPromptEditorValue): string {
    const nodes: SerializedLexicalNode[] = renderChildNodes(m.editorState.lexicalEditorState.root)
    let t = ''
    for (const n of nodes) {
        if (n.type === 'text') {
            t += (n as SerializedTextNode).text
        } else {
            t += `${AT_MENTION_SERIALIZED_PREFIX}?data=${unicodeSafeBtoa(
                JSON.stringify(n, undefined, 0)
            )}${AT_MENTION_SERIALIZATION_END}`
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

export function deserializeContextMentionItem(s: string) {
    return JSON.parse(
        unicodeSafeAtob(new URL(s).searchParams.get('data')?.replace(AT_MENTION_SERIALIZATION_END, '')!)
    )
}

function deserializeParagraph(s: string): SerializedLexicalNode[] {
    const parts = s.split(new RegExp(`(${AT_MENTION_SERIALIZED_PREFIX}\\?data=[^\\s]+)`, 'g'))
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
