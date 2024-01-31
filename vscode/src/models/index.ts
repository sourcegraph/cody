import type { ModelProvider } from '@sourcegraph/cody-shared'
import type { AuthProvider } from '../services/AuthProvider'

async function setModel(modelID: string, storageKey: string) {
    // Store the selected model in local storage to retrieve later
    return localStorage.set(storageKey, modelID)
}

function getModel(authProvider: AuthProvider, models: ModelProvider[], storageKey: string): string {
    const authStatus = authProvider.getAuthStatus()
    // Free user can only use the default model
    if (authStatus.isDotCom && authStatus.userCanUpgrade) {
        return models[0].model
    }
    // Check for the last selected model
    const lastSelectedModelID = localStorage.get(storageKey)
    if (lastSelectedModelID) {
        // If the last selected model exists in the list of models then we return it
        const model = models.find(m => m.model === lastSelectedModelID)
        if (model) {
            return lastSelectedModelID
        }
    }
    // If the user has not selected a model before then we return the default model
    const defaultModel = models.find(m => m.default) || models[0]
    if (!defaultModel) {
        throw new Error('No chat model found in server-provided config')
    }
    return defaultModel.model
}

const createModelAccessor = (storageKey: string) => {
    return {
        get: (authProvider: AuthProvider, models: ModelProvider[]) =>
            getModel(authProvider, models, storageKey),
        set: (modelID: string) => setModel(modelID, storageKey),
    }
}

export const chatModel = createModelAccessor('model')
export const editModel = createModelAccessor('editModel')
