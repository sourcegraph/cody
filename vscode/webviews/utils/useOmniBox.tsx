import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useClientConfig } from './useClientConfig'
import { useFeatureFlag } from './useFeatureFlags'

export const useOmniBox = (): boolean => {
    const config = useClientConfig()
    // TODO(naman/tom): Remove this FF check before the Cody release on 29th.
    const tempFFCheck = useFeatureFlag(FeatureFlag.TempCodyExperimentalOnebox)

    return !!config?.omniBoxEnabled && !!tempFFCheck
}

export const useOmniBoxDebug = (): boolean | undefined => {
    return useFeatureFlag(FeatureFlag.CodyExperimentalOneBoxDebug)
}
