import { $isRootTextContentEmpty } from '@lexical/text'
import {
    type ContextItem,
    type SerializedPromptEditorState,
    type SerializedPromptEditorValue,
    toSerializedPromptEditorValue,
} from '@sourcegraph/cody-shared'
import { clsx } from 'clsx'
import { $createTextNode, $getRoot, $getSelection, $insertNodes, type LexicalEditor } from 'lexical'
import type { EditorState } from 'lexical'
import { type FunctionComponent, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import type { UserAccountInfo } from '../Chat'
import {
    isEditorContentOnlyInitialContext,
    lexicalNodesForContextItems,
} from '../chat/cells/messageCell/human/editor/initialContext'
import { BaseEditor } from './BaseEditor'
import styles from './PromptEditor.module.css'
import type { KeyboardEventPluginProps } from './plugins/keyboardEvent'

interface Props extends KeyboardEventPluginProps {
    userInfo?: UserAccountInfo
    editorClassName?: string
    contentEditableClassName?: string
    seamless?: boolean

    placeholder?: string

    initialEditorState?: SerializedPromptEditorState
    onChange?: (value: SerializedPromptEditorValue) => void
    onFocusChange?: (focused: boolean) => void

    disabled?: boolean

    editorRef?: React.RefObject<PromptEditorRefAPI>
}

export interface PromptEditorRefAPI {
    getSerializedValue(): SerializedPromptEditorValue
    setFocus(focus: boolean, options?: { moveCursorToEnd?: boolean }): void
    appendText(text: string, ensureWhitespaceBefore?: boolean): void
    addMentions(items: ContextItem[]): void
    setInitialContextMentions(items: ContextItem[]): void
    isEmpty(): boolean
}

/**
 * The component for composing and editing prompts.
 */
export const PromptEditor: FunctionComponent<Props> = ({
    userInfo,
    editorClassName,
    contentEditableClassName,
    seamless,
    placeholder,
    initialEditorState,
    onChange,
    onFocusChange,
    disabled,
    editorRef: ref,
    onEnterKey,
}) => {
    const editorRef = useRef<LexicalEditor>(null)

    const hasSetInitialContext = useRef(false)
    useImperativeHandle(
        ref,
        (): PromptEditorRefAPI => ({
            getSerializedValue(): SerializedPromptEditorValue {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return toSerializedPromptEditorValue(editorRef.current)
            },
            setFocus(focus, { moveCursorToEnd } = {}): void {
                const editor = editorRef.current
                if (editor) {
                    if (focus) {
                        editor.update(
                            () => {
                                const selection = $getSelection()
                                const root = $getRoot()

                                // Copied from LexicalEditor#focus, but we need to set the
                                // `skip-scroll-into-view` tag so that we don't always autoscroll.
                                if (selection !== null) {
                                    selection.dirty = true
                                } else if (root.getChildrenSize() !== 0) {
                                    root.selectEnd()
                                }

                                if (moveCursorToEnd) {
                                    root.selectEnd()
                                }

                                // Ensure element is focused in case the editor is empty. Copied
                                // from LexicalAutoFocusPlugin.
                                const doFocus = () =>
                                    editor.getRootElement()?.focus({ preventScroll: true })
                                doFocus()

                                // HACK(sqs): Needed in VS Code webviews to actually get it to focus
                                // on initial load, for some reason.
                                setTimeout(doFocus)
                            },
                            { tag: 'skip-scroll-into-view' }
                        )
                    } else {
                        editor.blur()
                    }
                }
            },
            appendText(text: string, ensureWhitespaceBefore?: boolean): void {
                editorRef.current?.update(() => {
                    const root = $getRoot()
                    const needsWhitespaceBefore = !/(^|\s)$/.test(root.getTextContent())
                    root.selectEnd()
                    $insertNodes([
                        $createTextNode(
                            `${ensureWhitespaceBefore && needsWhitespaceBefore ? ' ' : ''}${text}`
                        ),
                    ])
                    root.selectEnd()
                })
            },
            addMentions(items: ContextItem[]) {
                editorRef.current?.update(() => {
                    const nodesToInsert = lexicalNodesForContextItems(items, {
                        isFromInitialContext: false,
                    })
                    $insertNodes([$createTextNode(' '), ...nodesToInsert])
                    nodesToInsert.at(-1)?.select()
                })
            },
            setInitialContextMentions(items: ContextItem[]) {
                const editor = editorRef.current
                if (!editor) {
                    return
                }

                editor.update(() => {
                    if (!hasSetInitialContext.current || isEditorContentOnlyInitialContext(editor)) {
                        $getRoot().clear()
                        const nodesToInsert = lexicalNodesForContextItems(items, {
                            isFromInitialContext: true,
                        })
                        $insertNodes(nodesToInsert)

                        const nodeToSelect = nodesToInsert.at(-1)
                        nodeToSelect?.select()

                        hasSetInitialContext.current = true
                    }
                })
            },
            isEmpty(): boolean {
                if (!editorRef.current) {
                    throw new Error('PromptEditor has no Lexical editor ref')
                }
                return editorRef.current.getEditorState().read(() => {
                    const root = $getRoot()
                    if (root.getChildrenSize() === 0) {
                        return true
                    }
                    return $isRootTextContentEmpty(false, true)
                })
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

    useEffect(() => {
        if (initialEditorState) {
            const editor = editorRef.current
            if (editor) {
                const newEditorState = editor.parseEditorState(initialEditorState.lexicalEditorState)
                editor.setEditorState(newEditorState)
            }
        }
    }, [initialEditorState])

    return (
        <BaseEditor
            userInfo={userInfo}
            className={clsx(styles.editor, editorClassName, {
                [styles.disabled]: disabled,
                [styles.seamless]: seamless,
            })}
            contentEditableClassName={contentEditableClassName}
            initialEditorState={initialEditorState?.lexicalEditorState ?? null}
            onChange={onBaseEditorChange}
            onFocusChange={onFocusChange}
            editorRef={editorRef}
            placeholder={placeholder}
            disabled={disabled}
            aria-label="Chat message"
            onEnterKey={onEnterKey}
        />
    )
}
