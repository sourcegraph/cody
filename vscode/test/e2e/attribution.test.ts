import { expect } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { getChatInputs, getChatSidebarPanel, sidebarSignin } from './common'

import type { SearchAttributionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql/client'
import { type DotcomUrlOverride, test as baseTest } from './helpers'

const test = baseTest.extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })

test('attribution search enabled in chat', async ({ page, sidebar, server }) => {
    server.onGraphQl('SnippetAttribution').replyJson({
        data: {
            snippetAttribution: {
                limitHit: false,
                nodes: [
                    {
                        repositoryName: 'codehost.example/a/b',
                    },
                ],
            },
        } satisfies SearchAttributionResponse,
    })
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/set-mode?mode=permissive`, {
        method: 'POST',
    })
    await sidebarSignin(page, sidebar)
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame)
    await chatInput.fill('show me a long code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('guardrails-status')).toBeVisible()
    await expect(chatFrame.getByTitle('Found in repositories: codehost.example/a/b…')).toBeVisible()
})

test('attribution search disabled in chat', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/set-mode?mode=none`, { method: 'POST' })
    await sidebarSignin(page, sidebar)
    const chatFrame = getChatSidebarPanel(page)
    const chatInput = getChatInputs(chatFrame)
    await chatInput.fill('show me a long code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('guardrails-status')).not.toBeVisible()
})
