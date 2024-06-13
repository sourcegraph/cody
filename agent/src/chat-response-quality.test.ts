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
            // Should fail when the following replies are given:
            // * anthropic/claude-3-sonnet: "...I do not have access to any specific code files."
            // * anthropic/claude-3-haiku: "I'm afraid I don't have direct access to any code in this case"
            it('What code do you have access to?', async () => {
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

            it('describe my code', async () => {
                const lastMessage = await sendMessage(client, modelString, 'describe my code', {
                    addEnhancedContext: false,
                    contextFiles: [readmeItem, evalItem, externalServicesItem, limitItem],
                })
                checkAccess(lastMessage)
            }, 10_000)

            // Should fail when the following replies are given:
            // * anthropic/claude-3-haiku: "I don't have access to any code you've written. I'm Claude, an AI assistant..."
            // * openai/gpt-3.5-turbo: "I apologize for the misunderstanding, but as an AI developed by Sourcegraph ..."
            it('@zoekt describe my code', async () => {
                const lastMessage = await sendMessage(client, modelString, '@zoekt describe my code.', {
                    addEnhancedContext: false,
                    contextFiles: mockEnhancedContext,
                })

                // TODO: openai/gpt-3.5-turbo currently fails, switch to openai/gpt-4-turbo in these tests
                if (modelString !== 'openai/gpt-3.5-turbo') {
                    checkAccess(lastMessage)
                }
            }, 15_000)

            // Should fail when the following replies are given:
            // * openai/gpt-3.5-turbo: "I cannot directly assess the cleanliness of your codebase as an AI assistant"
            it('Is my codebase clean?', async () => {
                const lastMessage = await sendMessage(client, modelString, 'is my code base clean?', {
                    addEnhancedContext: false,
                    contextFiles: mockEnhancedContext,
                })
                checkAccess(lastMessage)
            }, 15_000)

            it('What does directory watcher do?', async () => {
                const contextFiles = [readmeItem]
                mockEnhancedContext.map(item => contextFiles.push(item))
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'What does directory watcher do?',
                    {
                        addEnhancedContext: false,
                        contextFiles: contextFiles,
                    }
                )
                checkAccess(lastMessage)
                checkAllowedFiles(lastMessage, [], ['shards/watcher.go'])
            }, 15_000)

            it('where do we test the grpc chunker', async () => {
                const contextFiles = [readmeItem]
                mockEnhancedContext.map(item => contextFiles.push(item))
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'where do we test the grpc chunker',
                    {
                        addEnhancedContext: false,
                        contextFiles: contextFiles,
                    }
                )
                checkAccess(lastMessage)
                checkAllowedFiles(lastMessage, [readmeItem], ['grpc/chunk/chunker_test.go'])
            }, 15_000)

            // Should fail when the following replies are given:
            // * anthropic/claude-3-haiku: "I'm an AI assistant created by Anthropic to be helpful..."
            // * openai/gpt-3.5-turbo: "I'm sorry, but I am an AI coding assistant..."
            it('Are you capable of upgrading my pytorch version', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Are you capable of upgrading my pytorch version to 1.0.0, there is a guide in the pytorch site',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )
                // TODO: openai/gpt-3.5-turbo currently fails, switch to openai/gpt-4-turbo in these tests
                if (modelString !== 'openai/gpt-3.5-turbo') {
                    checkAccess(lastMessage)
                }
            }, 10_000)

            it('Can you look through the files?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Can you look through the files and identify the conflicting packages that may be causing this?',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )
                checkAccess(lastMessage)
            }, 10_000)

            it('Mind taking a second look at the file?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Mind taking a second look at the file? @limit.go',
                    {
                        addEnhancedContext: false,
                        contextFiles: [readmeItem, limitItem, evalItem, externalServicesItem],
                    }
                )
                checkAccess(lastMessage)
                expect(lastMessage?.text).not.toMatch(requestMoreContext)
            }, 15_000)

            // Should fail when the following replies are given:
            // * openai/gpt-3.5-turbo: "The project likely uses the MIT license because..."
            it('Why does this project use the MIT license?', async () => {
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Why does this project use the MIT license?',
                    { addEnhancedContext: false, contextFiles: [readmeItem, limitItem] }
                )

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
                checkAllowedFiles(lastMessage, contextFiles, [])
            }, 10_000)

            // Should fail when the following replies are given:
            // * anthropic/claude-3-haiku: "'Certainly! The `agent.go` ..."
            it('Explain the logic in src/agent.go', async () => {
                const contextFiles = [readmeItem]
                mockEnhancedContext.map(item => contextFiles.push(item))
                const lastMessage = await sendMessage(
                    client,
                    modelString,
                    'Explain the logic in src/agent.go, particularly how agents interact with ranking',
                    { addEnhancedContext: false, contextFiles: contextFiles }
                )

                // Don't check access, because this file does not exist in the context.
                // Check it doesn't hallucinate
                expect(lastMessage?.text).not.includes('Certainly!')
                expect(lastMessage?.text).not.includes("Sure, let's")
                // Should ask for additional (relevant) context.
                expect(lastMessage?.text).toMatch(requestMoreContext)
            }, 15_000)

            it('simple multi-turn chat', async () => {
                const id = await client.request('chat/new', null)
                await client.setChatModel(id, modelString)

                const firstResponse = await client.sendMessage(id, 'explain @README.md', {
                    addEnhancedContext: false,
                    contextFiles: [readmeItem],
                })
                checkAccess(firstResponse)

                const secondResponse = await client.sendMessage(id, 'what does @limit.go do?', {
                    addEnhancedContext: false,
                    contextFiles: [limitItem],
                })
                checkAccess(secondResponse)
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
    /I (don't|do not) (actually )?have (direct )?access|your actual codebase|can't browse external repositories|not able to access external information|unable to browse through|directly access|direct access|snippet you provided is incomplete|As an AI|I can't review/i
const requestMoreContext =
    /(can|could) (you )?provide|to provide me|Please provide|(contain|provide) (enough |additional )?context|Without the (relevant )?code/i

function checkAccess(lastMessage: SerializedChatMessage | undefined) {
    console.log(lastMessage)
    expect(lastMessage?.speaker).toBe('assistant')
    expect(lastMessage?.text).not.toBeUndefined()
    expect(lastMessage?.text ?? '').not.toMatch(accessCheck)
}

function checkAllowedFiles(
    lastMessage: SerializedChatMessage | undefined,
    contextItems: ContextItem[],
    fileNames: string[]
) {
    console.log(lastMessage)
    const filenameRegex = /\b(\w+\.(go|js|md|ts))\b/g
    const files = lastMessage?.text?.match(filenameRegex) ?? []

    const allowedFiles = contextItems.map(file => file.uri.path)
    fileNames.map(file => allowedFiles.push(file))

    for (const file of files) {
        let found = false
        for (const allowedFile of allowedFiles) {
            if (allowedFile.endsWith(file)) {
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
    const decoder = new TextDecoder('utf-8')
    const content = decoder.decode(buffer)

    return {
        uri,
        type: 'file',
        content: content,
    }
}

// We can't use `addEnhancedContext: true` in these tests, because symf may return
// non-deterministic result sets. Instead, we pass a fake list of code snippets that
// resembles enhanced context.
const mockEnhancedContext: ContextItem[] = [
    {
        uri: workspace.file('README.md'),
        type: 'file',
        content: '## Readme\n\nThis is a readme',
    },
    {
        uri: workspace.file('limit.go'),
        type: 'file',
        content:
            '```go\n' +
            '//\n' +
            '//                   func SortAndTruncateFiles(files []FileMatch, opts *SearchOptions) []FileMatch {\n' +
            '//                   \tSortFiles(files)\n' +
            '//                   \ttruncator, _ := NewDisplayTruncator(opts)\n' +
            '//                   \tfiles, _ = truncator(files)\n' +
            '//                   \treturn files\n' +
            '//                   ```',
    },
    {
        uri: workspace.file('vscode/src/agent.go'),
        type: 'file',
        content: 'package agent\n\n// Agent is an agent',
    },
    {
        uri: workspace.file('vscode/src/external-services.ts'),
        type: 'file',
        content: '',
    },
    {
        uri: workspace.file('shards/watcher.go'),
        type: 'file',
        content:
            '```go\n' +
            '//\n' +
            '//                   type DirectoryWatcher struct {\n' +
            '//                   \tdir        string\n' +
            '//                   \ttimestamps map[string]time.Time\n' +
            '//                   \tloader     shardLoader\n' +
            '//\n' +
            '//                   \t// closed once ready\n' +
            '//                   \tready    chan struct{}\n' +
            '//                   \treadyErr error\n' +
            '//\n' +
            '//                   \tcloseOnce sync.Once\n' +
            '//                   \t// quit is closed by Close to signal the directory watcher to stop.\n' +
            '//                   \tquit chan struct{}\n' +
            '//                   \t// stopped is closed once the directory watcher has stopped.\n' +
            '//                   \tstopped chan struct{}\n' +
            '//                   ```',
    },
    {
        uri: workspace.file('shards/watcher.go'),
        type: 'file',
        content:
            '   func newDirectoryWatcher(dir string, loader shardLoader) (*DirectoryWatcher, error) {\n' +
            '//                   \tsw := &DirectoryWatcher{\n' +
            '//                   \t\tdir:        dir,\n' +
            '//                   \t\ttimestamps: map[string]time.Time{},\n' +
            '//                   \t\tloader:     loader,\n' +
            '//                   \t\tready:      make(chan struct{}),\n' +
            '//                   \t\tquit:       make(chan struct{}),\n' +
            '//                   \t\tstopped:    make(chan struct{}),\n' +
            '//                   \t}\n' +
            '//\n' +
            '//                   \tgo func() {\n' +
            '//                   \t\tdefer close(sw.ready)\n' +
            '//\n' +
            '//                   \t\tif err := sw.scan(); err != nil {\n' +
            '//                   \t\t\tsw.readyErr = err\n' +
            '//                   \t\t\treturn\n' +
            '//                   \t\t}\n' +
            '//\n' +
            '//                   \t\tif err := sw.watch(); err != nil {\n' +
            '//                   \t\t\tsw.readyErr = err\n' +
            '//                   \t\t\treturn\n' +
            '//                   \t\t}\n' +
            '//                   \t}()\n' +
            '//\n' +
            '//                   \treturn sw, nil',
    },
    {
        uri: workspace.file('grpc/chunk/chunker_test.go'),
        type: 'file',
        content:
            ' ```go\n' +
            '                  type server struct {\n' +
            '                  \tgrpc_testing.UnimplementedTestServiceServer\n' +
            '                  ```',
    },
    {
        uri: workspace.file('grpc/chunk/chunker_test.go'),
        type: 'file',
        content:
            ' ```go\n' +
            '\n' +
            '                  func TestChunkerE2E(t *testing.T) {\n' +
            '                  \tfor _, test := range []struct {\n' +
            '                  \t\tname string\n' +
            '\n' +
            '                  \t\tinputSizeBytes       int\n' +
            '                  \t\texpectedMessageCount int\n' +
            '                  \t}{\n' +
            '                  \t\t{\n' +
            '                  \t\t\tname: "normal",\n' +
            '\n' +
            '                  \t\t\tinputSizeBytes:       int(3.5 * maxMessageSize),\n' +
            '                  \t\t\texpectedMessageCount: 4,\n' +
            '                  \t\t},\n' +
            '                  \t\t{\n' +
            '                  \t\t\tname:                 "empty payload",\n' +
            '                  \t\t\tinputSizeBytes:       0,\n' +
            '                  \t\t\texpectedMessageCount: 1,\n' +
            '                  \t\t},\n' +
            '                  \t} {\n' +
            '                  \t\tt.Run(test.name, func(t *testing.T) {\n' +
            '                  \t\t\ts := &server{}\n' +
            '                  \t\t\tsrv, serverSocketPath := runServer(t, s)\n' +
            '                  \t\t\tt.Cleanup(func() {\n' +
            '                  \t\t\t\tsrv.Stop()\n' +
            '                  \t\t\t})\n' +
            '\n' +
            '                  \t\t\tclient, conn := newClient(t, serverSocketPath)\n' +
            '                  \t\t\tt.Cleanup(func() {\n' +
            '                  \t\t\t\t_ = conn.Close()\n' +
            '                  \t\t\t})\n' +
            '\n' +
            '                  \t\t\tctx := context.Background()\n' +
            '\n' +
            '                  \t\t\tstream, err := client.StreamingOutputCall(ctx, &grpc_testing.StreamingOutputCallRequest{\n' +
            '                  \t\t\t\tPayload: &grpc_testing.Payload{\n' +
            '                  \t\t\t\t\tBody: []byte(strconv.FormatInt(int64(test.inputSizeBytes), 10)),\n' +
            '                  \t\t\t\t},\n' +
            '                  \t\t\t})\n' +
            '\n' +
            '                  \t\t\trequire.NoError(t, err)\n' +
            '\n' +
            '                  \t\t\tmessageCount := 0\n' +
            '                  \t\t\tvar receivedPayload []byte\n' +
            '                  \t\t\tfor {\n' +
            '                  \t\t\t\tresp, err := stream.Recv()\n' +
            '                  \t\t\t\tif errors.Is(err, io.EOF) {\n' +
            '                  \t\t\t\t\tbreak\n' +
            '                  \t\t\t\t}\n' +
            '\n' +
            '                  \t\t\t\tif err != nil {\n' +
            '                  \t\t\t\t\tt.Fatal(err)\n' +
            '                  \t\t\t\t}\n' +
            '\n' +
            '                  \t\t\t\tmessageCount++\n' +
            '                  \t\t\t\treceivedPayload = append(receivedPayload, resp.GetPayload().GetBody()...)\n' +
            '\n' +
            '                  \t\t\t\trequire.Less(t, proto.Size(resp), maxMessageSize)\n' +
            '                  \t\t\t}\n' +
            '\n' +
            '                  \t\t\trequire.Equal(t, test.expectedMessageCount, messageCount)\n' +
            '\n' +
            '                  \t\t\treceivedPayloadSizeBytes := len(receivedPayload)\n' +
            '\n' +
            '                  \t\t\texpectedSizeBytes := test.inputSizeBytes\n' +
            '\n' +
            '                  \t\t\tif receivedPayloadSizeBytes != expectedSizeBytes {\n' +
            '                  \t\t\t\tt.Fatalf("input payload size is not %d bytes (~ %q), got size: %d (~ %q)",\n' +
            '                  \t\t\t\t\texpectedSizeBytes, humanize.Bytes(uint64(expectedSizeBytes)),\n' +
            '                  \t\t\t\t\treceivedPayloadSizeBytes, humanize.Bytes(uint64(receivedPayloadSizeBytes)),\n' +
            '                  \t\t\t\t)\n' +
            '                  \t\t\t}\n' +
            '                  \t\t})\n' +
            '                  \t}\n' +
            '                  ```',
    },
]
