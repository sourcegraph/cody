import { ConfigurationUseContext } from '../configuration'
import { ActiveTextEditorSelectionRange } from '../editor'

export interface ChatContextStatus {
    mode?: ConfigurationUseContext
    connection?: boolean
    embeddingsEndpoint?: string
    codebase?: string
    filePath?: string
    selectionRange?: ActiveTextEditorSelectionRange
    supportsKeyword?: boolean
}
