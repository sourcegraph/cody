import type { CompletionParameters, ModelContextWindow } from '@sourcegraph/cody-shared'
import type { FixupTask } from '../../non-stop/FixupTask'

export interface ModelParametersInput {
    model: string
    stopSequences?: string[]
    contextWindow: ModelContextWindow
    task: FixupTask
}

export interface ModelParameterProvider {
    getModelParameters(args: ModelParametersInput): CompletionParameters
}
