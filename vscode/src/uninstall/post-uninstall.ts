import {
    type AuthStatus,
    type AuthStatusProvider,
    TelemetryRecorderProvider,
} from '@sourcegraph/cody-shared'
import { deleteUninstallerDirectory, readConfig } from './serializeConfig'

class StaticAuthStatusProvider implements AuthStatusProvider {
    constructor(private readonly authStatus: AuthStatus) {}
    get status(): AuthStatus {
        return this.authStatus
    }
}

async function main() {
    // Do not record telemetry events during testing
    if (process.env.CODY_TESTING) {
        return
    }

    const uninstaller = readConfig()
    if (uninstaller) {
        const { config, extensionDetails, authStatus, anonymousUserID } = uninstaller
        if (config && authStatus) {
            const provider = new TelemetryRecorderProvider(
                extensionDetails,
                config,
                new StaticAuthStatusProvider(authStatus),
                anonymousUserID,
                'connected-instance-only'
            )
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
