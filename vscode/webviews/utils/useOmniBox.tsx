import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useClientConfig } from './useClientConfig'
import { useFeatureFlag } from './useFeatureFlags'

export const useOmniBox = (): boolean => {
    const config = useClientConfig()

    return !!config?.omniBoxEnabled
}

export const useOmniBoxDebug = (): boolean | undefined => {
    return useFeatureFlag(FeatureFlag.CodyExperimentalOneBoxDebug)
}
