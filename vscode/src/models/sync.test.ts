import {
    Model,
    ModelsService,
    ModelUsage,
    defaultAuthStatus,
    getDotComDefaultModels,
    unauthenticatedStatus,
} from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncModels } from './sync'
import { getEnterpriseContextWindow } from './utils'

describe('syncModelsService', () => {
    const setProvidersSpy = vi.spyOn(ModelsService, 'setModels')

    beforeEach(() => {
        setProvidersSpy.mockClear()
    })

    it('does not set providers if not authenticated', () => {
        syncModels(unauthenticatedStatus)
        expect(setProvidersSpy).not.toHaveBeenCalled()
    })

    it('sets dotcom default models if on dotcom', () => {
        const authStatus = { ...defaultAuthStatus, isDotCom: true, authenticated: true }

        syncModels(authStatus)

        expect(setProvidersSpy).toHaveBeenCalledWith(getDotComDefaultModels())
    })

    it('sets enterprise context window model if chatModel config overwrite exists', () => {
        const chatModel = 'custom-model'
        const authStatus = {
            ...defaultAuthStatus,
            authenticated: true,
            isDotCom: false,
            configOverwrites: { chatModel },
        }

        syncModels(authStatus)

        expect(setProvidersSpy).not.toHaveBeenCalledWith(getDotComDefaultModels())

        expect(setProvidersSpy).toHaveBeenCalledWith([
            new Model(
                authStatus.configOverwrites.chatModel,
                [ModelUsage.Chat, ModelUsage.Edit],
                getEnterpriseContextWindow(chatModel, authStatus.configOverwrites)
            ),
        ])
    })
})
