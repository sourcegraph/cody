import * as vscode from 'vscode'

import type { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared'

import { localStorage } from '../services/LocalStorageProvider'

import { showActionNotification } from '.'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

export const showSetupNotification = async (config: ConfigurationWithAccessToken): Promise<void> => {
    if (config.serverEndpoint && config.accessToken) {
        // User has already attempted to configure Cody.
        // Regardless of if they are authenticated or not, we don't want to prompt them.
        return
    }

    if (localStorage.get('notification.setupDismissed') === 'true') {
        // User has clicked "Do not show again" on this notification.
        return
    }

    if (localStorage.get('extension.hasActivatedPreviously') !== 'true') {
        // User is on first activation, so has only just installed Cody.
        // Show Cody so that they can get started.
        await vscode.commands.executeCommand('cody.focus')
        return
    }

    telemetryService.log('CodyVSCodeExtension:signInNotification:shown', undefined, { hasV2Event: true })
    telemetryRecorder.recordEvent('cody.signInNotification', 'shown')

    return showActionNotification({
        message: 'Sign in to Cody to get started',
        actions: [
            {
                label: 'Sign In',
                onClick: async () => {
                    vscode.commands.executeCommand('cody.focus')
                    telemetryService.log(
                        'CodyVSCodeExtension:signInNotification:signIn:clicked',
                        undefined,
                        { hasV2Event: true }
                    )
                    telemetryRecorder.recordEvent('cody.signInNotification.signInButton', 'clicked')
                },
            },
            {
                label: 'Do not show again',
                onClick: async () => {
                    localStorage.set('notification.setupDismissed', 'true')
                    telemetryService.log(
                        'CodyVSCodeExtension:signInNotification:doNotShow:clicked',
                        undefined,
                        {
                            hasV2Event: true,
                        }
                    )
                    telemetryRecorder.recordEvent('cody.signInNotification.doNotShow', 'clicked')
                },
            },
        ],
    })
}
