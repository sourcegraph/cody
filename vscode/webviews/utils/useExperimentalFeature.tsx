import { FeatureFlag } from '@sourcegraph/cody-shared'
import { useFeatureFlag } from './useFeatureFlags'

export const useSourcegraphTeamsUpgradeCtaFlag = (): boolean | undefined => {
    return useFeatureFlag(FeatureFlag.SourcegraphTeamsUpgradeCTA)
}
