import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useLayoutEffect } from 'react'

export const OnFocusPlugin: React.FunctionComponent<{ onFocus?: () => void }> = ({ onFocus }) => {
    const [editor] = useLexicalComposerContext()

    useLayoutEffect(() => {
        if (editor.getRootElement() === document.activeElement) {
            onFocus?.()
        }
    }, [editor, onFocus])

    return null
}
