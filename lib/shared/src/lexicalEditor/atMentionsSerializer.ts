import type { SerializedElementNode, SerializedLexicalNode, SerializedTextNode } from 'lexical'
import type { SerializedPromptEditorValue } from './editorState'

const SERIALIZED_PREFIX = 'cody://serialized'
const SERIALIZATION_END = '_'

export function serialize(m: SerializedPromptEditorValue): string {
    const nodes: SerializedLexicalNode[] = recurse(m.editorState.lexicalEditorState.root)
    let t = ''
    for (const n of nodes) {
        if (n.type === 'text') {
            t += (n as SerializedTextNode).text
        } else {
            t += `${SERIALIZED_PREFIX}?data=${btoa(JSON.stringify(n, undefined, 0))}${SERIALIZATION_END}`
        }
    }
    return t
}

function recurse(node: SerializedLexicalNode): SerializedLexicalNode[] {
    switch (node.type) {
        case 'root':
        case 'paragraph': {
            const c = (node as SerializedElementNode).children
            const result: SerializedLexicalNode[] = []
            for (let i = 0; i < c.length; i++) {
                result.push(...recurse(c[i]))
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
    return JSON.parse(atob(new URL(s).searchParams.get('data')?.replace(SERIALIZATION_END, '')!))
}

function deserializeParagraph(s: string) {
    const parts = s.split(new RegExp(`(${SERIALIZED_PREFIX}\\?data=[^\\s]+)`, 'g'))
    return parts
        .map(part => {
            if (part.startsWith(SERIALIZED_PREFIX)) {
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

function deserializeDoc(s: string) {
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
