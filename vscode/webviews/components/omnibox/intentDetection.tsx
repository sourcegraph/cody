import { createContext, useContext, useMemo } from 'react'
import { useClientConfig } from '../../utils/useClientConfig'

export interface IntentDetectionConfig {
    intentDetectionDisabled: boolean
    doIntentDetection: boolean
}

const intentDetectionConfigConext = createContext<IntentDetectionConfig>({
    intentDetectionDisabled: false,
    doIntentDetection: true,
})

export const IntentDetectionConfigProvider = ({ children }: { children: React.ReactNode }) => {
    const config = useClientConfig()

    const intentDetection = useMemo(
        () =>
            ({
                intentDetectionDisabled:
                    !config?.omniBoxEnabled || config?.intentDetection === 'disabled',
                doIntentDetection: !!config?.omniBoxEnabled && config?.intentDetection !== 'disabled',
            }) satisfies IntentDetectionConfig,
        [config]
    )

    return (
        <intentDetectionConfigConext.Provider value={intentDetection}>
            {children}
        </intentDetectionConfigConext.Provider>
    )
}

export const useIntentDetectionConfig = (): IntentDetectionConfig => {
    return useContext(intentDetectionConfigConext)
}
