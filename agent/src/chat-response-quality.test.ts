import path from 'node:path'

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
    type ContextItem,
    ModelProvider,
    type SerializedChatMessage,
    getDotComDefaultModels,
} from '@sourcegraph/cody-shared'

import { spawnSync } from 'node:child_process'
import { TESTING_CREDENTIALS } from '../../vscode/src/testutils/testing-credentials'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'

const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'example-ts'))

const characterCheck = /anthropic|openai|gpt|claude/i
const hedgingCheck =
    /afraid|apologize|sorry|unfortunately|enough information|full contents|As an AI|without access/i

describe('Chat response quality', () => {
    const client = TestClient.create({
        workspaceRootUri: workspace.rootUri,
        name: 'chat-response-quality',
        credentials: TESTING_CREDENTIALS.dotcom,
    })

    // Initialize inside beforeAll so that subsequent tests are skipped if initialization fails.
    beforeAll(async () => {
        ModelProvider.setProviders(getDotComDefaultModels())
        await workspace.beforeAll()
        await client.beforeAll()

        spawnSync('git', ['init'], { cwd: workspace.rootPath, stdio: 'inherit' })
        spawnSync(
            'git',
            ['remote', 'add', 'origin', 'git@github.com:sourcegraph-testing/pinned-zoekt.git'],
            {
                cwd: workspace.rootPath,
                stdio: 'inherit',
            }
        )
    }, 20_000)

    beforeEach(async () => {
        await client.request('testing/reset', null)
    })

    describe('Questions about origin', () => {
        it('Who are you?', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Who are you?')
            checkLastMessage(lastMessage)
            checkNoFiles(lastMessage)
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('cody')
        }, 10_000)

        it.skip('Who created you??', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Who created you??')
            checkLastMessage(lastMessage)
            checkNoFiles(lastMessage)
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('sourcegraph')
        }, 10_000)

        it.skip('Who created you?? with irrelevant context', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('Who created you??', {
                addEnhancedContext: false,
                contextFiles: contextFiles,
            })
            checkLastMessage(lastMessage)
            checkNoFiles(lastMessage)
            expect(lastMessage?.text?.toLocaleLowerCase() ?? '').includes('sourcegraph')
        }, 10_000)
    })

    describe('Questions about knowledge base', () => {
        it.skip('What code do you have access to?', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                'What code do you have access to?'
            )
            checkLastMessage(lastMessage)
        }, 10_000)

        it.skip('What does this repo do?', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat('What does this repo do?')
            checkLastMessage(lastMessage)
        }, 10_000)
    })

    describe('Poor context provided', () => {
        it.skip('No context', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                "What's the license of this repo?",
                { addEnhancedContext: false, contextFiles: [] }
            )
            checkLastMessage(lastMessage)
            checkNoFiles(lastMessage)
        }, 10_000)

        it('Relevant file missing', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                "Where's the Zoekt indexing logic?",
                { addEnhancedContext: false, contextFiles: contextFiles }
            )
            checkLastMessage(lastMessage)
            checkFilesExist(lastMessage, contextFiles)
        }, 10_000)

        it('Relevant section missing from file', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                'What how does NewDisplayTruncator work in @limit.go?',
                { addEnhancedContext: false, contextFiles: contextFiles }
            )
            checkLastMessage(lastMessage)
            checkFilesExist(lastMessage, contextFiles)
            checkSymbolsExist(lastMessage, contextFiles)
        }, 10_000)
    })

    describe('Good context provided', () => {
        it('Relevant file section provided', async () => {
            const lastMessage = await client.sendSingleMessageToNewChat(
                'Where does Zoekt trim the list of files?',
                { addEnhancedContext: false, contextFiles: contextFiles }
            )

            checkLastMessage(lastMessage)
            checkFilesExist(lastMessage, contextFiles)
            checkSymbolsExist(lastMessage, contextFiles)
        }, 10_000)
    })

    afterAll(async () => {
        await workspace.afterAll()
        await client.shutdownAndExit()
        // Long timeout because to allow Polly.js to persist HTTP recordings
    }, 30_000)
})

function checkLastMessage(lastMessage: SerializedChatMessage | undefined) {
    expect(lastMessage?.speaker).toBe('assistant')
    expect(lastMessage?.text).not.toBeUndefined()
    expect(lastMessage?.text ?? '').not.toMatch(characterCheck)
    expect(lastMessage?.text ?? '').not.toMatch(hedgingCheck)
}

function checkNoFiles(lastMessage: SerializedChatMessage | undefined) {
    return checkFilesExist(lastMessage, [])
}

function checkFilesExist(lastMessage: SerializedChatMessage | undefined, contextFiles: ContextItem[]) {
    const filenameRegex = /\b`(\w+\.\w+)`\b/g
    const files = lastMessage?.text?.match(filenameRegex) ?? []
    const contextFilePaths = new Set(contextFiles.map(file => file.uri.path))
    for (const file of files) {
        expect(contextFilePaths.has(file), `file ${file} does not exist in context`).toBe(true)
    }
}

function checkSymbolsExist(lastMessage: SerializedChatMessage | undefined, contextFiles: ContextItem[]) {
    const symbolRegexp = /\b\w*[a-z][A-Z_]\w*\b/
    const symbols = lastMessage?.text?.match(symbolRegexp) ?? []
    for (const symbol of symbols) {
        let found = false
        for (const contextFile of contextFiles) {
            if (contextFile.content?.includes(symbol)) {
                found = true
                break
            }
        }
        expect(found, `symbol ${symbol} does not exist in context`).toBe(true)
    }
}

const contextFiles: ContextItem[] = [
    {
        uri: workspace.file('README.md'),
        type: 'file',
        content:
            '  "Zoekt, en gij zult spinazie eten" - Jan Eertink\n' +
            '\n' +
            '    ("seek, and ye shall eat spinach" - My primary school teacher)\n' +
            '\n' +
            'This is a fast text search engine, intended for use with source\n' +
            'code. (Pronunciation: roughly as you would pronounce "zooked" in English)\n' +
            '\n' +
            '**Note:** This is a [Sourcegraph](https://github.com/sourcegraph/zoekt) fork\n' +
            'of [github.com/google/zoekt](https://github.com/google/zoekt). It is now the\n' +
            'main maintained source of Zoekt.',
    },
    {
        uri: workspace.file('limit.go'),
        type: 'file',
        content:
            'package zoekt\n' +
            '\n' +
            'import "log"\n' +
            '\n' +
            '// SortAndTruncateFiles is a convenience around SortFiles and\n' +
            '// DisplayTruncator. Given an aggregated files it will sort and then truncate\n' +
            '// based on the search options.\n' +
            'func SortAndTruncateFiles(files []FileMatch, opts *SearchOptions) []FileMatch {\n' +
            '\tSortFiles(files)\n' +
            '\ttruncator, _ := NewDisplayTruncator(opts)\n' +
            '\tfiles, _ = truncator(files)\n' +
            '\treturn files\n' +
            '}',
    },
]
