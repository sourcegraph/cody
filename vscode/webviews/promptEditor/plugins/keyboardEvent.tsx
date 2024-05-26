import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND } from 'lexical'
import { type FunctionComponent, useEffect } from 'react'

export interface KeyboardEventPluginProps {
    onEnterKey?: (event: KeyboardEvent | null) => void
    onEscapeKey?: () => void
}

export const KeyboardEventPlugin: FunctionComponent<KeyboardEventPluginProps> = ({
    onEnterKey,
    onEscapeKey,
}) => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        const disposables: (() => void)[] = []
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
    }, [editor, onEscapeKey, onEnterKey])

    return null
}
