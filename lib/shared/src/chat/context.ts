import type { RangeData } from '../common/range'
import type { ConfigurationUseContext } from '../configuration'

export interface ChatContextStatus {
    mode?: ConfigurationUseContext
    connection?: boolean
    // When there is a connection, what the authed endpoint is. Chat shows
    // different popups to dotcom and enterprise users depending on this value.
    endpoint?: string
    embeddingsEndpoint?: string
    codebase?: string
    filePath?: string
    selectionRange?: RangeData
    supportsKeyword?: boolean
}
