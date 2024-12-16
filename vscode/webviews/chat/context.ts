import type { PromptEditorRefAPI } from '@sourcegraph/prompt-editor'
import { type MutableRefObject, createContext } from 'react'

export const LastEditorContext = createContext<MutableRefObject<PromptEditorRefAPI | null>>({
    current: null,
})
