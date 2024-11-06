import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useFeatureFlag } from './useFeatureFlags'

export const useExperimentalDeepCodyAgent = (): string | undefined => {
    return useFeatureFlag(FeatureFlag.DeepCody) ? 'deep-cody' : undefined
}
