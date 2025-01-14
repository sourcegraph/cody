import type { SerializedPromptEditorValue } from './editorState'

const SERIALIZED_PREFIX = 'cody://serialized.v1'

const REPLACER_MAP = {
    // Highest frequency (single char)
    'type': 't',
    'text': 'x',
    'children': 'c',
    'version': 'v',
    'format': 'f',
    'data': 'd',
    'uri': 'u',

    // Medium frequency (two chars)
    'provider': 'pr',
    'mention': 'mn',
    'source': 'sr',
    'title': 'ti',
    'description': 'ds',
    'repoName': 'rn'
} as const

const TEXT_DEFAULTS = {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    version: 1
}

const PARAGRAPH_DEFAULTS = {
    direction: 'ltr',
    format: '',
    indent: 0,
    version: 1,
    textStyle: '',
    textFormat: 0
}

const ROOT_DEFAULTS = {
    format: '',
    indent: 0,
    version: 1,
    direction: 'ltr'
}

function replacer(_key: string, value: any): any {
    if (value?.type === 'text') {
        return {
            t: 'text',
            x: value.text
        }
    }

    if (value?.type === 'paragraph') {
        return {
            t: 'paragraph',
            c: value.children
        }
    }

    if (value?.type === 'root') {
        return {
            t: 'root',
            c: value.children
        }
    }

    if (typeof value === 'object' && value !== null) {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                REPLACER_MAP[k as keyof typeof REPLACER_MAP] || k,
                v
            ])
        )
    }
    return value
}

function reviver(_key: string, value: any): any {
    if (value?.t === 'text') {
        return {
            type: 'text',
            text: value.x,
            ...TEXT_DEFAULTS
        }
    }

    if (value?.t === 'paragraph') {
        return {
            type: 'paragraph',
            children: value.c,
            ...PARAGRAPH_DEFAULTS
        }
    }

    if (value?.t === 'root') {
        return {
            type: 'root',
            children: value.c,
            ...ROOT_DEFAULTS
        }
    }

    if (typeof value === 'object' && value !== null) {
        const reverseMap = Object.fromEntries(
            Object.entries(REPLACER_MAP).map(([k, v]) => [v, k])
        )
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [
                reverseMap[k] || k,
                v
            ])
        )
    }
    return value
}

// Updated serialize function using the replacer
export function serialize(m: SerializedPromptEditorValue): string {
    return `${SERIALIZED_PREFIX}?data=${btoa(JSON.stringify(m, replacer, 0))}`
}

// Updated deserialize function using the reviver
export function deserialize(s: string): SerializedPromptEditorValue | undefined {
    if (!s.startsWith(SERIALIZED_PREFIX)) {
        console.warn(`deserialize only accepts ${SERIALIZED_PREFIX} strings`)
        return undefined
    }

    return JSON.parse(
        atob(s.slice(`${SERIALIZED_PREFIX}?data=`.length)),
        reviver
    ) as SerializedPromptEditorValue
}
