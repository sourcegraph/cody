import { isMacOS } from '@sourcegraph/cody-shared'
import { VSCodeButton } from '@vscode/webview-ui-toolkit/react'
import classNames from 'classnames'
import { isEqual } from 'lodash'
import { type FunctionComponent, useCallback, useRef, useState } from 'react'
import type { UserAccountInfo } from '../../../../../Chat'
import {
    PromptEditor,
    type PromptEditorRefAPI,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
} from '../../../../../promptEditor/PromptEditor'
import { useEnhancedContextEnabled } from '../../../../EnhancedContext'
import styles from './HumanMessageEditor.module.css'
import { Toolbar } from './Toolbar'

/**
 * A component to compose and edit human chat messages and the settings associated with them.
 */
export const HumanMessageEditor: FunctionComponent<{
    initialEditorState: SerializedPromptEditorState | undefined
    placeholder: string

    /** Whether this editor is for the first message (not a followup). */
    isFirstMessageInTranscript: boolean

    onSubmit: (editorValue: SerializedPromptEditorValue, addEnhancedContext: boolean) => void
    userInfo: UserAccountInfo
    className?: string

    /** For use in storybooks only. */
    __storybook__alwaysShowToolbar?: boolean
}> = ({
    initialEditorState,
    placeholder,
    isFirstMessageInTranscript,
    onSubmit,
    userInfo,
    className,
    __storybook__alwaysShowToolbar,
}) => {
    const editorRef = useRef<PromptEditorRefAPI>(null)

    // The only PromptEditor state we really need to track in our own state is whether it's empty.
    const [isEmptyEditorValue, setIsEmptyEditorValue] = useState(true)
    const [isDirty, setIsDirty] = useState(false)
    const onEditorChange = useCallback(
        (value: SerializedPromptEditorValue): void => {
            setIsEmptyEditorValue(!value?.text?.trim())
            setIsDirty(
                !isEqual(initialEditorState?.lexicalEditorState, value.editorState.lexicalEditorState)
            )
        },
        [initialEditorState]
    )

    const addEnhancedContext = useEnhancedContextEnabled()
    const submit = useCallback(() => {
        if (!editorRef.current) {
            throw new Error('No editorRef')
        }
        onSubmit(editorRef.current.getSerializedValue(), addEnhancedContext)
    }, [onSubmit, addEnhancedContext])

    const onEditorEnterKey = useCallback(
        (event: KeyboardEvent | null): void => {
            // Submit input on Enter press (without shift) when input is not empty.
            if (event && !event.shiftKey && !event.isComposing && !isEmptyEditorValue) {
                event.preventDefault()
                submit()
                return
            }
        },
        [isEmptyEditorValue, submit]
    )

    const [isEditorFocused, setIsEditorFocused] = useState(false)
    const onEditorFocusChange = useCallback((focused: boolean): void => {
        setIsEditorFocused(focused)
        // TODO(sqs): close all toolbar dropdowns
    }, [])

    // If the user clicks on the toolbar outside of any of its buttons, pass through to focus the
    // editor.
    const onToolbarClick = useCallback((event: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        const targetIsToolbarButton = event.target !== event.currentTarget
        if (!targetIsToolbarButton) {
            event.preventDefault()
            event.stopPropagation()
            editorRef.current?.setFocus(true, true)
        }
    }, [])

    return (
        <div
            className={classNames(
                styles.container,
                {
                    [styles.focused]: isEditorFocused,
                    [styles.alwaysShowToolbar]: __storybook__alwaysShowToolbar,
                },
                className
            )}
        >
            <PromptEditor
                contentEditableClassName={styles.editorContentEditable}
                seamless={true}
                placeholder={placeholder}
                initialEditorState={initialEditorState}
                onChange={onEditorChange}
                onFocusChange={onEditorFocusChange}
                onEnterKey={onEditorEnterKey}
                editorRef={editorRef}
            />
            {/* biome-ignore lint/a11y/useKeyWithClickEvents: only relevant to click areas */}
            <div className={styles.toolbar} onMouseDown={onToolbarClick} onClick={onToolbarClick}>
                <Toolbar userInfo={userInfo} setEditorFocus={editorRef.current?.setFocus} />
                <div className={styles.spacer} />
                <VSCodeButton
                    type="submit"
                    onClick={submit}
                    appearance="secondary"
                    aria-label="Submit message"
                    className={styles.button}
                    disabled={!isDirty || isEmptyEditorValue}
                >
                    Chat <kbd>{/* TODO!(sqs): factor out */ isMacOS() ? 'Opt' : 'Alt'}+⏎</kbd>
                </VSCodeButton>
                <VSCodeButton
                    type="submit"
                    onClick={submit}
                    appearance="primary"
                    aria-label="Submit message"
                    className={styles.button}
                    disabled={!isDirty || isEmptyEditorValue}
                >
                    Chat with context{' '}
                    <kbd>{/* TODO!(sqs): factor out */ isMacOS() ? '⌘' : 'Ctrl'}+⏎</kbd>
                </VSCodeButton>
            </div>
        </div>
    )
}

// TODO!(sqs): make <return> submit, <ctrl>+<return> newline
