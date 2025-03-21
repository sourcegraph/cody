import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import { type MutableRefObject, createContext, useRef } from 'react'

export const LastEditorContext = createContext<MutableRefObject<PromptEditorRefAPI | null>>({
    current: null,
})

export function useLastHumanEditor() {
    const lastHumanEditorRef = useRef<PromptEditorRefAPI | null>(null)

    const focusLastHumanMessageEditor = () => {
        if (!lastHumanEditorRef.current) return
        lastHumanEditorRef.current?.setFocus(true)
    }

    return { lastHumanEditorRef, focusLastHumanMessageEditor }
}
