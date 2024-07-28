import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_CRITICAL, FORMAT_TEXT_COMMAND } from 'lexical'
import { type FunctionComponent, useEffect } from 'react'

/**
 * Block rich text formatting shortcuts like Cmd+B/Ctrl+B (for bold). Pasting from rich text still
 * (unintentionally) works; TODO(sqs): prevent that as well.
 */
export const NoRichTextFormatShortcutsPlugin: FunctionComponent = () => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return editor.registerCommand(
            FORMAT_TEXT_COMMAND,
            () => {
                return true
            },
            COMMAND_PRIORITY_CRITICAL
        )
    }, [editor])

    return null
}
