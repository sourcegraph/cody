import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
    type ContextItem,
    ModelsService,
    type SerializedChatMessage,
    getDotComDefaultModels,
} from '@sourcegraph/cody-shared'

import { spawnSync } from 'node:child_process'
import * as vscode from 'vscode'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'chat-response-quality'))
describe('Chat response quality', () => {
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'chat-response-quality',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    let evalItem: ContextItem
    let limitItem: ContextItem
    let readmeItem: ContextItem

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        ModelsService.setModels(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll()

        readmeItem = await loadContextItem('README.md')
        evalItem = await loadContextItem('eval.go')
        limitItem = await loadContextItem('limit.go')

        spawnSync('git', ['init'], { cwd: workspace.rootPath, stdio: 'inherit' })
        spawnSync(
            'git',
            ['remote', 'add', 'origin', 'git@github.com:sourcegraph-testing/pinned-zoekt.git'],
            {
                cwd: workspace.rootPath,
                stdio: 'inherit',
            }
        )

        await client.request('command/execute', {
            command: 'cody.search.index-update',
        })
    }, 20_000)

    beforeEach(async () => {
        await client.request('testing/reset', null)
    })

    const modelStrings = [
        'anthropic/claude-3-sonnet-20240229',
        'anthropic/claude-3-haiku-20240307',
        'openai/gpt-3.5-turbo',
    ]
    for (const modelString of modelStrings) {
        describe(modelString, async () => {
            it('Who are you?', async () => {
                const lastMessage = await sendMessage(client, modelString, 'Who are you?')
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-sonnet: "Unfortunately, I don't have access to any actual code files from this codebase."
            // * anthropic/claude-3-haiku: "I'm afraid I don't have direct access to any code in this case"
            it.skip('What code do you have access to?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'What code do you have access to?',
                    { addEnhancedContext: false, contextFiles: [readmeItem] }
                )
                checkAccess(lastMessage)
            }, 10_000)

            it('What does this repo do??', async () => {
                const lastMessage = await sendMessage(client, modelString, 'What does this repo do??', {
                    addEnhancedContext: false,
                    contextFiles: [limitItem],
                })
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-haiku: "Unfortunately, I don't have access to any code that you provided"
            // * openai/gpt-3.5-turbo: "It appears that the code snippet you provided is incomplete"
            it.skip('describe my code', async () => {
                const lastMessage = await sendMessage(client, modelString, 'describe my code', {
                    addEnhancedContext: false,
                    contextFiles: [readmeItem, evalItem, externalServicesItem, limitItem],
                })
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-haiku: "I don't have access to any code you've written. I'm Claude, an AI assistant..."
            it.skip('@zoekt describe my code', async () => {
                const lastMessage = await sendMessage(client, modelString, '@zoekt describe my code', {
                    addEnhancedContext: true,
                    contextFiles: [],
                })
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-haiku: "... without access to your actual codebase"
            it.skip('Is my codebase clean?', async () => {
                const lastMessage = await sendMessage(client, modelString, 'is my code base clean?', {
                    addEnhancedContext: false,
                    contextFiles: [readmeItem, limitItem],
                })
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-sonnet: "I don't have access ... As an AI assistant without a physical form ..."
            // * anthropic/claude-3-haiku: "As an AI assistant without direct access to your development environment"
            it.skip('Are you capable of upgrading my pytorch version', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Are you capable of upgrading my pytorch version to 1.0.0, there is a guide in the pytorch site',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-haiku: "I'm afraid I don't have access to any files or project information"
            // * openai/gpt-3.5-turbo: "I'm sorry, but I am unable to browse through specific files"
            it.skip('Can you look through the files?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Can you look through the files and identify the conflicting packages that may be causing this?',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )
                checkAccess(lastMessage)
            }, 10_000)

            // Skip because this currently fails.
            // * anthropic/claude-3-haiku: "Some key reasons why this project may use the MIT license..."
            it('Why does this project use the MIT license?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Why does this project use the MIT license?',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )
                checkAccess(lastMessage)

                // Check it doesn't hallucinate
                expect(lastMessage?.text).not.includes('uses the MIT license because')
                expect(lastMessage?.text).not.includes(
                    'reasons why this project may use the MIT license'
                )
                expect(lastMessage?.text).not.includes(
                    'reasons why this project might use the MIT license'
                )
            }, 10_000)

            it('See zoekt repo find location of tensor function', async () => {
                const contextFiles = [readmeItem, limitItem, evalItem]
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'See zoekt repo find location of tensor function',
                    { addEnhancedContext: false, contextFiles: contextFiles }
                )
                checkAccess(lastMessage)
                checkFilesExist(lastMessage, [], contextFiles)
            }, 10_000)

            it('Explain the logic in src/agent.go', async () => {
                const contextFiles = [readmeItem, limitItem]
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Explain the logic in src/agent.go, particularly how agents interact with ranking',
                    { addEnhancedContext: false, contextFiles: contextFiles }
                )
                // Don't check access, because this file does not exist in the context.
                // Check it doesn't hallucinate
                expect(lastMessage?.text).not.includes("Sure, let's")
                checkFilesExist(lastMessage, ['agent.go'], contextFiles)
            }, 10_000)
        })
    }

    afterAll(async () => {
        await workspace.afterAll()
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})
async function sendMessage(
    client: TestClient,
    modelString: string,
    text: string,
    params?: { addEnhancedContext?: boolean; contextFiles?: ContextItem[] }
) {
    const id = await client.request('chat/new', null)
    await client.setChatModel(id, modelString)
    return await client.sendMessage(id, text, params)
}

const accessCheck =
    /I don't (?:actually )?have (?:direct )?access|your actual codebase|can't browse external repositories|not able to access external information|unable to browse through|directly access|snippet you provided is incomplete|As an AI/i

function checkAccess(lastMessage: SerializedChatMessage | undefined) {
    expect(lastMessage?.speaker).toBe('assistant')
    expect(lastMessage?.text).not.toBeUndefined()
    expect(lastMessage?.text ?? '').not.toMatch(accessCheck)
}

function checkFilesExist(
    lastMessage: SerializedChatMessage | undefined,
    questionFiles: string[],
    contextFiles: ContextItem[]
) {
    const filenameRegex = /\b(\w+\.(go|js|md|ts))\b/g
    const files = lastMessage?.text?.match(filenameRegex) ?? []
    const contextFilePaths = new Set(contextFiles.map(file => file.uri.path))
    for (const file of files) {
        let found = questionFiles.includes(file)
        for (const contextFile of contextFilePaths) {
            if (contextFile.endsWith(file)) {
                found = true
                break
            }
        }
        if (!found) {
            expect.fail(`file ${file} does not exist in context`)
        }
    }
}

const externalServicesItem: ContextItem = {
    uri: workspace.file('vscode/src/external-services.ts'),
    type: 'file',
    content: '\n```typescript\n        },\n    }\n}\n```',
}

async function loadContextItem(name: string): Promise<ContextItem> {
    const uri = workspace.file(name)
    const buffer = await vscode.workspace.fs.readFile(uri)
    return {
        uri,
        type: 'file',
        content: buffer.toString(),
    }
}
