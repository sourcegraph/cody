import { SerializedContextItem, SerializedContextItemMentionNode, SerializedPromptEditorState, SerializedPromptEditorValue } from "@sourcegraph/cody-shared"
import { SerializedLexicalNode, SerializedParagraphNode, SerializedRootNode, SerializedTextNode } from "lexical"
import { Node } from "prosemirror-model"

export function fromSerializedPromptEditorState(
    state: SerializedPromptEditorState
): unknown {
    function fromSerializedLexicalNode(node: SerializedLexicalNode): unknown {
        switch (node.type) {
            case 'root': {
                return {
                    type: 'doc',
                    content: (node as SerializedRootNode).children.map(fromSerializedLexicalNode),
                }
            }
            case 'paragraph': {
                return {
                    type: 'paragraph',
                    content: (node as SerializedParagraphNode).children.map(fromSerializedLexicalNode),
                }
            }
            case 'text': {
                return {
                    type: 'text',
                    text: (node as SerializedTextNode).text,
                }
            }
            case 'contextItemMention': {
                return {
                    type: 'mention',
                    attrs: {
                        item: (node as SerializedContextItemMentionNode).contextItem,
                    },
                    content: [
                        {
                            type: 'text',
                            text: (node as SerializedContextItemMentionNode).text,
                        },

                    ],
                }
            }
        }
        return undefined
    }
    return fromSerializedLexicalNode(state.lexicalEditorState.root)
}

export function toSerializedPromptEditorValue(
    doc: Node
): SerializedPromptEditorValue {
    const contextItems: SerializedContextItem[] = []
    const direction = typeof window !== 'undefined' ? window.getComputedStyle(window.document.body).direction : null

    doc.descendants(node => {
        if (node.type.name === 'mention') {
            contextItems.push(node.attrs.item)
            return false
        }
        return true
    })

    function serializeNode(node: Node): SerializedLexicalNode|undefined {
        switch (node.type.name) {
            case 'paragraph': {
                const children: SerializedLexicalNode[] = []
                node.forEach(child => {
                    const serializedChild = serializeNode(child)
                    if (serializedChild) {
                        children.push(serializedChild)
                    }
                })
                return {
                    type: 'paragraph',
                    children,
                    direction: direction === 'rtl' ? 'rtl' : 'ltr',
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
            direction: direction === 'rtl' ? 'rtl' : 'ltr',
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
            }
        },
    }
}
