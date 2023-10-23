import { ConfigurationUseContext } from '../configuration'
import { ActiveTextEditorSelectionRange } from '../editor'

export interface ChatContextStatus {
    mode?: ConfigurationUseContext
    connection?: boolean
    // When there is a connection, what the authed endpoint is. Chat shows
    // different popups to dotcom and enterprise users depending on this value.
    endpoint?: string
    embeddingsEndpoint?: string
    codebase?: string
    filePath?: string
    selectionRange?: ActiveTextEditorSelectionRange
    supportsKeyword?: boolean
}
