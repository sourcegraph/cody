import { firstValueFrom } from '@sourcegraph/cody-shared'
import { useExtensionAPI } from '@sourcegraph/prompt-editor'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useClientConfig } from '../../utils/useClientConfig'

export interface IntentDetectionConfig {
    intentDetectionDisabled: boolean
    intentDetectionToggleOn: boolean
    updateIntentDetectionToggle: (enabled: boolean) => Promise<boolean>
}

export const INTENT_DETECTION_TOGGLE_ON_KEY = 'omnibox.intentDetectionToggleOn'

const intentDetectionConfigConext = createContext<IntentDetectionConfig>({
    intentDetectionDisabled: false,
    intentDetectionToggleOn: true,
    updateIntentDetectionToggle: async () => false,
})

export const IntentDetectionConfigProvider = ({ children }: { children: React.ReactNode }) => {
    const config = useClientConfig()
    const extensionAPI = useExtensionAPI()

    const [intentDetectionToggleOn, setIntentDetectionToggleOn] = useState<boolean>(
        config?.temporarySettings?.[INTENT_DETECTION_TOGGLE_ON_KEY] ??
            !config?.intentDetectionDefaultToggleOff
    )

    useEffect(() => {
        setIntentDetectionToggleOn(
            config?.temporarySettings?.[INTENT_DETECTION_TOGGLE_ON_KEY] ??
                !config?.intentDetectionDefaultToggleOff
        )
    }, [config?.temporarySettings, config?.intentDetectionDefaultToggleOff])

    const updateIntentDetectionToggle = useCallback(
        (enabled: boolean) => {
            setIntentDetectionToggleOn(enabled)

            return firstValueFrom(
                extensionAPI.editTemporarySettings(
                    JSON.stringify({ [INTENT_DETECTION_TOGGLE_ON_KEY]: enabled })
                )
            ).then(success => {
                if (!success) {
                    console.log('undoing toggle')
                    setIntentDetectionToggleOn(!enabled)
                }

                return success
            })
        },
        [extensionAPI]
    )

    const intentDetection = useMemo(
        () => ({
            intentDetectionDisabled: config?.intentDetectionDisabled ?? false,
            intentDetectionToggleOn,
            updateIntentDetectionToggle,
        }),
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
