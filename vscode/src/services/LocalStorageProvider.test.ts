import assert from 'assert'

import { beforeEach, describe, it } from 'vitest'
import type * as vscode from 'vscode'

import type { AuthStatus } from '@sourcegraph/cody-shared'
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

    it('converts chat history without context files upon loading', async () => {
        await localStorage.setChatHistory(DUMMY_AUTH_STATUS, {
            chat: { a: null as any },
            input: ['a', 'b', 'c'] as any, // API expects new format so cast any.
        })

        const loadedHistory = localStorage.getChatHistory(DUMMY_AUTH_STATUS)
        assert.deepStrictEqual(loadedHistory, {
            chat: { a: null },
            input: [
                // Expect new format with context files.
                { inputText: 'a', inputContextFiles: [] },
                { inputText: 'b', inputContextFiles: [] },
                { inputText: 'c', inputContextFiles: [] },
            ],
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
}
