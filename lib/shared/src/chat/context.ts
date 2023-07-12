import { ConfigurationUseContext } from '../configuration'
import { JointRange } from '../editor'

export interface ChatContextStatus {
    mode?: ConfigurationUseContext
    connection?: boolean
    codebase?: string
    filePath?: string
    selection?: JointRange
    supportsKeyword?: boolean
}
