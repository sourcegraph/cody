import type { PromptString } from '@sourcegraph/cody-shared'

export interface RecentEditDiffingStrategy {
    getStrategyIdentifier(): string

    getDiffHunks(oldContent: string): PromptString[]
}
