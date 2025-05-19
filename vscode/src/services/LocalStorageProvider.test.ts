import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import { AUTH_STATUS_FIXTURE_AUTHED, type UserLocalHistory } from '@sourcegraph/cody-shared'

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
        await localStorage.setChatHistory(AUTH_STATUS_FIXTURE_AUTHED, {
            chat: { a: { id: 'a', lastInteractionTimestamp: '123', interactions: [] } },
        })

        const loadedHistory = localStorage.getChatHistory(AUTH_STATUS_FIXTURE_AUTHED)
        expect(loadedHistory).toEqual<UserLocalHistory>({
            chat: { a: { id: 'a', lastInteractionTimestamp: '123', interactions: [] } },
        })
    })
})
