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
    type SerializedTemplateInputNode,
    TEMPLATE_INPUT_NODE_TYPE,
    contextItemMentionNodeDisplayText,
    isSerializedContextItemMentionNode,
    serializeContextItem,
    templateInputNodeDisplayText,
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
 * This type encodes all known versions of serialized editor state.
 */
type StateVersion = 'lexical-v0' | 'lexical-v1'

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
const STATE_VERSION_CURRENT: StateVersion = 'lexical-v1'

/**
 * The representation of a user's prompt input in the chat view.
 */
export interface SerializedPromptEditorState {
    /**
     * Version identifier for this type. If this type changes, the version identifier must change,
     * and callers must check this value to ensure they are working with the correct type.
     */
    v: StateVersion

    /**
     * The minimum version of reader that can read this value. If STATE_VERSION_CURRENT >=
     * minReaderV, then this version of the code can read this value. If undefined, its value is
     * {@link DEFAULT_MIN_READER_V},
     */
    minReaderV?: StateVersion

    /**
     * The [Lexical editor state](https://lexical.dev/docs/concepts/editor-state).
     */
    lexicalEditorState: SerializedEditorState
}

const DEFAULT_MIN_READER_V: StateVersion = 'lexical-v0'

// We support reading from lexical-v0
const SUPPORTED_READER_VERSIONS: StateVersion[] = ['lexical-v0', 'lexical-v1']

