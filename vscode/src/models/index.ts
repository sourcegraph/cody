import { type ChatModel, type EditModel, ModelProvider } from '@sourcegraph/cody-shared'
import { ModelUsage } from '@sourcegraph/cody-shared/src/models/types'
import type { AuthProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'

async function setModel(modelID: EditModel, storageKey: string) {
    // Store the selected model in local storage to retrieve later
    return localStorage.set(storageKey, modelID)
}

function getModel<T extends string>(authProvider: AuthProvider, storageKey: string): T {
    const authStatus = authProvider.getAuthStatus()
    const isCodyFreeUser = authStatus.isDotCom && authStatus.userCanUpgrade
    const isCodyProUser = authStatus.isDotCom && !authStatus.userCanUpgrade

    const models = ModelProvider.getProviders(
        storageKey === 'model' ? ModelUsage.Chat : ModelUsage.Edit,
        isCodyProUser
    )

    // Check for the last selected model for Pro Users only.
    // Free user can only use the default model.
    // Enterprise user can only use the default model
    // We only support a single model for enterprise users right now
    const lastSelectedModelID = localStorage.get(storageKey)
    if (!isCodyFreeUser && lastSelectedModelID) {
        // If the last selected model exists in the list of models then we return it
        if (models.some(m => m.model === lastSelectedModelID)) {
            return lastSelectedModelID as T
        }
    }

    // If the user has not selected a model before then we return the default model
    const defaultModel = models.find(m => m.default) || models[0]
    if (!defaultModel) {
        throw new Error('No chat model found in server-provided config')
    }
    return defaultModel.model as T
}

function createModelAccessor<T extends string>(storageKey: string) {
    return {
        get: (authProvider: AuthProvider) => getModel<T>(authProvider, storageKey),
        set: (modelID: T) => setModel(modelID, storageKey),
    }
}

export const chatModel = createModelAccessor<ChatModel>('model')
export const editModel = createModelAccessor<EditModel>('editModel')
