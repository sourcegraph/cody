import {
    type AuthStatus,
    type AuthStatusProvider,
    TelemetryRecorderProvider,
    defaultAuthStatus,
} from '@sourcegraph/cody-shared'
import { deleteUninstallerDirectory, readConfig } from './serializeConfig'

class StaticAuthStatusProvider implements AuthStatusProvider {
    constructor(private readonly authStatus: AuthStatus) {}
    getAuthStatus() {
        return this.authStatus
    }
}

async function main() {
    const uninstaller = readConfig()
    if (uninstaller) {
        const { config, extensionDetails, authStatus, anonymousUserID } = uninstaller
        if (config) {
            const provider = new TelemetryRecorderProvider(
                extensionDetails,
                config,
                new StaticAuthStatusProvider(authStatus ?? defaultAuthStatus),
                anonymousUserID,
                'connected-instance-only'
            )
            const recorder = provider.getRecorder()
            recorder.recordEvent('cody.extension', 'uninstalled')

            // cleanup the uninstaller config
            deleteUninstallerDirectory()
        }
    }
}

main()
