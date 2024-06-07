import { ModelsService, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { localStorage } from '../services/LocalStorageProvider'

const deprecatedModelSet = new Set(
    getDotComDefaultModels()
        .filter(m => m.deprecated)
        .map(m => m.model)
)
export function migrateAndNotifyForOutdatedModels(model: string | null): string | null {
    if (!model || isRunningInsideAgent() || !deprecatedModelSet.has(model)) {
        return model
    }

    // Claude 2 to Claude 3 migration.
    const newModel = 'anthropic/claude-3-sonnet-20240229'
    // Verify that the new model is available before migrating.
    if (ModelsService.getModelByID(newModel)) {
        showNotificationIfNotShownYet(
            'Claude 2 model support has been removed in favor of the newer Claude 3 models. All chats that used Claude 2 have been upgraded to Claude 3.',
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
