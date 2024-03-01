import type { ModelProvider } from '@sourcegraph/cody-shared'
import classNames from 'classnames'
import { useCallback, useEffect, useRef } from 'react'
import styles from './TextArea.module.css'

interface ChatUITextAreaProps {
    containerClassName?: string
    inputClassName?: string
    disabledClassName?: string
    rows: number
    isFocusd: boolean
    isNewChat: boolean
    value: string
    required: boolean
    chatEnabled: boolean
    disabled?: boolean
    onInput: React.FormEventHandler<HTMLTextAreaElement>
    setValue?: (value: string) => void
    onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    onKeyUp?: (event: React.KeyboardEvent<HTMLTextAreaElement>, caretPosition: number | null) => void
    onFocus?: (event: React.FocusEvent<HTMLTextAreaElement>) => void
    chatModels?: ModelProvider[]
    messageBeingEdited: number | undefined
    inputCaretPosition?: number
    isWebviewActive: boolean
}

export const TextArea: React.FunctionComponent<ChatUITextAreaProps> = ({
    containerClassName,
    inputClassName,
    disabledClassName,
    isFocusd,
    value,
    chatEnabled,
    required,
    onInput,
    onKeyDown,
    onKeyUp,
    onFocus,
    chatModels,
    messageBeingEdited,
    isNewChat,
    inputCaretPosition,
    isWebviewActive,
}) => {
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const tips = '(@ to include files or symbols)'
    const placeholder = isNewChat ? `Message ${tips}` : `Follow-Up Message ${tips}`
    const disabledPlaceHolder = 'Chat has been disabled by your Enterprise instance site administrator'

    // biome-ignore lint/correctness/useExhaustiveDependencies: want new value to refresh it
    useEffect(() => {
        if (isFocusd) {
            if (isWebviewActive) {
                inputRef.current?.focus()
            }

            if (inputCaretPosition) {
                return
            }

            // move cursor to end of line if current cursor position is at the beginning
            if (inputRef.current?.selectionStart === 0 && value.length > 0) {
                inputRef.current?.setSelectionRange(value.length, value.length)
            }
        }
    }, [isFocusd, value, messageBeingEdited, chatModels])

    useEffect(() => {
        if (inputCaretPosition) {
            inputRef.current?.setSelectionRange(inputCaretPosition, inputCaretPosition)
            return
        }
    }, [inputCaretPosition])

    // Focus the textarea when the webview gains focus (unless there is text selected). This makes
    // it so that the user can immediately start typing to Cody after invoking `Cody: Focus on Chat
    // View` with the keyboard.
    useEffect(() => {
        const handleFocus = (): void => {
            if (document.getSelection()?.isCollapsed) {
                inputRef.current?.focus()
            }
        }
        window.addEventListener('focus', handleFocus)
        return () => {
            window.removeEventListener('focus', handleFocus)
        }
    }, [])

    const onTextAreaKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
            onKeyDown?.(event, inputRef.current?.selectionStart ?? null)
        },
        [onKeyDown]
    )
    const onTextAreaKeyUp = useCallback(
        (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
            onKeyUp?.(event, inputRef.current?.selectionStart ?? null)
        },
        [onKeyUp]
    )

    const actualPlaceholder = chatEnabled ? placeholder : disabledPlaceHolder
    const isDisabled = !chatEnabled

    return (
        <div
            className={classNames(
                styles.chatInputContainer,
                containerClassName,
                chatModels && styles.newChatInputContainer
            )}
            data-value={value || actualPlaceholder}
        >
            <textarea
                className={classNames(
                    styles.chatInput,
                    inputClassName,
                    chatModels && styles.newChatInput,
                    isDisabled && disabledClassName
                )}
                rows={1}
                ref={inputRef}
                value={value}
                required={required}
                onInput={onInput}
                onKeyDown={onTextAreaKeyDown}
                onKeyUp={onTextAreaKeyUp}
                onFocus={onFocus}
                onPaste={onInput}
                placeholder={actualPlaceholder}
                aria-label="Chat message"
                title="" // Set to blank to avoid HTML5 error tooltip "Please fill in this field"
                disabled={isDisabled} // Disable the textarea if the chat is disabled and change the background color to grey
            />
        </div>
    )
}
