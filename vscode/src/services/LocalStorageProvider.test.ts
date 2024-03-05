import { beforeEach, describe, expect, it } from 'vitest'
import type * as vscode from 'vscode'

import type { AuthStatus } from '../chat/protocol'

import { URI } from 'vscode-uri'
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
            chat: { a: null as any },
            input: [{ inputText: 'a', inputContextFiles: [{ type: 'file', uri: URI.file('a') }] }],
        })

        const loadedHistory = localStorage.getChatHistory(DUMMY_AUTH_STATUS)
        expect(loadedHistory).toEqual({
            chat: { a: null as any },
            input: [{ inputText: 'a', inputContextFiles: [{ type: 'file', uri: URI.file('a') }] }],
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
