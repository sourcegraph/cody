import type { SerializedPromptEditorValue } from './editorState'

const SERIALIZED_PREFIX = 'cody://serialized.v1'

export function serialize(m: SerializedPromptEditorValue): string {
    return `${SERIALIZED_PREFIX}?data=${btoa(JSON.stringify(m, undefined, 0))}`
}

export function deserialize(s: string): SerializedPromptEditorValue | undefined {
    if (!s.startsWith(SERIALIZED_PREFIX)) {
        console.warn(`deserialize only accepts ${SERIALIZED_PREFIX} strings`)
        return undefined
    }

    return JSON.parse(atob(s.slice(`${SERIALIZED_PREFIX}?data=`.length))) as SerializedPromptEditorValue
}
