import {
    $getRoot,
    type EditorState,
    type LexicalEditor,
    type SerializedEditorState,
    type SerializedLexicalNode,
    type SerializedRootNode,
    type SerializedTextNode,
} from 'lexical'
import type { ChatMessage } from '../chat/transcript/messages'
import { ContextItemSource } from '../codebase-context/messages'
import type { RangeData } from '../common/range'
import { displayPath } from '../editor/displayPath'
import type { PromptString } from '../prompt/prompt-string'
import {
    CONTEXT_ITEM_MENTION_NODE_TYPE,
    type SerializedContextItem,
    type SerializedContextItemMentionNode,
    isSerializedContextItemMentionNode,
    serializeContextItem,
} from './nodes'

export interface SerializedPromptEditorValue {
    /** The editor's value as plain text. */
    text: string

    /** The context items mentioned in the value. */
    contextItems: SerializedContextItem[]

    /** The internal state of the editor that can be used to restore the editor. */
    editorState: SerializedPromptEditorState
}

export function toSerializedPromptEditorValue(editor: LexicalEditor): SerializedPromptEditorValue {
    const editorState = toPromptEditorState(editor)
    return {
        text: editorStateToText(editor.getEditorState()),
        contextItems: contextItemsFromPromptEditorValue(editorState),
        editorState,
    }
}

/**
 * This version string is stored in {@link SerializedPromptEditorState} to indicate the schema
 * version of the value.
 *
 * This code must preserve (1) backward-compatibility, so that values written by older versions can
 * be read by newer versions and (2) forward-compatibility, so that values written by newer versions
 * can be partially read by older versions (such as supporting the text but not rich formatting).
 *
 * If you need to make a breaking change to the {@link SerializedPromptEditorState} schema, follow
 * these guidelines and consult with a tech lead first. There should be a period of time (at least 1
 * month) where both the old and new schemas are supported for reading, and the old schema is
 * written. Then you can switch to having it write the new schema (knowing that even clients ~1
 * month old can read that schema).
 */
export const STATE_VERSION_CURRENT = 'lexical-v0' as const

/**
 * The representation of a user's prompt input in the chat view.
 */
export interface SerializedPromptEditorState {
    /**
     * Version identifier for this type. If this type changes, the version identifier must change,
     * and callers must check this value to ensure they are working with the correct type.
     */
    v: typeof STATE_VERSION_CURRENT

    /**
     * The minimum version of reader that can read this value. If STATE_VERSION_CURRENT >=
     * minReaderV, then this version of the code can read this value. If undefined, its value is
     * {@link DEFAULT_MIN_READER_V},
     */
    minReaderV?: typeof STATE_VERSION_CURRENT

    /**
     * The [Lexical editor state](https://lexical.dev/docs/concepts/editor-state).
     */
    lexicalEditorState: SerializedEditorState
}

const DEFAULT_MIN_READER_V = 'lexical-v0' as const

function toPromptEditorState(editor: LexicalEditor): SerializedPromptEditorState {
    const editorState = editor.getEditorState()
    return {
        v: STATE_VERSION_CURRENT,
        minReaderV: STATE_VERSION_CURRENT,
        lexicalEditorState: editorState.toJSON(),
    }
}

/**
 * This treats the entire text as plain text and does not parse it for any @-mentions.
 */
export function serializedPromptEditorStateFromText(text: string): SerializedPromptEditorState {
    const editorState: SerializedEditorState = {
        root: {
            children: [
                {
                    children: [
                        {
                            detail: 0,
                            format: 0,
                            mode: 'normal',
                            style: '',
                            text,
                            type: 'text',
                            version: 1,
                        },
                    ],
                    direction: 'ltr',
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                } as SerializedLexicalNode,
            ],
            direction: 'ltr',
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
        },
    }
    return {
        v: STATE_VERSION_CURRENT,
        minReaderV: STATE_VERSION_CURRENT,
        lexicalEditorState: editorState,
    }
}

export function serializedPromptEditorStateFromChatMessage(
    chatMessage: ChatMessage
): SerializedPromptEditorState {
    function isCompatibleVersionEditorState(value: unknown): value is SerializedPromptEditorState {
        return (
            Boolean(value) &&
            ((value as SerializedPromptEditorState).v === STATE_VERSION_CURRENT ||
                // Update if the SerializedPromptEditorState version changes.
                ((value as SerializedPromptEditorState).minReaderV ?? DEFAULT_MIN_READER_V) ===
                    STATE_VERSION_CURRENT)
        )
    }

    if (isCompatibleVersionEditorState(chatMessage.editorState)) {
        return chatMessage.editorState
    }

    // Fall back to using plain text for chat messages that don't have a serialized Lexical editor
    // state that we recognize.
    //
    // It would be smoother to automatically import or convert textual @-mentions to the Lexical
    // mention nodes, but that would add a lot of extra complexity for the relatively rare use case
    // of editing old messages in your chat history.
    return serializedPromptEditorStateFromText(chatMessage.text ? chatMessage.text.toString() : '')
}

