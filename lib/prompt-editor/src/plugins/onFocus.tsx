import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { BLUR_COMMAND, COMMAND_PRIORITY_NORMAL, FOCUS_COMMAND } from 'lexical'
import { type FunctionComponent, useLayoutEffect } from 'react'

export const OnFocusChangePlugin: FunctionComponent<{ onFocusChange: (focused: boolean) => void }> = ({
    onFocusChange,
}) => {
    const [editor] = useLexicalComposerContext()

    useLayoutEffect(() => {
        onFocusChange(editor.getRootElement() === document.activeElement)

        const disposables: (() => void)[] = []
        disposables.push(
            editor.registerCommand(
                FOCUS_COMMAND,
                () => {
                    onFocusChange(true)
                    return false
                },
                COMMAND_PRIORITY_NORMAL
            )
        )
        disposables.push(
            editor.registerCommand(
                BLUR_COMMAND,
                () => {
                    onFocusChange(false)
                    return false
                },
                COMMAND_PRIORITY_NORMAL
            )
        )
        return () => {
            for (const disposable of disposables) {
                disposable()
            }
        }
    }, [editor, onFocusChange])

    return null
}
