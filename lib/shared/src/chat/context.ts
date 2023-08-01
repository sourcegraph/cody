import { ConfigurationUseContext } from '../configuration'
import { ActiveTextEditorSelectionRange } from '../editor'

export interface ChatContextStatus {
    mode?: ConfigurationUseContext
    connection?: boolean
    codebase?: string
    filePath?: string
    selectionRange?: ActiveTextEditorSelectionRange
    supportsKeyword?: boolean
}