export function contextItemsFromPromptEditorValue(
    state: SerializedPromptEditorState
): SerializedContextItem[] {
    const contextItems: SerializedContextItem[] = []

    if (state.lexicalEditorState) {
        const queue: SerializedLexicalNode[] = [state.lexicalEditorState.root]
        while (queue.length > 0) {
            const node = queue.shift()
            if (node && 'children' in node && Array.isArray(node.children)) {
                for (const child of node.children as SerializedLexicalNode[]) {
                    if (isSerializedContextItemMentionNode(child)) {
                        contextItems.push(child.contextItem)
                    }
                    queue.push(child)
                }
            }
        }
    }

    return contextItems
}

export function filterContextItemsFromPromptEditorValue(
    value: SerializedPromptEditorValue,
    keep: (item: SerializedContextItem) => boolean
): SerializedPromptEditorValue {
    const editorState: typeof value.editorState.lexicalEditorState = JSON.parse(
        JSON.stringify(value.editorState.lexicalEditorState)
    )
    const queue: SerializedLexicalNode[] = [editorState.root]
    while (queue.length > 0) {
        const node = queue.shift()
        if (node && 'children' in node && Array.isArray(node.children)) {
            node.children = node.children.filter(child =>
                isSerializedContextItemMentionNode(child) ? keep(child.contextItem) : true
            )
            for (const child of node.children as SerializedLexicalNode[]) {
                queue.push(child)
            }
        }
    }

    return {
        ...value,
        editorState: {
            ...value.editorState,
            lexicalEditorState: editorState,
        },
        text: textContentFromSerializedLexicalNode(editorState.root),
        contextItems: value.contextItems.filter(item => keep(serializeContextItem(item))),
    }
}

export function textContentFromSerializedLexicalNode(
    root: SerializedLexicalNode | SerializedRootNode,
    __testing_textContent?: (node: SerializedLexicalNode) => string | undefined
): string {
    const text: string[] = []
    const queue: SerializedLexicalNode[] = [root]
    while (queue.length > 0) {
        const node = queue.shift()!
        if ('text' in node && typeof node.text === 'string') {
            text.push(__testing_textContent ? __testing_textContent(node) ?? node.text : node.text)
        }
        if (node && 'children' in node && Array.isArray(node.children)) {
            for (const child of node.children as SerializedLexicalNode[]) {
                queue.push(child)
            }
        }
    }
    return text.join('')
}

export function editorStateToText(editorState: EditorState): string {
    return editorState.read(() => $getRoot().getTextContent())
}

export function lexicalEditorStateFromPromptString(input: PromptString): SerializedEditorState {
    // HACK(sqs): This breaks if the PromptString's references' displayPaths are present anywhere
    // else. A better solution would be to track range information for the constituent PromptString
    // parts.
    const refs = input.getReferences()
    const refsByDisplayPath = new Map()
    for (const ref of refs) {
        refsByDisplayPath.set(displayPath(ref), ref)
    }

    function textNode(text: string): SerializedTextNode {
        return {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            type: 'text',
            version: 1,
            text,
        }
    }

    const children: (SerializedTextNode | SerializedContextItemMentionNode)[] = []
    let lastTextNode: SerializedTextNode | undefined
    const words = input.toString().split(' ')
    for (const word of words) {
        if (word.startsWith('@')) {
            const [displayPath, maybeRange] = word.slice(1).split(':', 2)
            const range = maybeRange ? parseRangeString(maybeRange) : undefined
            const uri = refsByDisplayPath.get(displayPath)
            if (uri) {
                if (lastTextNode) {
                    children.push(lastTextNode)
                    lastTextNode = undefined
                }

                children.push({
                    type: CONTEXT_ITEM_MENTION_NODE_TYPE,
                    contextItem: serializeContextItem({
                        type: 'file',
                        uri,
                        range,
                        // HACK(sqs): makes Explain work, but see HACK note above.
                        source: range ? ContextItemSource.User : ContextItemSource.Editor,
                    }),
                    detail: 1,
                    format: 0,
                    mode: 'token',
                    style: '',
                    text: word,
                    isFromInitialContext: false,
                    version: 1,
                })
                lastTextNode = textNode(' ')
                continue
            }
        }

        if (!lastTextNode) {
            lastTextNode = textNode('')
        }
        lastTextNode.text += `${word} `
    }
    if (lastTextNode) {
        lastTextNode.text = lastTextNode.text.trimEnd()
        children.push(lastTextNode)
    }

    return {
        root: {
            direction: null,
            format: '',
            indent: 0,
            type: 'root',
            version: 1,
            children: [
                {
                    direction: null,
                    format: '',
                    indent: 0,
                    type: 'paragraph',
                    version: 1,
                    children,
                } as SerializedLexicalNode,
            ],
        },
    }
}

function parseRangeString(str: string): RangeData | undefined {
    const [startStr, endStr] = str.split('-', 2)
    if (!startStr || !endStr) {
        return undefined
    }
    const start = Number.parseInt(startStr)
    const end = Number.parseInt(endStr)
    if (Number.isNaN(start) || Number.isNaN(end)) {
        return undefined
    }
    return { start: { line: start - 1, character: 0 }, end: { line: end, character: 0 } }
}
