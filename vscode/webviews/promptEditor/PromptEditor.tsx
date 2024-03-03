import classNames from 'classnames'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { EditorState, SerializedLexicalNode } from 'lexical'
import { useCallback, useEffect, useRef } from 'react'
import { BaseEditor, editorStateToText } from './BaseEditor'
import styles from './PromptEditor.module.css'

interface Props {
    containerClassName?: string
    editorClassName?: string
    isNewChat: boolean

    initialValue: PromptEditorValue | null
    onChange?: (value: PromptEditorValue) => void

    onFocus?: () => void

    chatEnabled: boolean
}

const TIPS = '(@ for files, @# for symbols)'

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: React.FunctionComponent<Props> = ({
    containerClassName,
    editorClassName,
    initialValue,
    onChange: setValue,

    onFocus,

    chatEnabled,

    isNewChat,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    const onBaseEditorChange = useCallback(
        (editorState: EditorState): void => {
            setValue?.(toPromptEditorValue(editorState))
        },
        [setValue]
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

    // TODO(sqs): handle up/down (keydown/keyup)?

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
            />
        </div>
    )
}

export interface PromptEditorValue {
    v: 1
    editorState: SerializedEditorState
    text: string
}

export function toPromptEditorValue(editorState: EditorState): PromptEditorValue {
    return {
        v: 1,
        editorState: editorState.toJSON(),
        text: editorStateToText(editorState),
    }
}

/**
 * This treats the entire text as plain text and does not parse it for any @-mentions.
 */
export function createEditorValueFromText(text: string): PromptEditorValue {
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
    return { v: 1, editorState, text }
}
