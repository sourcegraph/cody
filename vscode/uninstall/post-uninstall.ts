import {
    CodyIDE,
    TelemetryRecorderProvider,
    mockClientCapabilities,
    nextTick,
    setAuthStatusObservable,
    setStaticResolvedConfigurationValue,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { createUninstallMarker } from './reinstall'
import { deleteUninstallerConfig, readConfig } from './serializeConfig'

async function main() {
    // Do not record telemetry events during testing
    if (process.env.CODY_TESTING) {
        return
    }

    const uninstaller = await readConfig()
    if (uninstaller) {
        const { config, authStatus, version, clientCapabilities } = uninstaller
        if (config && authStatus) {
            try {
                setStaticResolvedConfigurationValue(config)
            } catch (error) {
                console.error('Failed to set config', error)
            }
            try {
                setAuthStatusObservable(Observable.of(authStatus))
            } catch (error) {
                console.error('Failed to set auth status', error)
            }
            // Wait for `currentAuthStatusOrNotReadyYet` to have this value synchronously.
            await nextTick()
            mockClientCapabilities(
                clientCapabilities ?? {
                    agentIDE: CodyIDE.VSCode,
                    isVSCode: true,
                    isCodyWeb: false,
                    agentExtensionVersion: version,
                    // Unused by TelemetryRecorderProvider
                    agentIDEVersion: '',
                    telemetryClientName: `${CodyIDE.VSCode}.Cody`,
                }
            )

            const provider = new TelemetryRecorderProvider(config, 'connected-instance-only')
            const recorder = provider.getRecorder()
            recorder.recordEvent('cody.extension', 'uninstalled', {
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })

            // cleanup the uninstaller config
            await deleteUninstallerConfig()
            await createUninstallMarker()
        }
    }
}

main()
