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
        const currentTime = new Date().toISOString()
        await localStorage.setChatHistory(AUTH_STATUS_FIXTURE_AUTHED, {
            chat: { a: { id: 'a', lastInteractionTimestamp: currentTime, interactions: [] } },
        })

        const loadedHistory = localStorage.getChatHistory(AUTH_STATUS_FIXTURE_AUTHED)
        expect(loadedHistory).toEqual<UserLocalHistory>({
            chat: { a: { id: 'a', lastInteractionTimestamp: currentTime, interactions: [] } },
        })
    })

    describe('filterChatHistoryOlderThan', () => {
        it('removes chat entries older than the specified date', () => {
            const now = new Date()
            const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)
            const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
            const fortyDaysAgo = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000)

            const history: UserLocalHistory = {
                chat: {
                    recent: {
                        id: 'recent',
                        lastInteractionTimestamp: now.toISOString(),
                        interactions: [],
                    },
                    twoDaysOld: {
                        id: 'twoDaysOld',
                        lastInteractionTimestamp: twoDaysAgo.toISOString(),
                        interactions: [],
                    },
                    tenDaysOld: {
                        id: 'tenDaysOld',
                        lastInteractionTimestamp: tenDaysAgo.toISOString(),
                        interactions: [],
                    },
                    fortyDaysOld: {
                        id: 'fortyDaysOld',
                        lastInteractionTimestamp: fortyDaysAgo.toISOString(),
                        interactions: [],
                    },
                },
            }

            // Filter out chats older than 15 days
            const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
            localStorage.filterChatHistoryOlderThan(fifteenDaysAgo, history)

            // Should keep recent and twoDaysOld and tenDaysOld, but remove fortyDaysOld
            expect(Object.keys(history.chat).length).toBe(3)
            expect(history.chat.recent).toBeDefined()
            expect(history.chat.twoDaysOld).toBeDefined()
            expect(history.chat.tenDaysOld).toBeDefined()
            expect(history.chat.fortyDaysOld).toBeUndefined()
        })

        it('keeps all chat entries if all are newer than the cutoff date', () => {
            const now = new Date()
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)

            const history: UserLocalHistory = {
                chat: {
                    recent1: {
                        id: 'recent1',
                        lastInteractionTimestamp: now.toISOString(),
                        interactions: [],
                    },
                    recent2: {
                        id: 'recent2',
                        lastInteractionTimestamp: fiveDaysAgo.toISOString(),
                        interactions: [],
                    },
                },
            }

            const initialCount = Object.keys(history.chat).length

            // Filter out chats older than 10 days
            const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
            localStorage.filterChatHistoryOlderThan(tenDaysAgo, history)

            // Should keep all chats
            expect(Object.keys(history.chat).length).toBe(initialCount)
            expect(history.chat.recent1).toBeDefined()
            expect(history.chat.recent2).toBeDefined()
        })

        it('removes all chat entries if all are older than the cutoff date', () => {
            const now = new Date()
            const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000)
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

            const history: UserLocalHistory = {
                chat: {
                    old1: {
                        id: 'old1',
                        lastInteractionTimestamp: twentyDaysAgo.toISOString(),
                        interactions: [],
                    },
                    old2: {
                        id: 'old2',
                        lastInteractionTimestamp: thirtyDaysAgo.toISOString(),
                        interactions: [],
                    },
                },
            }

            // Filter out chats older than 10 days
            const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000)
            localStorage.filterChatHistoryOlderThan(tenDaysAgo, history)

            // Should remove all chats
            expect(Object.keys(history.chat).length).toBe(0)
        })
    })

    it('automatically filters old chat entries when saving chat history', async () => {
        const now = new Date()

        // Create a chat history with both recent and old entries
        const recentChat = {
            id: 'recent',
            lastInteractionTimestamp: now.toISOString(),
            interactions: [],
        }

        // Create entry older than 30 days (the cutoff in setChatHistory)
        const oldDate = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000)
        const oldChat = {
            id: 'old',
            lastInteractionTimestamp: oldDate.toISOString(),
            interactions: [],
        }

        const history: UserLocalHistory = {
            chat: {
                recent: recentChat,
                old: oldChat,
            },
        }

        // Save the chat history
        await localStorage.setChatHistory(AUTH_STATUS_FIXTURE_AUTHED, history)

        // Retrieve the chat history
        const loadedHistory = localStorage.getChatHistory(AUTH_STATUS_FIXTURE_AUTHED)

        // The old chat should be filtered out
        expect(Object.keys(loadedHistory.chat).length).toBe(1)
        expect(loadedHistory.chat.recent).toBeDefined()
        expect(loadedHistory.chat.old).toBeUndefined()
    })
})
