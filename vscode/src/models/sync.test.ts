import { ModelProvider, ModelUsage, getDotComDefaultModels } from '@sourcegraph/cody-shared'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAuthStatus, unauthenticatedStatus } from '../chat/protocol'
import { syncModelProviders } from './sync'
import { getEnterpriseContextWindow } from './utils'

describe('syncModelProviders', () => {
    const setProvidersSpy = vi.spyOn(ModelProvider, 'setProviders')

    beforeEach(() => {
        setProvidersSpy.mockClear()
    })

    it('does not set providers if not authenticated', () => {
        syncModelProviders(unauthenticatedStatus)
        expect(setProvidersSpy).not.toHaveBeenCalled()
    })

    it('sets dotcom default models if on dotcom', () => {
        const authStatus = { ...defaultAuthStatus, isDotCom: true, authenticated: true }

        syncModelProviders(authStatus)

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

        syncModelProviders(authStatus)

        expect(setProvidersSpy).not.toHaveBeenCalledWith(getDotComDefaultModels())

        expect(setProvidersSpy).toHaveBeenCalledWith([
            new ModelProvider(
                authStatus.configOverwrites.chatModel,
                [ModelUsage.Chat, ModelUsage.Edit],
                getEnterpriseContextWindow(chatModel, authStatus.configOverwrites)
            ),
        ])
    })
})
