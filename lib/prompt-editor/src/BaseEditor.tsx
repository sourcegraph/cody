import { type InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { clsx } from 'clsx'
import type { EditorState, LexicalEditor, SerializedEditorState } from 'lexical'
import { type FunctionComponent, type RefObject, useMemo } from 'react'
import styles from './BaseEditor.module.css'
import { RICH_EDITOR_NODES } from './nodes'
import { MentionsPlugin } from './plugins/atMentions/atMentions'
import { DisableEscapeKeyBlursPlugin } from './plugins/disableEscapeKeyBlurs'
import { KeyboardEventPlugin, type KeyboardEventPluginProps } from './plugins/keyboardEvent'
import { NoRichTextFormatShortcutsPlugin } from './plugins/noRichTextShortcuts'
import { OnFocusChangePlugin } from './plugins/onFocus'

interface Props extends KeyboardEventPluginProps {
    initialEditorState: SerializedEditorState | null
    onChange: (editorState: EditorState, editor: LexicalEditor, tags: Set<string>) => void
    onFocusChange?: (focused: boolean) => void
    contextWindowSizeInTokens?: number
    editorRef?: RefObject<LexicalEditor>
    placeholder?: string
    disabled?: boolean
    className?: string
    contentEditableClassName?: string
    'aria-label'?: string
}

/**
 * The low-level rich editor for messages to Cody.
 */
export const BaseEditor: FunctionComponent<Props> = ({
    initialEditorState,
    onChange,
    onFocusChange,
    contextWindowSizeInTokens,
    editorRef,
    placeholder,
    disabled,
    className,
    contentEditableClassName,
    'aria-label': ariaLabel,
    onEnterKey,
}) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: We do not want to update initialConfig because LexicalComposer is meant to be an uncontrolled component.
    const initialConfig = useMemo<InitialConfigType>(
        () => ({
            namespace: 'BaseEditor',
            theme: { paragraph: styles.themeParagraph },
            onError: (error: any) => console.error(error),
            editorState: initialEditorState !== null ? JSON.stringify(initialEditorState) : undefined,
            editable: !disabled,
            nodes: RICH_EDITOR_NODES,
        }),
        []
    )

    return (
        <div className={className}>
            <div className={styles.editor}>
                <LexicalComposer initialConfig={initialConfig}>
                    <RichTextPlugin
                        contentEditable={
                            <ContentEditable
                                className={clsx(styles.contentEditable, contentEditableClassName)}
                                ariaLabel={ariaLabel}
                            />
                        }
                        placeholder={<div className={styles.placeholder}>{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <NoRichTextFormatShortcutsPlugin />
                    <HistoryPlugin />
                    <OnChangePlugin
                        onChange={onChange}
                        // `ignoreHistoryMergeTagChange={false}` is necessary for onChange to run in
                        // our tests using JSDOM. It doesn't hurt to enable otherwise.
                        ignoreHistoryMergeTagChange={false}
                    />
                    <MentionsPlugin contextWindowSizeInTokens={contextWindowSizeInTokens} />
                    {onFocusChange && <OnFocusChangePlugin onFocusChange={onFocusChange} />}
                    {editorRef && <EditorRefPlugin editorRef={editorRef} />}
                    <KeyboardEventPlugin onEnterKey={onEnterKey} />
                    <DisableEscapeKeyBlursPlugin />
                </LexicalComposer>
            </div>
        </div>
    )
}
