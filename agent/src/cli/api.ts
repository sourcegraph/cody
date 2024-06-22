import { Command } from 'commander'
import * as vscode from 'vscode'
import { activate } from '../../../vscode/src/extension.node'
import { newEmbeddedAgentClient } from '../agent'

interface ApiOptions {
    endpoint: string
    accessToken: string
    message: string
    dir: string
    model?: string
    contextRepo?: string[]
    showContext: boolean
    debug: boolean
}
export const apiCommand = new Command('experimental-api')
    .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
    .option('--model <model>', 'Chat model to use')
    .option('--context-repo <repos...>', 'Names of repositories to use as context')
    .option('--show-context', 'Show context items in reply', false)
    .option('--debug', 'Enable debug logging', false)
    .action(apiAction)

export async function apiAction(options: ApiOptions): Promise<void> {
    const agent = await newEmbeddedAgentClient(
        {
            name: 'experimental-api',
            version: '0.1.0',
            workspaceRootUri: vscode.Uri.file(options.dir).toString(),
        },
        activate
    )
    const client = agent.clientForThisInstance()
    const id = await client.request('chat/new', null)

    if (options.model) {
        await client.request('webview/receiveMessage', {
            id,
            message: {
                command: 'chatModel',
                model: options.model,
            },
        })
    }

    const result = await client.request('chat/submitMessage', {
        id,
        message: {
            command: 'submit',
            submitType: 'user',
            text: options.message,
            contextFiles: [],
            addEnhancedContext: true,
        },
    })
    if (result.type === 'transcript') {
        const reply = result.messages.at(-1)
        if (reply?.text) {
            console.log(reply?.text)
        } else if (reply?.error) {
            console.error(reply.error)
        } else {
            throw new Error(`unexpected reply: ${JSON.stringify(reply)}`)
        }
    }
}
