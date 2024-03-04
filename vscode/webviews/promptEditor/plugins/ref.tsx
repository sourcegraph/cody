import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor } from 'lexical'
import type { FunctionComponent, MutableRefObject } from 'react'

export const RefPlugin: FunctionComponent<{ editorRef: MutableRefObject<LexicalEditor | null> }> = ({
    editorRef,
}) => {
    const [editor] = useLexicalComposerContext()
    editorRef.current = editor
    return null
}
