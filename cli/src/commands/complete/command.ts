import { readFileSync } from 'node:fs'
import { cwd } from 'process'

import { Command } from 'commander'

import { Client, getClient } from '../../client'
import { GlobalOptions } from '../../program'

interface CompleteOptions {
    diffFile?: string
    otherCommits: boolean
    dryRun: boolean
    all: boolean
}

export const completeCommand = new Command('complete')
    .description('Complete code in a file at a cursor location. Expects CompleteRequest data on stdin.')
    .action(async (options, program: Command) =>
        console.log(
            JSON.stringify(
                await run(
                    options,
                    {
                        cwd: cwd(),
                        stdin: readFileSync(process.stdin.fd, 'utf-8'),
                        client: await getClient(program.optsWithGlobals<GlobalOptions>()),
                    },
                    program.optsWithGlobals<GlobalOptions>()
                ),
                null,
                2
            )
        )
    )

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
}

export async function run(
    options: CompleteOptions,
    { cwd, stdin, client }: CompleteEnvironment,
    globalOptions: Pick<GlobalOptions, 'debug'>
): Promise<CompleteResponse> {
    return {
        items: [
            {
                text: 'n.map(n => n * 2)',
                fileContent: '/** multiply nums by 2 */\nfunction times2() {\n  return n.map(n => n*2)\n}',
                range: {
                    start: { line: 1, character: 10 },
                    end: { line: 1, character: 23 },
                },
            },
        ],
    }
}
