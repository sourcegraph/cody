import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { type InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import classNames from 'classnames'
import {
    $getRoot,
    $getSelection,
    type EditorState,
    type LexicalEditor,
    type SerializedEditorState,
} from 'lexical'
import { type FunctionComponent, type RefObject, useMemo } from 'react'
import styles from './BaseEditor.module.css'
import { RICH_EDITOR_NODES } from './nodes'
import MentionsPlugin from './plugins/atMentions/atMentions'
import CodeHighlightPlugin from './plugins/codeHighlight'
import { KeyboardEventPlugin, type KeyboardEventPluginProps } from './plugins/keyboardEvent'
import MarkdownShortcutPlugin from './plugins/markdownShortcut'
import { OnFocusPlugin } from './plugins/onFocus'
import { RefPlugin } from './plugins/ref'

interface Props extends KeyboardEventPluginProps {
    initialEditorState: SerializedEditorState | null
    onChange: (editorState: EditorState) => void
    onFocus?: () => void
    editorRef?: RefObject<LexicalEditor>
    placeholder?: string
    disabled?: boolean
    className?: string
    'aria-label'?: string
}

/**
 * The low-level rich editor for messages to Cody.
 */
export const BaseEditor: FunctionComponent<Props> = ({
    initialEditorState,
    onChange,
    onFocus,
    editorRef,
    placeholder,
    disabled,
    className,
    'aria-label': ariaLabel,

    // KeyboardEventPluginProps
    onKeyDown,
    onEscapeKey,
}) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: We do not want to update initialConfig because LexicalComposer is meant to be an uncontrolled component.
    const initialConfig = useMemo<InitialConfigType>(
        () => ({
            namespace: 'BaseEditor',
            theme: { paragraph: styles.themeParagraph },
            onError: (error: any) => console.error(error),
            editorState: initialEditorState !== null ? JSON.stringify(initialEditorState) : null,
            editable: !disabled,
            nodes: RICH_EDITOR_NODES,
        }),
        []
    )

    return (
        <div className={classNames(styles.editorShell, className)}>
            <div className={styles.editorContainer}>
                <LexicalComposer initialConfig={initialConfig}>
                    <PlainTextPlugin
                        contentEditable={
                            <div className={styles.editorScroller}>
                                <div className={styles.editor}>
                                    <ContentEditable
                                        className={styles.contentEditable}
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
                    <MarkdownShortcutPlugin />
                    <AutoFocusPlugin defaultSelection="rootEnd" />
                    <OnFocusPlugin onFocus={onFocus} />
                    {editorRef && <RefPlugin editorRef={editorRef} />}
                    <KeyboardEventPlugin onKeyDown={onKeyDown} onEscapeKey={onEscapeKey} />
                </LexicalComposer>
            </div>
        </div>
    )
}

export function editorStateToText(editorState: EditorState): string {
    return editorState.read(() => $getRoot().getTextContent())
}

export function editorSelectionStart(editorState: EditorState): number | null {
    const points = editorState.read(() => $getSelection()?.getStartEndPoints())
    return points ? points[0].offset : null
}
