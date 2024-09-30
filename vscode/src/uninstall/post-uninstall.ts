import {
    TelemetryRecorderProvider,
    nextTick,
    setAuthStatusObservable,
    setStaticResolvedConfigurationValue,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { deleteUninstallerDirectory, readConfig } from './serializeConfig'

async function main() {
    // Do not record telemetry events during testing
    if (process.env.CODY_TESTING) {
        return
    }

    const uninstaller = readConfig()
    if (uninstaller) {
        const { config, authStatus } = uninstaller
        if (config && authStatus) {
            try {
                setStaticResolvedConfigurationValue(config)
            } catch {}
            try {
                setAuthStatusObservable(Observable.of(authStatus))
            } catch {}
            // Wait for `currentAuthStatusOrNotReadyYet` to have this value synchronously.
            await nextTick()

            const provider = new TelemetryRecorderProvider(config, 'connected-instance-only')
            const recorder = provider.getRecorder()
            recorder.recordEvent('cody.extension', 'uninstalled', {
                billingMetadata: {
                    product: 'cody',
                    category: 'billable',
                },
            })

            // cleanup the uninstaller config
            deleteUninstallerDirectory()
        }
    }
}

main()
