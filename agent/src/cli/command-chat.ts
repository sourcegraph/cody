import ora, { spinners } from 'ora'

import path from 'node:path'

import type { Polly } from '@pollyjs/core'
import { type ContextItem, ModelUsage, TokenCounter } from '@sourcegraph/cody-shared'
import { Command } from 'commander'

import * as vscode from 'vscode'
import { activate } from '../../../vscode/src/extension.node'
import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import packageJson from '../../package.json'
import { newEmbeddedAgentClient } from '../agent'
import type { ClientInfo } from '../protocol-alias'
import { Streams } from './Streams'
import { AuthenticatedAccount } from './command-auth/AuthenticatedAccount'
import { notLoggedIn } from './command-auth/messages'

declare const process: { pkg: { entrypoint: string } } & NodeJS.Process
export interface ChatOptions {
    endpoint: string
    accessToken: string
    message: string
    dir: string
    model?: string
    contextRepo?: string[]
    contextFile?: string[]
    showContext: boolean
    debug: boolean
    silent: boolean
    isTesting?: boolean
    streams?: Streams
}

export const chatCommand = () =>
    new Command('chat')
        .description('Chat with codebase context')
        .requiredOption('-m, --message <message>', 'Message to send')
        .option(
            '--endpoint',
            'Sourcegraph instance URL',
            process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com'
        )
        .option(
            '--access-token',
            'Sourcegraph access token. ' + loginInstruction,
            process.env.SRC_ACCESS_TOKEN ?? ''
        )
        .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
        .option('--model <model>', 'Chat model to use')
        .option(
            '--context-repo <repos...>',
            '(Sourcegraph Enterprise only) Names of repositories to use as context. Example: github.com/sourcegraph/cody.'
        )
        .option('--context-file <files...>', 'Local files to include in the context')
        .option('--show-context', 'Show context items in reply', false)
        .option('--silent', 'Disable streaming reply', false)
        .option('--debug', 'Enable debug logging', false)
        .action(async (options: ChatOptions) => {
            if (!options.accessToken) {
                const spinner = ora().start('Loading access token')
                const account = await AuthenticatedAccount.fromUserSettings(spinner)
                if (!spinner.isSpinning) {
                    process.exit(1)
                }
                spinner.stop()
                if (account) {
                    options.accessToken = account.accessToken
                    options.endpoint = account.serverEndpoint
                }
            }
            let polly: Polly | undefined
            if (process.env.CODY_RECORDING_DIRECTORY && process.env.CODY_RECORDING_NAME) {
                polly = startPollyRecording({
                    recordingName: process.env.CODY_RECORDING_NAME,
                    recordingDirectory: process.env.CODY_RECORDING_DIRECTORY,
                })
            }
            let exitCode = 0
            try {
                exitCode = await chatAction(options)
            } finally {
                await polly?.stop()
            }
            process.exit(exitCode)
        })

const loginInstruction = 'Sign in with the command: cody auth login --web'

export async function chatAction(options: ChatOptions): Promise<number> {
    const streams = options.streams ?? Streams.default()
    const spinner = ora({
        spinner: spinners.fistBump,
        isSilent: options.silent,
        stream: streams.stderr,
    }).start()
    const workspaceRootUri = vscode.Uri.file(path.resolve(options.dir))
    const clientInfo: ClientInfo = {
        name: 'cody-cli',
        version: options.isTesting ? '0.1.0-SNAPSHOT' : packageJson.version,
        workspaceRootUri: workspaceRootUri.toString(),
        extensionConfiguration: {
            serverEndpoint: options.endpoint,
            accessToken: options.accessToken,
            customHeaders: {},
            customConfiguration: {
                'cody.experimental.symf.enabled': false,
                'cody.experimental.telemetry.enabled': options.isTesting ? false : undefined,
            },
        },
    }
    spinner.text = 'Initializing...'
    const { serverInfo, client, messageHandler } = await newEmbeddedAgentClient(clientInfo, activate)
    const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })

    messageHandler.registerNotification('webview/postMessage', message => {
        if (message.message.type === 'transcript') {
            const lastMessage = message.message.messages.at(-1)
            if (lastMessage?.model && !spinner.text.startsWith('Model')) {
                const modelName =
                    models.find(model => model.model === lastMessage.model)?.title ?? lastMessage.model
                spinner.text = modelName
                spinner.spinner = spinners.dots
            }
            spinner.prefixText = (lastMessage?.text ?? '') + '\n'
        }
    })

    if (!serverInfo.authStatus?.isLoggedIn) {
        notLoggedIn(spinner)
        return 1
    }

    spinner.text = 'Asking Cody...'
    const id = await client.request('chat/new', null)

    if (options.model) {
        void client.request('webview/receiveMessage', {
            id,
            message: {
                command: 'chatModel',
                model: options.model,
            },
        })
    }

    if (options.contextRepo && options.contextRepo.length > 0) {
        if (serverInfo.authStatus?.isDotCom) {
            spinner.fail(
                'The --context-repo option is only available for Sourcegraph Enterprise users. ' +
                    'Please sign into an Enterprise instance with the command: cody auth logout && cody auth login --web'
            )
            return 1
        }
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

    const contextFiles: ContextItem[] = []
    for (const relativeOrAbsolutePath of options.contextFile ?? []) {
        contextFiles.push({
            type: 'file',
            uri: toUri(options.dir, relativeOrAbsolutePath),
        })
    }
    const start = performance.now()
    const response = await client.request('chat/submitMessage', {
        id,
        message: {
            command: 'submit',
            submitType: 'user',
            text: options.message,
            contextFiles,
            addEnhancedContext: false,
        },
    })

    if (response.type !== 'transcript') {
        spinner.fail(
            `Unexpected chat reply. Expected type "transcript", got "${response.type}"` +
                JSON.stringify(response, null, 2)
        )
        return 1
    }

    const reply = response.messages.at(-1)
    if (!reply) {
        spinner.fail(
            'Unexpected chat reply. Expected non-empty messages, got' + JSON.stringify(response, null, 2)
        )
        return 1
    }

    if (reply.error) {
        spinner.fail(`Unexpected error: ${JSON.stringify(reply, null, 2)}`)
        return 1
    }

    spinner.spinner = spinners.triangle
    spinner.prefixText = ''
    const elapsed = performance.now() - start
    const replyText = reply.text ?? ''
    const tokens = TokenCounter.encode(replyText).length
    const tokensPerSecond = tokens / (elapsed / 1000)
    spinner.text = spinner.text.trim() + ` (${Math.round(tokensPerSecond)} tokens/second)`
    spinner.clear()

    if (options.showContext) {
        const contextFiles = reply.contextFiles ?? []
        streams.log('> Context items:\n')
        for (const [i, item] of contextFiles.entries()) {
            streams.log(`> ${i + 1}. ${item.uri.fsPath}\n`)
        }
        streams.log('\n')
    }
    streams.log(replyText + '\n')
    await client.request('shutdown', null)
    spinner.succeed()
    return 0
}

function toUri(dir: string, relativeOrAbsolutePath: string): vscode.Uri {
    const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.resolve(dir, relativeOrAbsolutePath)
    return vscode.Uri.file(absolutePath)
}
