import path from 'node:path'
import type { Polly } from '@pollyjs/core'
import type { ContextItem } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import * as vscode from 'vscode'
import { activate } from '../../../vscode/src/extension.node'
import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import packageJson from '../../package.json'
import { type InitializedClient, newAgentClient, newEmbeddedAgentClient } from '../agent'
import type { ClientInfo } from '../protocol-alias'
import { Streams } from './Streams'

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
    clientKind?: 'embedded' | 'ipc'
    isTesting?: boolean
    streams: Streams
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
            'Sourcegraph access token. ' + createAccessTokenInstruction,
            process.env.SRC_ACCESS_TOKEN ?? ''
        )
        .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
        .option('--model <model>', 'Chat model to use')
        .option(
            '--context-repo <repos...>',
            'Names of repositories to use as context. Example: github.com/sourcegraph/cody'
        )
        .option('--context-file <files...>', 'Local files to include in the context')
        .option('--show-context', 'Show context items in reply', false)
        .option('--debug', 'Enable debug logging', false)
        .action(async (options: ChatOptions) => {
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
const createAccessTokenInstruction =
    'Create a new access token at https://sourcegraph.com/user/settings/tokens/new'
function newClient(options: ChatOptions): Promise<InitializedClient> {
    const workspaceRootUri = vscode.Uri.file(path.resolve(options.dir))
    const clientInfo: ClientInfo = {
        name: 'cody-cli',
        version: packageJson.version,
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
    if (options.clientKind === 'ipc') {
        return newAgentClient({ ...clientInfo, inheritStderr: options.debug })
    }
    return newEmbeddedAgentClient(clientInfo, activate)
}

export async function chatAction(options: ChatOptions): Promise<number> {
    const streams = options.streams ?? Streams.default()
    const { serverInfo, client } = await newClient(options)
    if (!serverInfo.authStatus?.isLoggedIn) {
        streams.error(
            'not logged in. To fix this problem, set the SRC_ACCESS_TOKEN environment ' +
                'variable to an access token. ' +
                createAccessTokenInstruction
        )
        return 1
    }

    const { panelID: id } = await client.request('chat/new', null)

    if (options.model) {
        await client.request('webview/receiveMessage', {
            id,
            message: {
                command: 'chatModel',
                model: options.model,
            },
        })
    }

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

    const contextFiles: ContextItem[] = []
    for (const relativeOrAbsolutePath of options.contextFile ?? []) {
        contextFiles.push({
            type: 'file',
            uri: toUri(options.dir, relativeOrAbsolutePath),
        })
    }
    const response = await client.request('chat/submitMessage', {
        id,
        message: {
            command: 'submit',
            submitType: 'user',
            text: options.message,
            contextFiles,
            addEnhancedContext: true,
        },
    })

    if (response.type !== 'transcript') {
        streams.error(
            `unexpected chat reply. Expected type "transcript", got "${response.type}"` +
                JSON.stringify(response, null, 2)
        )
        return 1
    }

    const reply = response.messages.at(-1)
    if (!reply) {
        streams.error(
            'unexpected chat reply. Expected non-empty messages, got' + JSON.stringify(response, null, 2)
        )
        return 1
    }

    if (reply.error) {
        streams.error(`error reply: ${reply.error.message}`)
        return 1
    }

    if (options.showContext) {
        const contextFiles = reply.contextFiles ?? []
        streams.log('> Context items:\n')
        for (const [i, item] of contextFiles.entries()) {
            streams.log(`> ${i + 1}. ${item.uri.fsPath}\n`)
        }
        streams.log('\n')
    }
    streams.log(reply.text ?? '' + '\n')
    await client.request('shutdown', null)
    if (options.clientKind === 'ipc') {
        client.notify('exit', null)
    }
    return 0
}
function toUri(dir: string, relativeOrAbsolutePath: string): vscode.Uri {
    const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.resolve(dir, relativeOrAbsolutePath)
    return vscode.Uri.file(absolutePath)
}
