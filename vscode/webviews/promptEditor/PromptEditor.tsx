import classNames from 'classnames'
import type { LexicalEditor } from 'lexical'
import type { EditorState } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BaseEditor, editorStateToText } from './BaseEditor'
import styles from './Prompteditor.module.css'

const TIPS = '(@ for files, @# for symbols)'

interface ChatEditorProps {
    containerClassName?: string
    editorClassName?: string
    isNewChat: boolean
    value: string
    chatEnabled: boolean
    disabled?: boolean
    onFocus?: () => void
    onChange?: (value: string) => void
    messageBeingEdited: number | undefined
}

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: React.FunctionComponent<ChatEditorProps> = ({
    containerClassName,
    editorClassName,
    value, // TODO(sqs)
    onChange: setValue,
    chatEnabled,
    onFocus, // TODO(sqs)
    isNewChat,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    const [editorState, setEditorState] = useState<EditorState>()
    const onEditorStateChange = useCallback(
        (editorState: EditorState): void => {
            setEditorState(editorState)
            setValue?.(editorStateToText(editorState))
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
                onChange={onEditorStateChange}
                editorRef={editorRef}
                placeholder={
                    chatEnabled
                        ? isNewChat
                            ? `Message ${TIPS}`
                            : `Follow-Up Message ${TIPS}`
                        : 'Chat has been disabled by your Enterprise instance site administrator'
                }
                aria-label="Chat message"
                disabled={!chatEnabled}
            />
        </div>
    )
}
