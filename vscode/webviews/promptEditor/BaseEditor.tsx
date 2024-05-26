import { type InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { EditorRefPlugin } from '@lexical/react/LexicalEditorRefPlugin'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import { clsx } from 'clsx'
import { $getRoot, type EditorState, type LexicalEditor, type SerializedEditorState } from 'lexical'
import { type FunctionComponent, type RefObject, useMemo } from 'react'
import styles from './BaseEditor.module.css'
import { RICH_EDITOR_NODES } from './nodes'
import MentionsPlugin from './plugins/atMentions/atMentions'
import CodeHighlightPlugin from './plugins/codeHighlight'
import { DisableEscapeKeyBlursPlugin } from './plugins/disableEscapeKeyBlurs'
import { KeyboardEventPlugin, type KeyboardEventPluginProps } from './plugins/keyboardEvent'
import { OnFocusChangePlugin } from './plugins/onFocus'

interface Props extends KeyboardEventPluginProps {
    initialEditorState: SerializedEditorState | null
    onChange: (editorState: EditorState, editor: LexicalEditor) => void
    onFocusChange?: (focused: boolean) => void
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
    editorRef,
    placeholder,
    disabled,
    className,
    contentEditableClassName,
    'aria-label': ariaLabel,

    // KeyboardEventPluginProps
    onEnterKey,
    onEscapeKey,
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
        <div className={clsx(styles.editorShell, className)}>
            <div className={styles.editorContainer}>
                <LexicalComposer initialConfig={initialConfig}>
                    <PlainTextPlugin
                        contentEditable={
                            <div className={styles.editorScroller}>
                                <div className={styles.editor}>
                                    <ContentEditable
                                        className={clsx(
                                            styles.contentEditable,
                                            contentEditableClassName
                                        )}
                                        ariaLabel={ariaLabel}
                                    />
                                </div>
                            </div>
                        }
                        placeholder={<div className={styles.placeholder}>{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={onChange} ignoreSelectionChange={true} />
                    <MentionsPlugin />
                    <CodeHighlightPlugin />
                    {onFocusChange && <OnFocusChangePlugin onFocusChange={onFocusChange} />}
                    {editorRef && <EditorRefPlugin editorRef={editorRef} />}
                    <KeyboardEventPlugin onEnterKey={onEnterKey} onEscapeKey={onEscapeKey} />
                    <DisableEscapeKeyBlursPlugin />
                </LexicalComposer>
            </div>
        </div>
    )
}

export function editorStateToText(editorState: EditorState): string {
    return editorState.read(() => $getRoot().getTextContent())
}
