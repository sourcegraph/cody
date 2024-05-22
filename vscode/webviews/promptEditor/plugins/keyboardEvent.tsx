import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, KEY_DOWN_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND } from 'lexical'
import { type FunctionComponent, useEffect } from 'react'
import { editorSelectionStart } from '../BaseEditor'

export interface KeyboardEventPluginProps {
    onKeyDown?: (event: KeyboardEvent, caretPosition: number) => void
    onEnterKey?: (event: KeyboardEvent | null) => void
    onEscapeKey?: () => void
}

export const KeyboardEventPlugin: FunctionComponent<KeyboardEventPluginProps> = ({
    onKeyDown,
    onEnterKey,
    onEscapeKey,
}) => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        const disposables: (() => void)[] = []
        if (onKeyDown) {
            disposables.push(
                editor.registerCommand(
                    KEY_DOWN_COMMAND,
                    event => {
                        // HACK(sqs): Without the `setTimeout` wrap, pressing UpArrow in an empty
                        // editor does not populate the editor with the contents of the last human
                        // message, and the following error is thrown: `BaseEditor.tsx:58 TypeError:
                        // Cannot assign to read only property 'dirty' of object
                        // '#<_RangeSelection>'`.
                        setTimeout(() =>
                            onKeyDown?.(event, editorSelectionStart(editor.getEditorState()) ?? 0)
                        )
                        return false
                    },
                    COMMAND_PRIORITY_LOW
                )
            )
        }
        if (onEnterKey) {
            disposables.push(
                editor.registerCommand(
                    KEY_ENTER_COMMAND,
                    event => {
                        onEnterKey?.(event)
                        return event?.defaultPrevented ?? false
                    },
                    COMMAND_PRIORITY_LOW
                )
            )
        }
        if (onEscapeKey) {
            disposables.push(
                editor.registerCommand(
                    KEY_ESCAPE_COMMAND,
                    () => {
                        onEscapeKey?.()
                        return false
                    },
                    COMMAND_PRIORITY_LOW
                )
            )
        }
        return () => {
            for (const disposable of disposables) {
                disposable()
            }
        }
    }, [editor, onKeyDown, onEscapeKey, onEnterKey])

    return null
}
