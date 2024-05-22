import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import type { AuthStatus, UserLocalHistory } from '@sourcegraph/cody-shared'

import { localStorage } from './LocalStorageProvider'

describe('LocalStorageProvider', () => {
    // Set up local storage backed by an object.
    let localStorageData: { [key: string]: unknown } = {}
    localStorage.setStorage({
        get: (key: string) => localStorageData[key],
        update: (key: string, value: unknown) => {
            localStorageData[key] = value
            return Promise.resolve()
        },
    } as any as vscode.Memento)

    beforeEach(() => {
        localStorageData = {}
    })

    it('sets and gets chat history', async () => {
        await localStorage.setChatHistory(DUMMY_AUTH_STATUS, {
            chat: { a: { id: 'a', lastInteractionTimestamp: '123', interactions: [] } },
        })

        const loadedHistory = localStorage.getChatHistory(DUMMY_AUTH_STATUS)
        expect(loadedHistory).toEqual<UserLocalHistory>({
            chat: { a: { id: 'a', lastInteractionTimestamp: '123', interactions: [] } },
        })
    })

    it('converts chat history to use ChatMessage.model not just SerializedChatTranscript.chatModel', async () => {
        const chatHistory: UserLocalHistory = {
            chat: {
                a: {
                    id: 'a',
                    lastInteractionTimestamp: '123',
                    chatModel: 'my-model',
                    interactions: [
                        {
                            humanMessage: { speaker: 'human', text: 'hello' },
                            assistantMessage: { speaker: 'assistant', text: 'hi' },
                        },
                    ],
                },
            },
        }
        await localStorage.setChatHistory(DUMMY_AUTH_STATUS, chatHistory)
        const loadedHistory = localStorage.getChatHistory(DUMMY_AUTH_STATUS)
        expect(loadedHistory).toEqual<UserLocalHistory>({
            chat: {
                a: {
                    id: 'a',
                    lastInteractionTimestamp: '123',
                    chatModel: 'my-model',
                    interactions: [
                        {
                            humanMessage: { speaker: 'human', text: 'hello' },
                            assistantMessage: { speaker: 'assistant', text: 'hi', model: 'my-model' },
                        },
                    ],
                },
            },
        })
    })
})

const DUMMY_AUTH_STATUS: AuthStatus = {
    endpoint: null,
    isDotCom: true,
    isLoggedIn: true,
    showInvalidAccessTokenError: false,
    authenticated: true,
    hasVerifiedEmail: true,
    requiresVerifiedEmail: true,
    siteHasCodyEnabled: true,
    siteVersion: '1234',
    primaryEmail: 'heisenberg@exmaple.com',
    username: 'uwu',
    displayName: 'w.w.',
    avatarURL: '',
    userCanUpgrade: false,
    codyApiVersion: 0,
}
