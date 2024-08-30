import { type Model, ModelUsage, modelsService } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import { localStorage } from '../services/LocalStorageProvider'

const DEPRECATED_DOT_COM_MODELS = [
    {
        title: 'Claude 2.0',
        id: 'anthropic/claude-2.0',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: 0, output: 0 },
    },
    {
        title: 'Claude 2.1',
        id: 'anthropic/claude-2.1',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: 0, output: 0 },
    },
    {
        title: 'Claude Instant',
        id: 'anthropic/claude-instant-1.2',
        provider: 'Anthropic',
        usage: [ModelUsage.Chat, ModelUsage.Edit],
        contextWindow: { input: 0, output: 0 },
    },
] as Model[]

const deprecatedModelSet = new Set(DEPRECATED_DOT_COM_MODELS.map(m => m.id))

export function migrateAndNotifyForOutdatedModels(model: string | null): string | null {
    if (!model || isRunningInsideAgent() || !deprecatedModelSet.has(model)) {
        return model
    }

    // Claude 2 to Claude 3 migration.
    const newModel = 'anthropic/claude-3-5-sonnet-20240620'
    // Verify that the new model is available before migrating.
    if (modelsService.instance!.getModelByID(newModel)) {
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
