import { type ChatModel, type EditModel, type Model, ModelUsage } from '@sourcegraph/cody-shared'
import type { AuthProvider } from '../services/AuthProvider'
import { localStorage } from '../services/LocalStorageProvider'
import { migrateAndNotifyForOutdatedModels } from './modelMigrator'

/**
 * A mapping of the model usage type (i.e. chat or edit)
 * to the local storage key used to store the model selection.
 */
export const MODEL_STORAGE_KEYS: Record<ModelUsage, string> = {
    [ModelUsage.Chat]: 'model',
    [ModelUsage.Edit]: 'editModel',
}

async function setModel(modelID: EditModel, storageKey: string) {
    // Store the selected model in local storage to retrieve later
    return localStorage.set(storageKey, modelID)
}

function getModel<T extends string>(authProvider: AuthProvider, models: Model[], usage: ModelUsage): T {
    const storageKey = MODEL_STORAGE_KEYS[usage]
    const authStatus = authProvider.getAuthStatus()

    if (!authStatus.authenticated) {
        throw new Error('You are not authenticated')
    }

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
    const lastSelectedModelID = localStorage.get<string>(storageKey)
    const migratedModelID = migrateAndNotifyForOutdatedModels(lastSelectedModelID)

    if (migratedModelID && migratedModelID !== lastSelectedModelID) {
        void setModel(migratedModelID, storageKey)
    }

    if (migratedModelID) {
        // If the last selected model exists in the list of models then we return it
        const model = models.find(m => m.model === migratedModelID)
        if (model) {
            return migratedModelID as T
        }
    }
    // If the user has not selected a model before then we return the default model
    const defaultModel =
        models.find(m => (usage === ModelUsage.Edit ? m.editDefault : m.chatDefault)) || models[0]
    if (!defaultModel) {
        throw new Error('No chat model found in server-provided config')
    }
    return defaultModel.model as T
}

function createModelAccessor<T extends string>(usage: ModelUsage) {
    return {
        get: (authProvider: AuthProvider, models: Model[]) => getModel<T>(authProvider, models, usage),
        set: (modelID: T) => setModel(modelID, MODEL_STORAGE_KEYS[usage]),
    }
}

export const chatModel = createModelAccessor<ChatModel>(ModelUsage.Chat)
export const editModel = createModelAccessor<EditModel>(ModelUsage.Edit)
