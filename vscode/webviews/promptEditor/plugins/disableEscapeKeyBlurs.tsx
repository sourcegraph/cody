import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_EDITOR, KEY_ESCAPE_COMMAND } from 'lexical'
import { type FunctionComponent, useEffect } from 'react'

/**
 * Lexical's default behavior is for the Escape key to blur the editor. This does not make sense for
 * our purposes.
 */
export const DisableEscapeKeyBlursPlugin: FunctionComponent = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        // HACK(sqs): Disable the Escape-key-blurs-editor functionality. See
        // https://github.com/facebook/lexical/pull/5991#issuecomment-2132094564. editor._commands.
        //
        // If any of these `console.log` messages are printed, then check if Lexical editor behavior
        // has changed, and if so, you can probably remove this plugin.
        const escListeners = editor._commands.get(KEY_ESCAPE_COMMAND)
        if (!escListeners) {
            console.log('DisableEscapeKeyBlursPlugin: no listeners registered for Escape key.')
            return
        }
        const editorEscListener = escListeners.at(COMMAND_PRIORITY_EDITOR)
        if (!editorEscListener) {
            console.log(
                'DisableEscapeKeyBlursPlugin: no COMMAND_PRIORITY_EDITOR listener registered for Escape key.'
            )
            return
        }
        if (editorEscListener.size !== 1) {
            console.log(
                'DisableEscapeKeyBlursPlugin: unexpectedly more than one listener registered for Escape key.'
            )
            return
        }
        editorEscListener.clear()
    }, [editor])

    return null
}
