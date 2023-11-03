import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

import { Command } from 'commander'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { Agent } from '@sourcegraph/cody-agent/src/agent'
import { AutocompleteItem, AutocompleteParams, AutocompleteResult } from '@sourcegraph/cody-agent/src/protocol-alias'

interface CompleteOptions {
    stream: boolean
}

export const completeCommand = new Command('complete')
    .description('EXPERIMENTAL: Complete code in a file at a cursor location. Expects CompleteRequest data on stdin.')
    .option('--stream', 'Stream completion requests and responses (JSON lines)')
    .action(async (options: CompleteOptions) => {
        const completeAndPrint = async (input: string): Promise<void> => {
            const result = await run(JSON.parse(input) as CompleteRequest)
            console.log(JSON.stringify(result, null, 2))
        }
        try {
            if (options.stream) {
                const rl = createInterface({
                    input: process.stdin,
                    terminal: false,
                })
                for await (const line of rl) {
                    await completeAndPrint(line)
                }
            } else {
                const input = readFileSync(process.stdin.fd, 'utf-8')
                await completeAndPrint(input)
            }
        } catch (error) {
            console.error('Error:', error)
            process.exit(1)
        }
    })

interface CompleteRequest {
    uri: string
    content: string
    position: { line: number; character: number }
}

interface CompleteResponse {
    items: {
        text: string
        fileContent: string
        range: { start: { line: number; character: number }; end: { line: number; character: number } }
    }[]
    completionEvent?: AutocompleteResult['completionEvent']
}

async function run(request: CompleteRequest): Promise<CompleteResponse> {
    const result = await codyAgentComplete({
        filePath: request.uri.replace(/^file:\/\//, ''),
        content: request.content,
        position: request.position,
    })
    return {
        items: result.items.map(item => ({
            text: item.insertText,
            range: item.range,
            fileContent: fileContentWithInsertText(request.content, item),
        })),
        completionEvent: result.completionEvent,
    }
}

interface CodyAgentCompleteParams {
    filePath: string
    content: string
    position: AutocompleteParams['position']
}

async function codyAgentComplete({
    filePath,
    content,
    position,
}: CodyAgentCompleteParams): Promise<AutocompleteResult> {
    const agent = new Agent()
    const client = agent.clientForThisInstance()
    await client.request('initialize', {
        name: 'cody-cli',
        version: '0.0.1',
        workspaceRootUri: '',
        extensionConfiguration: {
            accessToken: process.env.SRC_ACCESS_TOKEN ?? 'invalid',
            serverEndpoint: process.env.SRC_ENDPOINT ?? 'invalid',
            customHeaders: {},
        },
    })
    client.notify('initialized', null)
    client.notify('textDocument/didOpen', { filePath, content })
    return client.request('autocomplete/execute', {
        filePath,
        position,
        triggerKind: 'Invoke',
    })
}

function fileContentWithInsertText(content: string, item: AutocompleteItem): string {
    const doc = TextDocument.create('', 'typescript', 1, content)
    return TextDocument.applyEdits(doc, [{ newText: item.insertText, range: item.range }])
}
