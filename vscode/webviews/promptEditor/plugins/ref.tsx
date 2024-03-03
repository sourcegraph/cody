import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import type { LexicalEditor } from 'lexical'
import { type FunctionComponent, type MutableRefObject, useEffect } from 'react'

export const RefPlugin: FunctionComponent<{ editorRef: MutableRefObject<LexicalEditor | null> }> = ({
    editorRef,
}) => {
    const [editor] = useLexicalComposerContext()

    useEffect(() => {
        editorRef.current = editor
    }, [editorRef, editor])

    return null
}