function toPromptEditorState(editor: LexicalEditor): SerializedPromptEditorState {
    const editorState = editor.getEditorState().toJSON()
    // We don't need to encode as the latest version unless the editor state
    // contains new features. Given our reader is backwards compatible we can
    // still encode as the older version.
    const v = minimumReaderVersion(editorState)
    return {
        v,
        minReaderV: v,
        lexicalEditorState: editorState,
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
        if (!value) {
            return false
        }

        const editorState = value as SerializedPromptEditorState

        // We can read this if the version of the serialized text is compatible
        // or its minimum version is compatible.
        return (
            SUPPORTED_READER_VERSIONS.includes(editorState.v) ||
            SUPPORTED_READER_VERSIONS.includes(editorState.minReaderV ?? DEFAULT_MIN_READER_V)
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
        forEachPreOrder(state.lexicalEditorState.root, node => {
            if (isSerializedContextItemMentionNode(node)) {
                contextItems.push(node.contextItem)
            }
        })
    }

    return contextItems
}

export function inputTextWithoutContextChipsFromPromptEditorState(
    state: SerializedPromptEditorState
): string {
    state = filterLexicalNodes(state, node => !isSerializedContextItemMentionNode(node))

    return textContentFromSerializedLexicalNode(state.lexicalEditorState.root).trimStart()
}

export function filterContextItemsFromPromptEditorValue(
    value: SerializedPromptEditorValue,
    keep: (item: SerializedContextItem) => boolean
): SerializedPromptEditorValue {
    const editorState = filterLexicalNodes(value.editorState, node =>
        isSerializedContextItemMentionNode(node) ? keep(node.contextItem) : true
    )

    return {
        ...value,
        editorState,
        text: textContentFromSerializedLexicalNode(editorState.lexicalEditorState.root),
        contextItems: value.contextItems.filter(item => keep(serializeContextItem(item))),
    }
}

export function textContentFromSerializedLexicalNode(
    root: SerializedLexicalNode | SerializedRootNode,
    __testing_wrapText?: (text: string) => string | undefined
): string {
    const text: string[] = []
    forEachPreOrder(root, node => {
        if ('type' in node && node.type === CONTEXT_ITEM_MENTION_NODE_TYPE) {
            const nodeText = contextItemMentionNodeDisplayText(
                (node as SerializedContextItemMentionNode).contextItem
            )
            text.push(__testing_wrapText ? __testing_wrapText(nodeText) ?? nodeText : nodeText)
        } else if ('type' in node && node.type === TEMPLATE_INPUT_NODE_TYPE) {
            const nodeText = templateInputNodeDisplayText(node as SerializedTemplateInputNode)
            text.push(__testing_wrapText ? __testing_wrapText(nodeText) ?? nodeText : nodeText)
        } else if ('text' in node && typeof node.text === 'string') {
            text.push(node.text)
        }
    })
    return text.join('')
}

export function editorStateToText(editorState: EditorState): string {
    return editorState.read(() => $getRoot().getTextContent())
}

interface EditorStateFromPromptStringOptions {
    /**
     * Experimental support for template values. These are placeholder values between "{{" and "}}".
     */
    parseTemplates: boolean
}

export function editorStateFromPromptString(
    input: PromptString,
    opts?: EditorStateFromPromptStringOptions
): SerializedPromptEditorState {
    return {
        lexicalEditorState: lexicalEditorStateFromPromptString(input, opts),
        v: STATE_VERSION_CURRENT,
        minReaderV: STATE_VERSION_CURRENT,
    }
}

/**
 * This inspects the editor state to find out what the minimum version we can
 * encode it as.
 *
 * In particular if there are template inputs then we need to encode it as
 * lexical-v1, otherwise lexical-v0 is sufficient.
 */
function minimumReaderVersion(editorState: SerializedEditorState): StateVersion {
    let hasTemplateInput = false

    forEachPreOrder(editorState.root, node => {
        if ('type' in node && node.type === TEMPLATE_INPUT_NODE_TYPE) {
            hasTemplateInput = true
        }
    })

    /* Only if there are templateInputs do we need a newer parser */
    if (hasTemplateInput) {
        return 'lexical-v1'
    }
    return 'lexical-v0'
}

type SupportedSerializedNodes =
    | SerializedTextNode
    | SerializedContextItemMentionNode
    | SerializedTemplateInputNode

function lexicalEditorStateFromPromptString(
    input: PromptString,
    opts?: EditorStateFromPromptStringOptions
): SerializedEditorState {
    // HACK(sqs): This breaks if the PromptString's references' displayPaths are present anywhere
    // else. A better solution would be to track range information for the constituent PromptString
    // parts.
    const refs = input.getReferences()
    const refsByDisplayPath = new Map()
    for (const ref of refs) {
        refsByDisplayPath.set(displayPath(ref), ref)
    }

    let children: SupportedSerializedNodes[] = []
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

                const contextItem = serializeContextItem({
                    type: 'file',
                    uri,
                    range,
                    // HACK(sqs): makes Explain work, but see HACK note above.
                    source: range ? ContextItemSource.User : ContextItemSource.Editor,
                })
                children.push({
                    type: CONTEXT_ITEM_MENTION_NODE_TYPE,
                    contextItem,
                    text: contextItemMentionNodeDisplayText(contextItem),
                    isFromInitialContext: false,
                    version: 1,
                } satisfies SerializedContextItemMentionNode)
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

    if (opts?.parseTemplates) {
        children = parseTemplateInputsInTextNodes(children)
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

/**
 * Walk the tree calling {@link callbackfn} for each node. {@link callbackfn} is called in
 * "pre-order"; i.e., a parent is called before its children are called in order.
 */
function forEachPreOrder(
    node: SerializedLexicalNode,
    callbackfn: (node: SerializedLexicalNode) => void
) {
    callbackfn(node)
    if (node && 'children' in node && Array.isArray(node.children)) {
        for (const child of node.children) {
            forEachPreOrder(child, callbackfn)
        }
    }
}

/**
 * returns a copy of editorState with only nodes which return true from
 * predicate.
 */
function filterLexicalNodes(
    editorState: SerializedPromptEditorState,
    predicate: (node: SerializedLexicalNode) => boolean
): SerializedPromptEditorState {
    const copy: typeof editorState.lexicalEditorState = JSON.parse(
        JSON.stringify(editorState.lexicalEditorState)
    )

    forEachPreOrder(copy.root, node => {
        if (node && 'children' in node && Array.isArray(node.children)) {
            node.children = node.children.filter(child => predicate(child))
        }
    })

    return {
        ...editorState,
        lexicalEditorState: copy,
    }
}

function parseTemplateInputsInTextNodes(nodes: SupportedSerializedNodes[]): SupportedSerializedNodes[] {
    return nodes.flatMap(node => {
        if (node.type !== 'text') {
            return [node]
        }

        const template = node.text

        const regex = /{{(.*?)}}/g
        const parts = []
        let lastIndex = 0
        while (true) {
            const match = regex.exec(template)
            if (!match) {
                break
            }

            if (match.index > lastIndex) {
                parts.push(textNode(template.slice(lastIndex, match.index)))
            }

            // Add the variable
            parts.push({
                type: TEMPLATE_INPUT_NODE_TYPE,
                templateInput: { placeholder: match[1].trim() },
                version: 1,
            } satisfies SerializedTemplateInputNode)

            lastIndex = regex.lastIndex
        }

        // Add any remaining text after the last match
        if (lastIndex < template.length) {
            parts.push(textNode(template.slice(lastIndex)))
        }

        return parts
    })
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
