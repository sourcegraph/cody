import { readFileSync } from 'node:fs'
import { cwd } from 'process'

import { Command } from 'commander'
import { TextDocument } from 'vscode-languageserver-textdocument'

import { AutocompleteItem, AutocompleteResult } from '@sourcegraph/cody-agent/src/protocol'

import { Client, getClient } from '../../client'
import { GlobalOptions } from '../../program'

import { codyAgentComplete } from './agent'

interface CompleteOptions {}

export const completeCommand = new Command('complete')
    .description('Complete code in a file at a cursor location. Expects CompleteRequest data on stdin.')
    .action(async (options, program: Command) => {
        try {
            const result = await run(
                options,
                {
                    cwd: cwd(),
                    stdin: readFileSync(process.stdin.fd, 'utf-8'),
                    client: await getClient(program.optsWithGlobals<GlobalOptions>()),
                },
                program.optsWithGlobals<GlobalOptions>()
            )
            console.log(JSON.stringify(result, null, 2))
        } catch (error) {
            console.error('Error:', error)
            process.exit(1)
        }
    })

interface CompleteEnvironment {
    cwd: string

    /** Full text of stdin. */
    stdin: string

    client: Client | GlobalOptions
}

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

export async function run(
    options: CompleteOptions,
    { cwd, stdin, client }: CompleteEnvironment,
    globalOptions: Pick<GlobalOptions, 'debug'>
): Promise<CompleteResponse> {
    const request = JSON.parse(stdin) as CompleteRequest
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

function fileContentWithInsertText(content: string, item: AutocompleteItem): string {
    const doc = TextDocument.create('file:///tmp.txt', 'typescript', 1, content)
    return TextDocument.applyEdits(doc, [{ newText: item.insertText, range: item.range }])
}
