import { Command } from 'commander'
import * as vscode from 'vscode'
import { activate } from '../../../vscode/src/extension.node'
import { newEmbeddedAgentClient } from '../agent'

interface ChatOptions {
    endpoint: string
    accessToken: string
    message: string
    dir: string
    model?: string
    contextRepo?: string[]
    showContext: boolean
    debug: boolean
}

export const chatCommand = new Command('chat')
    .description('Chat with codebase context')
    .requiredOption('-m, --message <message>', 'Message to send')
    .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
    .option('--model <model>', 'Chat model to use')
    .option('--context-repo <repos...>', 'Names of repositories to use as context')
    .option('--show-context', 'Show context items in reply', false)
    .option('--debug', 'Enable debug logging', false)
    .action(chatAction)
export const cliCommand = new Command('experimental-cli').addCommand(chatCommand)

export async function chatAction(options: ChatOptions): Promise<void> {
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

    if (options.contextRepo && options.contextRepo.length > 0) {
        const { repos } = await client.request('graphql/getRepoIds', {
            names: options.contextRepo,
            first: options.contextRepo.length,
        })
        await client.request('webview/receiveMessage', {
            id,
            message: {
                command: 'context/choose-remote-search-repo',
                explicitRepos: repos,
            },
        })
    }

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
