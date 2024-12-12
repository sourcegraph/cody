import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useFeatureFlag } from './useFeatureFlags'

export const useExperimentalOneBox = (): boolean | undefined => {
    return useFeatureFlag(FeatureFlag.CodyExperimentalOneBox)
}

export const useExperimentalOneBoxDebug = (): boolean | undefined => {
    return useFeatureFlag(FeatureFlag.CodyExperimentalOneBox)
}
