import * as vscode from 'vscode'

import type { AuthCredentials } from '@sourcegraph/cody-shared'

import { localStorage } from '../services/LocalStorageProvider'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { showActionNotification } from '.'

export const showSetupNotification = async (auth: AuthCredentials): Promise<void> => {
    if (auth.serverEndpoint && auth.accessToken) {
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
        await vscode.commands.executeCommand('cody.chat.focus')
        return
    }

    telemetryRecorder.recordEvent('cody.signInNotification', 'shown')

    return showActionNotification({
        message: 'Sign in to Cody to get started',
        actions: [
            {
                label: 'Sign In',
                onClick: async () => {
                    vscode.commands.executeCommand('cody.chat.focus')
                    telemetryRecorder.recordEvent('cody.signInNotification.signInButton', 'clicked')
                },
            },
            {
                label: 'Do not show again',
                onClick: async () => {
                    localStorage.set('notification.setupDismissed', 'true')
                    telemetryRecorder.recordEvent('cody.signInNotification.doNotShow', 'clicked', {
                        billingMetadata: {
                            category: 'billable',
                            product: 'cody',
                        },
                    })
                },
            },
        ],
    })
}
