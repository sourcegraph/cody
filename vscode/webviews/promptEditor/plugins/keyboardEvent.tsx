import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { COMMAND_PRIORITY_LOW, KEY_ENTER_COMMAND } from 'lexical'
import { type FunctionComponent, useEffect } from 'react'

export interface KeyboardEventPluginProps {
    onEnterKey?: (event: KeyboardEvent | null) => void
}

export const KeyboardEventPlugin: FunctionComponent<KeyboardEventPluginProps> = ({ onEnterKey }) => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        return onEnterKey
            ? editor.registerCommand(
                  KEY_ENTER_COMMAND,
                  event => {
                      onEnterKey?.(event)
                      return event?.defaultPrevented ?? false
                  },
                  COMMAND_PRIORITY_LOW
              )
            : undefined
    }, [editor, onEnterKey])

    return null
}
