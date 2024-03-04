import type { ContextItem } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import {
    $createParagraphNode,
    $createTextNode,
    $getRoot,
    $isParagraphNode,
    CLEAR_HISTORY_COMMAND,
    type LexicalEditor,
    type ParagraphNode,
    type SerializedEditorState,
} from 'lexical'
import type { EditorState, SerializedLexicalNode } from 'lexical'
import { type FunctionComponent, type MutableRefObject, useCallback, useEffect, useRef } from 'react'
import { BaseEditor, editorStateToText } from './BaseEditor'
import styles from './PromptEditor.module.css'
import {
    $createContextItemMentionNode,
    type SerializedContextItem,
    isSerializedContextItemMentionNode,
} from './nodes/ContextItemMentionNode'
import type { KeyboardEventPluginProps } from './plugins/keyboardEvent'

interface Props extends KeyboardEventPluginProps {
    containerClassName?: string
    editorClassName?: string
    isNewChat: boolean

    initialValue: PromptEditorValue | null
    onChange?: (value: PromptEditorValue) => void

    onFocus?: () => void

    chatEnabled: boolean

    editorRef?: React.RefObject<PromptEditorRefAPI>
}

export interface PromptEditorRefAPI {
    resetValue(value: PromptEditorValue): void
    setFocus(focus: boolean): void
}

const TIPS = '(@ for files, @# for symbols)'

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: FunctionComponent<Props> = ({
    containerClassName,
    editorClassName,
    initialValue,
    onChange,

    onFocus,

    chatEnabled,

    isNewChat,

    editorRef: ref,

    // KeyboardEventPluginProps
    onKeyDown,
    onEscapeKey,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    const onBaseEditorChange = useCallback(
        (editorState: EditorState): void => {
            onChange?.(toPromptEditorValue(editorState))
        },
        [onChange]
    )

    useEffect(() => {
        if (ref) {
            ;(ref as MutableRefObject<PromptEditorRefAPI>).current = {
                resetValue(value: PromptEditorValue): void {
                    if (value.text === '') {
                        // Clearing seems to require a different code path because focusing fails if
                        // the editor is empty.
                        editorRef.current?.update(() => {
                            $getRoot().clear()
                        })
                        return
                    }

                    const editor = editorRef.current
                    if (editor) {
                        editor.setEditorState(editor.parseEditorState(value.editorState))
                        addExtraContextItems(editor, value.extraContextItems)
                        editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
                        editor.focus()
                    }
                },
                setFocus(focus) {
                    const editor = editorRef.current
                    if (editor) {
                        if (focus) {
                            editor.focus()
                        } else {
                            editor.blur()
                        }
                    }
                },
            }
        }
    }, [ref])

    // Focus the textarea when the webview gains focus (unless there is text selected). This makes
    // it so that the user can immediately start typing to Cody after invoking `Cody: Focus on Chat
    // View` with the keyboard.
    useEffect(() => {
        const handleFocus = (): void => {
            if (document.getSelection()?.isCollapsed) {
                editorRef.current?.focus()
            }
        }
        window.addEventListener('focus', handleFocus)
        return () => {
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    return (
        <div className={classNames(styles.container, containerClassName)}>
            <BaseEditor
                className={classNames(styles.editor, editorClassName, !chatEnabled && styles.disabled)}
                initialEditorState={initialValue?.editorState ?? null}
                onChange={onBaseEditorChange}
                onFocus={onFocus}
                editorRef={editorRef}
                placeholder={
                    chatEnabled
                        ? isNewChat
                            ? `Message ${TIPS}`
                            : `Follow-Up Message ${TIPS}`
                        : 'Chat has been disabled by your Enterprise instance site administrator'
                }
                disabled={!chatEnabled}
                aria-label="Chat message"
                //
                // KeyboardEventPluginProps
                onKeyDown={onKeyDown}
                onEscapeKey={onEscapeKey}
            />
        </div>
    )
}

/**
 * The representation of a user's prompt input in the chat view.
 */
export interface PromptEditorValue {
    v: 1
    text: string
    editorState: SerializedEditorState
    extraContextItems?: ContextItem[]
}

export function toPromptEditorValue(editorState: EditorState): PromptEditorValue {
    return {
        v: 1,
        editorState: editorState.toJSON(),
        text: editorStateToText(editorState),
    }
}

function addExtraContextItems(
    editor: LexicalEditor,
    contextItems: PromptEditorValue['extraContextItems']
): void {
    if (contextItems === undefined || contextItems.length === 0) {
        return
    }

    // Add the context files as @-mentions after the message for now. This will result in duplicate
    // @-mention text in the message (but only the latter mentions will be mention nodes).
    editor.update(() => {
        const root = $getRoot()
        let paragraph = root.getFirstChild<ParagraphNode>()
        if ($isParagraphNode(paragraph)) {
            paragraph.append($createTextNode(' '))
        } else {
            paragraph = $createParagraphNode()
            root.append(paragraph)
        }
        for (const contextItem of contextItems) {
            const node = $createContextItemMentionNode(contextItem, true)
            paragraph.append(node)
        }
    })
}

/**
 * This treats the entire text as plain text and does not parse it for any @-mentions.
 */
export function createEditorValueFromText(
    text: string,
    extraContextItems?: ContextItem[]
): PromptEditorValue {
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
    return { v: 1, editorState, text, extraContextItems }
}

export const EMPTY_PROMPT_EDITOR_VALUE: PromptEditorValue = createEditorValueFromText('')

export function contextItemsFromPromptEditorValue(value: PromptEditorValue): SerializedContextItem[] {
    const contextItems: SerializedContextItem[] = []

    if (value.editorState) {
        const queue: SerializedLexicalNode[] = [value.editorState.root]
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
