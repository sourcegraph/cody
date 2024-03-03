import type React from 'react'

import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { type InitialConfigType, LexicalComposer } from '@lexical/react/LexicalComposer'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin'
import classNames from 'classnames'
import { $getRoot, $getSelection, type EditorState, type LexicalEditor } from 'lexical'
import { type RefObject, useMemo } from 'react'
import styles from './BaseEditor.module.css'
import { RICH_EDITOR_NODES } from './nodes'
import MentionsPlugin from './plugins/atMentions/atMentions'
import CodeHighlightPlugin from './plugins/codeHighlight'
import MarkdownShortcutPlugin from './plugins/markdownShortcut'
import { RefPlugin } from './plugins/ref'

interface Props {
    initialEditorState?: EditorState
    onChange: (editorState: EditorState) => void
    editorRef?: RefObject<LexicalEditor>
    placeholder?: string
    disabled?: boolean
    className?: string
}

/**
 * The low-level rich editor for messages to Cody.
 */
export const BaseEditor: React.FunctionComponent<Props> = ({
    initialEditorState,
    onChange,
    editorRef,
    placeholder,
    disabled,
    className,
}) => {
    // biome-ignore lint/correctness/useExhaustiveDependencies: We do not want to update initialConfig because LexicalComposer is meant to be an uncontrolled component.
    const initialConfig = useMemo<InitialConfigType>(
        () => ({
            namespace: 'BaseEditor',
            theme: { paragraph: styles.themeParagraph },
            onError: (error: any) => console.error(error),
            editorState: initialEditorState,
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
                                    <ContentEditable className={styles.contentEditable} />
                                </div>
                            </div>
                        }
                        placeholder={<div className={styles.placeholder}>{placeholder}</div>}
                        ErrorBoundary={LexicalErrorBoundary}
                    />
                    <HistoryPlugin />
                    <OnChangePlugin onChange={onChange} />
                    <MentionsPlugin />
                    <CodeHighlightPlugin />
                    <MarkdownShortcutPlugin />
                    <AutoFocusPlugin />
                    {editorRef && <RefPlugin editorRef={editorRef} />}
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
