import {
    type SerializedContextItem,
    type SerializedContextItemMentionNode,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    contextItemMentionNodeDisplayText,
} from '@sourcegraph/cody-shared'
import type {
    SerializedLexicalNode,
    SerializedParagraphNode,
    SerializedRootNode,
    SerializedTextNode,
} from 'lexical'
import type { Node } from 'prosemirror-model'

function fromSerializedLexicalNode(node: SerializedLexicalNode): unknown {
    switch (node.type) {
        case 'root': {
            return {
                type: 'doc',
                content: (node as SerializedRootNode).children
                    .map(fromSerializedLexicalNode)
                    .filter(Boolean),
            }
        }
        case 'paragraph': {
            return {
                type: 'paragraph',
                content: (node as SerializedParagraphNode).children
                    .map(fromSerializedLexicalNode)
                    .filter(Boolean),
            }
        }
        case 'text': {
            if ((node as SerializedTextNode).text) {
                return {
                    type: 'text',
                    text: (node as SerializedTextNode).text,
                }
            }
            break
        }
        case 'contextItemMention': {
            const item = (node as SerializedContextItemMentionNode).contextItem
            return {
                type: 'mention',
                attrs: {
                    item,
                    isFromInitialContext: (node as SerializedContextItemMentionNode)
                        .isFromInitialContext,
                },
                content: [
                    {
                        type: 'text',
                        text: contextItemMentionNodeDisplayText(item),
                    },
                ],
            }
        }
    }
    return undefined
}

/**
 * Convert a {@link SerializedPromptEditorState} to a ProseMirror document.
 *
 * This makes a best-effort attempt to convert a Lexical document to a ProseMirror document.
 * A Lexical document contains more information than a ProseMirror document, some data is ignored/lost.
 */
export function fromSerializedPromptEditorState(state: SerializedPromptEditorState): unknown {
    return fromSerializedLexicalNode(state.lexicalEditorState.root)
}

/**
 * Convert a ProseMirror document to a {@link SerializedPromptEditorValue}.
 *
 * This makes a best-effort attempt to serialize a ProseMirror document to a Lexical document.
 * A Lexical document contains more information than a ProseMirror document, some data is set to seemingly reasonable defaults.
 */
export function toSerializedPromptEditorValue(doc: Node): SerializedPromptEditorValue {
    const contextItems: SerializedContextItem[] = []
    const direction =
        (typeof window !== 'undefined'
            ? window.getComputedStyle(window.document.body).direction
            : null) === 'rtl'
            ? 'rtl'
            : 'ltr'

    doc.descendants(node => {
        if (node.type.name === 'mention') {
            contextItems.push(node.attrs.item)
            return false
        }
        return true
    })

    function serializeNode(node: Node): SerializedLexicalNode | undefined {
        switch (node.type.name) {
            case 'paragraph': {
                const children: SerializedLexicalNode[] = []
                // biome-ignore lint/complexity/noForEach: `node` is not an array, it cannot be used with `for ... of`
                node.forEach(child => {
                    const serializedChild = serializeNode(child)
                    if (serializedChild) {
                        children.push(serializedChild)
                    }
                })
                return {
                    type: 'paragraph',
                    children,
                    direction,
                    format: '',
                    indent: 0,
                    version: 1,
                    textStyle: '',
                    textFormat: 0,
                } as SerializedParagraphNode
            }
            case 'text': {
                return {
                    type: 'text',
                    text: node.text || '',
                    detail: 0,
                    format: 0,
                    mode: 'normal',
                    style: '',
                    version: 1,
                } as SerializedTextNode
            }
            case 'mention': {
                return {
                    type: 'contextItemMention',
                    text: node.textContent,
                    contextItem: node.attrs.item,
                    isFromInitialContext: node.attrs.isFromInitialContext,
                    version: 1,
                } as SerializedContextItemMentionNode
            }
        }
        return undefined
    }

    function serializeRoot(root: Node): SerializedRootNode {
        const children: SerializedLexicalNode[] = []
        // biome-ignore lint/complexity/noForEach: `root` is not an array, it cannot be used with `for ... of`
        root.forEach(child => {
            const serializedChild = serializeNode(child)
            if (serializedChild) {
                children.push(serializedChild)
            }
        })

        return {
            type: 'root',
            children,
            format: '',
            indent: 0,
            version: 1,
            direction,
        }
    }

    return {
        text: doc.textContent,
        contextItems,
        editorState: {
            v: 'lexical-v1',
            minReaderV: 'lexical-v1',
            lexicalEditorState: {
                root: serializeRoot(doc),
            },
        },
    }
}
