import type { SerializedPromptEditorValue } from '@sourcegraph/cody-shared'

// Copy of external prompts interface from CodyPanel component since
// type re-exports don't work with Cody Web bundle
export interface ExternalPrompt {
    text: string
    autoSubmit: boolean
    mode?: 'search' | 'chat' | 'edit' | 'insert'
}

export interface CodyExternalApi {
    runPrompt: (action: ExternalPrompt) => Promise<void>
}

export interface Repository {
    id: string
    name: string
}

export type InitialContext = {
    repository: Repository
    isDirectory: boolean
    fileURL: string | null
    fileRange: { startLine: number; endLine: number } | null
}

export interface PromptEditorRefAPI {
    getSerializedValue(): SerializedPromptEditorValue
    appendText(text: string): Promise<void>
}
