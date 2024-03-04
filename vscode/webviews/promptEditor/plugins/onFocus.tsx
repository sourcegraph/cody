import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { type FunctionComponent, useLayoutEffect } from 'react'

export const OnFocusPlugin: FunctionComponent<{ onFocus?: () => void }> = ({ onFocus }) => {
    const [editor] = useLexicalComposerContext()

    useLayoutEffect(() => {
        if (editor.getRootElement() === document.activeElement) {
            onFocus?.()
        }
    }, [editor, onFocus])

    return null
}
