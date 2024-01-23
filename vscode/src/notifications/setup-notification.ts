import * as vscode from 'vscode'

import type { ConfigurationWithAccessToken } from '@sourcegraph/cody-shared'

import { localStorage } from '../services/LocalStorageProvider'

import { showActionNotification } from '.'

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

    return showActionNotification({
        message: 'Continue setting up Cody',
        actions: [
            {
                label: 'Setup',
                onClick: () => vscode.commands.executeCommand('cody.focus'),
            },
            {
                label: 'Do not show again',
                onClick: () => localStorage.set('notification.setupDismissed', 'true'),
            },
        ],
    })
}
