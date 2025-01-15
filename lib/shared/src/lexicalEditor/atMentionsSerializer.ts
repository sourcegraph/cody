import type { SerializedLexicalNode, SerializedTextNode } from 'lexical'
import type { SerializedElementNode } from 'lexical'
import type { SerializedPromptEditorValue } from './editorState'

const SERIALIZED_PREFIX = 'cody://serialized'

export function serialize(m: SerializedPromptEditorValue): string {
    const nodes: SerializedLexicalNode[] = recurse(m.editorState.lexicalEditorState.root)
    let t = ''
    for (const n of nodes) {
        if (n.type === 'text') {
            t += (n as SerializedTextNode).text
        } else {
            t += `${SERIALIZED_PREFIX}?data=${btoa(JSON.stringify(n, undefined, 0))}`
        }
    }
    return t
}

function recurse(node: SerializedLexicalNode): SerializedLexicalNode[] {
    switch (node.type) {
        case 'root':
        case 'paragraph':
            return (node as SerializedElementNode).children.flatMap(recurse)
        default:
            return [node]
    }
}

export function deserialize(s: string): SerializedPromptEditorValue | undefined {
    if (!s.startsWith(SERIALIZED_PREFIX)) {
        console.warn(`deserialize only accepts ${SERIALIZED_PREFIX} strings`)
        return undefined
    }

    return JSON.parse(atob(s.slice(`${SERIALIZED_PREFIX}?data=`.length))) as SerializedPromptEditorValue
}
