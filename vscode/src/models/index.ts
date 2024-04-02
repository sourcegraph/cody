import type { ChatModel, EditModel, ModelProvider } from '@sourcegraph/cody-shared'
import type { AuthProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'

async function setModel(modelID: EditModel, storageKey: string) {
    // Store the selected model in local storage to retrieve later
    return localStorage.set(storageKey, modelID)
}

function getModel<T extends string>(
    authProvider: AuthProvider,
    models: ModelProvider[],
    storageKey: string
): T {
    const authStatus = authProvider.getAuthStatus()
    // Free user can only use the default model
    if (authStatus.isDotCom && authStatus.userCanUpgrade) {
        return models[0].model as T
    }

    // Enterprise user can only use the default model
    // We only support a single model for enterprise users right now
    if (!authStatus.isDotCom) {
        return models[0].model as T
    }

    // Check for the last selected model
    const lastSelectedModelID = localStorage.get(storageKey)
    if (lastSelectedModelID) {
        // If the last selected model exists in the list of models then we return it
        const model = models.find(m => m.model === lastSelectedModelID)
        if (model) {
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
        get: (authProvider: AuthProvider, models: ModelProvider[]) =>
            getModel<T>(authProvider, models, storageKey),
        set: (modelID: T) => setModel(modelID, storageKey),
    }
}

export const chatModel = createModelAccessor<ChatModel>('model')
export const editModel = createModelAccessor<EditModel>('editModel')
