import classNames from 'classnames'
import type { LexicalEditor } from 'lexical'
import type { EditorState } from 'lexical'
import { useCallback, useEffect, useRef, useState } from 'react'
import { RichEditor, editorStateToText } from './RichEditor'
import styles from './RichEditorTextArea.module.css'

const TIPS = '(@ for files, @# for symbols)'

interface ChatUITextAreaProps {
    containerClassName?: string
    editorClassName?: string
    isNewChat: boolean
    value: string
    chatEnabled: boolean
    disabled?: boolean
    onFocus?: () => void
    setValue?: (value: string) => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    onKeyUp?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    messageBeingEdited: number | undefined
}

export const RichEditorTextArea: React.FunctionComponent<ChatUITextAreaProps> = ({
    containerClassName,
    editorClassName,
    value, // TODO(sqs)
    setValue,
    chatEnabled,
    onFocus, // TODO(sqs)
    onKeyDown,
    onKeyUp,
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
            <RichEditor
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
