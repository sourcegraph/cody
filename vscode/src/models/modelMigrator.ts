import * as vscode from 'vscode'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { localStorage } from '../services/LocalStorageProvider'

export function migrateAndNotifyForOutdatedModels(model: string | null): string | null {
    if (!model || isRunningInsideAgent()) {
        return model
    }

    // Claude 2 to Claude 3 migration
    if (
        model === 'anthropic/claude-instant-1.2' ||
        model === 'anthropic/claude-2.0' ||
        model === 'anthropic/claude-2.1'
    ) {
        const newModel = 'anthropic/claude-3-sonnet-20240229'
        showNotificationIfNotShownYet(
            'We upgraded you to Claude 3! The Claude 2 family of models is no longer available but you have access to the better Claude 3 model instead.',
            'claude2-migration-notification-shown'
        ).catch(console.error)
        return newModel
    }

    return model
}

async function showNotificationIfNotShownYet(title: string, key: string): Promise<void> {
    const value = localStorage.get(key)
    if (!value) {
        await localStorage.set(key, 'true')
        await vscode.window.showInformationMessage(title)
    }
}
