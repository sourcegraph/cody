import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useFeatureFlag } from './useFeatureFlags'

export const useExperimentalDeepCody = (): boolean => {
    return useFeatureFlag(FeatureFlag.DeepCody) ?? false
}
