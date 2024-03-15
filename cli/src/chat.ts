import { join, resolve } from 'node:path'
import { Command } from 'commander'
import { createAgentClient } from './agentClient'

export const chatCommand = new Command('chat')
    .description('Chat with codebase context')
    .requiredOption('-m, --message <message>', 'Message to send')
    .option(
        '--endpoint',
        'Sourcegraph URL (SRC_ENDPOINT env var)',
        process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com'
    )
    .option(
        '--access-token',
        'Sourcegraph access token (SRC_ACCESS_TOKEN env var)',
        process.env.SRC_ACCESS_TOKEN ?? ''
    )
    .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
    .option('--model <model>', 'Chat model to use')
    .option('--context-repo <repos...>', 'Names of repositories to use as context')
    .option('--show-context', 'Show context items in reply', false)
    .option(
        '--agent-path <path>',
        'Path to the cody-agent script',
        join(__dirname, '..', '..', 'agent', 'dist', 'index.js')
    )
    .option('--debug', 'Enable debug logging', false)
    .action(
        async (options: {
            endpoint: string
            accessToken: string
            message: string
            dir: string
            model?: string
            contextRepo?: string[]
            showContext: boolean
            agentPath: string
            debug: boolean
        }) => {
            const client = await createAgentClient({
                serverEndpoint: options.endpoint,
                accessToken: options.accessToken,
                workspaceRootUri: `file://${resolve(options.dir)}`,
                agentPath: options.agentPath,
                debug: options.debug,
            })
            const { text, contextFiles } = await client.chat(options.message, {
                model: options.model,
                contextRepositoryNames: options.contextRepo,
            })
            if (options.showContext) {
                console.log('> Context items:')
                for (const [i, item] of contextFiles.entries()) {
                    console.log(`> ${i + 1}. ${item}`)
                }
                console.log()
            }
            console.log(text)
            client.dispose()
        }
    )
