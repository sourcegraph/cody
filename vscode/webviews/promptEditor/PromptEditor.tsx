import { $generateHtmlFromNodes } from '@lexical/html'
import { type ChatMessage, type ContextItem, escapeHTML } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { $getRoot, CLEAR_HISTORY_COMMAND, type LexicalEditor, type SerializedEditorState } from 'lexical'
import type { EditorState, SerializedLexicalNode } from 'lexical'
import { type FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { BaseEditor, editorStateToText } from './BaseEditor'
import styles from './PromptEditor.module.css'
import {
    type SerializedContextItem,
    deserializeContextItem,
    isSerializedContextItemMentionNode,
} from './nodes/ContextItemMentionNode'
import type { KeyboardEventPluginProps } from './plugins/keyboardEvent'

interface Props extends KeyboardEventPluginProps {
    containerClassName?: string
    editorClassName?: string

    placeholder?: string

    initialEditorState?: SerializedPromptEditorState
    onChange?: (value: SerializedPromptEditorValue) => void

    onFocus?: () => void

    disabled?: boolean

    editorRef?: React.RefObject<PromptEditorRefAPI>
}

export interface PromptEditorRefAPI {
    setEditorState(value: SerializedPromptEditorState | null): void
    getSerializedValue(): SerializedPromptEditorValue
    setFocus(focus: boolean): void
}

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: FunctionComponent<Props> = ({
    containerClassName,
    editorClassName,
    placeholder,
    initialEditorState,
    onChange,
    onFocus,
    disabled,
    editorRef: ref,

    // KeyboardEventPluginProps
    onKeyDown,
    onEnterKey,
    onEscapeKey,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            setEditorState(value: SerializedPromptEditorState | null): void {
                if (value === null) {
                    // Clearing seems to require a different code path because focusing fails if
                    // the editor is empty.
                    editorRef.current?.update(() => {
                        $getRoot().clear()
                    })
                    return
                }

                const editor = editorRef.current
                if (editor) {
                    editor.setEditorState(editor.parseEditorState(value.lexicalEditorState))
                    editor.dispatchCommand(CLEAR_HISTORY_COMMAND, undefined)
                    editor.focus()
                }
            },
            getSerializedValue(): SerializedPromptEditorValue {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return toSerializedPromptEditorValue(editorRef.current)
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
        }),
        []
    )

    const onBaseEditorChange = useCallback(
        (_editorState: EditorState, editor: LexicalEditor): void => {
            if (onChange) {
                onChange(toSerializedPromptEditorValue(editor))
            }
        },
        [onChange]
    )

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
                className={classNames(styles.editor, editorClassName, disabled && styles.disabled)}
                initialEditorState={initialEditorState?.lexicalEditorState ?? null}
                onChange={onBaseEditorChange}
                onFocus={onFocus}
                editorRef={editorRef}
                placeholder={placeholder}
                disabled={disabled}
                aria-label="Chat message"
                //
                // KeyboardEventPluginProps
                onKeyDown={onKeyDown}
                onEnterKey={onEnterKey}
                onEscapeKey={onEscapeKey}
            />
        </div>
    )
}

export interface SerializedPromptEditorValue {
    /** The editor's value as plain text. */
    text: string

    /** The context items mentioned in the value. */
    contextItems: ContextItem[]

    /** The internal state of the editor that can be used to restore the editor. */
    editorState: SerializedPromptEditorState
}

function toSerializedPromptEditorValue(editor: LexicalEditor): SerializedPromptEditorValue {
    const editorState = toPromptEditorState(editor)
    return {
        text: editorStateToText(editor.getEditorState()),
        contextItems: contextItemsFromPromptEditorValue(editorState).map(deserializeContextItem),
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
const STATE_VERSION_CURRENT = 'lexical-v0' as const

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
     * The [Lexical editor state](https://lexical.dev/docs/concepts/editor-state).
     */
    lexicalEditorState: SerializedEditorState

    /**
     * The HTML serialization of the editor state.
     */
    html: string
}

function toPromptEditorState(editor: LexicalEditor): SerializedPromptEditorState {
    const editorState = editor.getEditorState()
    return {
        v: STATE_VERSION_CURRENT,
        lexicalEditorState: editorState.toJSON(),
        html: editorState.read(() => $generateHtmlFromNodes(editor)),
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
        lexicalEditorState: editorState,
        html: escapeHTML(text),
    }
}

export function serializedPromptEditorStateFromChatMessage(
    chatMessage: ChatMessage
): SerializedPromptEditorState {
    function isCurrentVersionEditorState(value: unknown): value is SerializedPromptEditorState {
        return Boolean(value) && (value as any).v === STATE_VERSION_CURRENT
    }

    if (isCurrentVersionEditorState(chatMessage.editorState)) {
        return chatMessage.editorState
    }

    // Fall back to using plain text for chat messages that don't have a serialized Lexical editor
    // state that we recognize.
    //
    // It would be smoother to automatically import or convert textual @-mentions to the Lexical
    // mention nodes, but that would add a lot of extra complexity for the relatively rare use case
    // of editing old messages in your chat history.
    return serializedPromptEditorStateFromText(chatMessage.text ?? '')
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
