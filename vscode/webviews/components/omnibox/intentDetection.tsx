import { firstValueFrom } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useClientConfig } from '../../utils/useClientConfig'

export interface IntentDetectionConfig {
    intentDetectionDisabled: boolean
    intentDetectionToggleOn: boolean
    doIntentDetection: boolean
    updateIntentDetectionToggle: (enabled: boolean) => Promise<boolean>
}

const intentDetectionConfigConext = createContext<IntentDetectionConfig>({
    intentDetectionDisabled: false,
    intentDetectionToggleOn: true,
    doIntentDetection: true,
    updateIntentDetectionToggle: async () => false,
})

export const IntentDetectionConfigProvider = ({ children }: { children: React.ReactNode }) => {
    const config = useClientConfig()
    const extensionAPI = useExtensionAPI()

    const [intentDetectionToggleOn, setIntentDetectionToggleOn] = useState<boolean>(
        config?.temporarySettings?.['omnibox.intentDetectionToggleOn'] ??
            config?.intentDetection !== 'opt-in'
    )

    useEffect(() => {
        setIntentDetectionToggleOn(
            config?.temporarySettings?.['omnibox.intentDetectionToggleOn'] ??
                config?.intentDetection !== 'opt-in'
        )
    }, [config?.temporarySettings, config?.intentDetection])

    const updateIntentDetectionToggle = useCallback(
        (enabled: boolean) => {
            setIntentDetectionToggleOn(enabled)

            return firstValueFrom(
                extensionAPI.editTemporarySettings({ 'omnibox.intentDetectionToggleOn': enabled })
            ).then(success => {
                if (!success) {
                    setIntentDetectionToggleOn(!enabled)
                }

                return success
            })
        },
        [extensionAPI]
    )

    const intentDetection = useMemo(
        () =>
            ({
                intentDetectionDisabled: config?.intentDetection === 'disabled',
                intentDetectionToggleOn,
                doIntentDetection: config?.intentDetection !== 'disabled' && intentDetectionToggleOn,
                updateIntentDetectionToggle,
            }) satisfies IntentDetectionConfig,
        [config, intentDetectionToggleOn, updateIntentDetectionToggle]
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
