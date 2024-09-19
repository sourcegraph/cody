import ora, { type Ora, spinners } from 'ora'

import path from 'node:path'

import type { Polly } from '@pollyjs/core'
import { type ContextItem, ModelUsage, TokenCounterUtils, isDotCom } from '@sourcegraph/cody-shared'
import { Command } from 'commander'

import Table from 'easy-table'
import { isError } from 'lodash'
import * as vscode from 'vscode'
import type { ExtensionTranscriptMessage } from '../../../vscode/src/chat/protocol'
import { activate } from '../../../vscode/src/extension.node'
import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import packageJson from '../../package.json'
import { newEmbeddedAgentClient } from '../agent'
import type { ClientInfo } from '../protocol-alias'
import { Streams } from './Streams'
import { AuthenticatedAccount } from './command-auth/AuthenticatedAccount'
import {
    type AuthenticationOptions,
    accessTokenOption,
    endpointOption,
} from './command-auth/command-login'
import { errorSpinner, notAuthenticated } from './command-auth/messages'
import { legacyCodyClientName } from './legacyCodyClientName'

declare const process: { pkg: { entrypoint: string } } & NodeJS.Process
export interface ChatOptions extends AuthenticationOptions {
    message: string
    stdin?: boolean
    messageArgs?: string[]
    dir: string
    model?: string
    contextRepo?: string[]
    contextFile?: string[]
    showContext: boolean
    debug: boolean
    silent: boolean
    isTesting?: boolean
    ignoreContextWindowErrors: boolean
    streams?: Streams
}

export const chatCommand = () =>
    new Command('chat')
        .description(
            `Chat with codebase context.

Examples:
  cody chat -m 'Tell me about React hooks'
  cody chat --context-file README.md --message 'Summarize this readme'
  git diff | cody chat --stdin -m 'Explain this diff'

Enterprise Only:
  cody chat --context-repo github.com/sourcegraph/cody --message 'What is the agent?'`
        )
        .option('-m, --message <message>', 'Message to send')
        .option('--stdin', 'Read message from stdin', false)
        // Intentionally leave out `.arguments('[message...]')` because it
        // changes the type of `option: ChatOptions` in the action to
        // `string[]`, which is not what we want. This means that cody chat
        // --help does not document you can pass arguments, it will just
        // silently work.
        .addOption(accessTokenOption)
        .addOption(endpointOption)
        .option('-C, --dir <dir>', 'Run in directory <dir>', process.cwd())
        .option('--model <model>', 'Chat model to use')
        .option(
            '--context-repo <repos...>',
            '(Sourcegraph Enterprise only) Names of repositories to use as context. Example: github.com/sourcegraph/cody.'
        )
        .option('--context-file <files...>', 'Local files to include in the context')
        .option('--show-context', 'Show context items in reply', false)
        .option(
            '--ignore-context-window-errors',
            'If true, does not fail fast when a context file is too large to fit into the LLMs context window',
            false
        )
        .option('--silent', 'Disable streaming reply', false)
        .option('--debug', 'Enable debug logging', false)
        .action(async (options: ChatOptions, cmd) => {
            options.messageArgs = cmd.args
            const spinner = ora().start('Logging in')
            const account = await AuthenticatedAccount.fromUserSettings(spinner, options)
            if (isError(account)) {
                errorSpinner(spinner, account, options)
                process.exit(1)
            }
            if (!account?.username) {
                notAuthenticated(spinner)
                process.exit(1)
            }
            options.accessToken = account.accessToken
            options.endpoint = account.serverEndpoint
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

export async function chatAction(options: ChatOptions): Promise<number> {
    const streams = options.streams ?? Streams.default()
    const spinner = ora({
        spinner: spinners.fistBump,
        isSilent: options.silent,
        stream: streams.stderr,
    }).start()
    if (!options.dir) {
        // Should never happen but crashes with a cryptic error message if dir is undefined.
        spinner.fail('No directory provided. To run in the current directory, use the --dir option')
        return 1
    }
    const workspaceRootUri = vscode.Uri.file(path.resolve(options.dir))
    const clientInfo: ClientInfo = {
        name: 'cody-cli',
        version: options.isTesting ? '6.0.0-SNAPSHOT' : packageJson.version,
        workspaceRootUri: workspaceRootUri.toString(),
        capabilities: {
            completions: 'none',
        },
        legacyNameForServerIdentification: legacyCodyClientName,
        extensionConfiguration: {
            serverEndpoint: options.endpoint,
            accessToken: options.accessToken,
            customHeaders: {},
            customConfiguration: {
                'cody.internal.autocomplete.entirelyDisabled': true,
                'cody.experimental.symf.enabled': false,
                'cody.experimental.telemetry.enabled': options.isTesting ? false : undefined,
            },
        },
    }
    spinner.text = 'Initializing...'
    const { serverInfo, client, messageHandler } = await newEmbeddedAgentClient(clientInfo, activate)
    if (!serverInfo.authStatus?.authenticated) {
        notAuthenticated(spinner)
        return 1
    }

    const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })

    if (options.debug) {
        messageHandler.registerNotification('debug/message', message => {
            console.log(`${message.channel}: ${message.message}`)
        })
    }

    const endpoint = serverInfo.authStatus.endpoint ?? options.endpoint
    const tokenSource = new vscode.CancellationTokenSource()
    const token = tokenSource.token

    let isFirstMessageCheck = true

    messageHandler.registerNotification('webview/postMessage', message => {
        if (message.message.type === 'transcript' && !token.isCancellationRequested) {
            const lastMessage = message.message.messages.at(-1)
            if (lastMessage?.model && !spinner.text.startsWith('Model')) {
                const modelName =
                    models.find(model => model.id === lastMessage.model)?.title ?? lastMessage.model
                spinner.text = modelName
                spinner.spinner = spinners.dots
            }
            spinner.prefixText = (lastMessage?.text ?? '') + '\n'

            if (isFirstMessageCheck && !options.ignoreContextWindowErrors) {
                const contextFiles = message.message.messages.at(0)?.contextFiles
                if (contextFiles && contextFiles.length > 0) {
                    isFirstMessageCheck = false
                }

                validateContext(message.message, spinner, endpoint, tokenSource)
            }
        }
    })

    spinner.text = 'Asking Cody...'
    const id = await client.request('chat/new', null)

    if (options.model) {
        await client.request('chat/setModel', { id, model: options.model })
    }

    const contextItems: ContextItem[] = []
    if (options.contextRepo && options.contextRepo.length > 0) {
        if (isDotCom(serverInfo.authStatus)) {
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

        const invalidRepos: string[] = []
        for (const repo of options.contextRepo) {
            if (!repos.some(r => r.name === repo)) {
                invalidRepos.push(repo)
            }
        }

        if (invalidRepos.length > 0) {
            const reposString = invalidRepos.join(', ')
            const errorMessage =
                invalidRepos.length > 1
                    ? `The repositories ${invalidRepos} do not exist on the instance. `
                    : `The repository '${reposString}' does not exist on the instance. `
            spinner.fail(
                errorMessage +
                    'The name needs to match exactly the name of the repo as it appears on your Sourcegraph instance. ' +
                    'Please check the spelling and try again.'
            )
            return 1
        }
        for (const repo of repos) {
            const repoUri = vscode.Uri.parse(`https://${endpoint}/${repo.name}`)
            contextItems.push({
                type: 'repository',
                // TODO: confirm syntax for repo
                uri: repoUri,
                repoName: repo.name,
                repoID: repo.id,
                content: null,
            })
        }
    }

    for (const relativeOrAbsolutePath of options.contextFile ?? []) {
        contextItems.push({
            type: 'file',
            uri: toUri(options.dir, relativeOrAbsolutePath),
        })
    }
    const start = performance.now()
    const messageText = await constructMessageText(options)
    if (!messageText) {
        spinner.fail(
            'No message provided. To send a message, use the --message option or pipe a message to stdin via --stdin'
        )
        return 1
    }

    const response = await client.request(
        'chat/submitMessage',
        {
            id,
            message: {
                command: 'submit',
                submitType: 'user',
                text: messageText,
                addEnhancedContext: false,
                contextItems,
            },
        },
        { token: tokenSource.token }
    )

    if (token.isCancellationRequested) {
        return 1
    }

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
    const tokens = (await TokenCounterUtils.encode(replyText)).length
    const tokensPerSecond = tokens / (elapsed / 1000)
    spinner.text = spinner.text.trim() + ` (${Math.round(tokensPerSecond)} tokens/second)`
    spinner.clear()

    if (options.showContext) {
        const responseContextFiles = response.messages.flatMap(m => m.contextFiles ?? [])
        streams.log('> Context items:\n')
        for (const [i, item] of responseContextFiles.entries()) {
            const displayText = uriDisplayText(item, endpoint)
            streams.log(`> ${i + 1}. ${displayText}\n`)
        }
        streams.log('\n')
    }
    streams.log(replyText + '\n')
    await client.request('shutdown', null)
    spinner.succeed()
    return 0
}

function uriDisplayText(item: ContextItem, endpoint: string): string {
    const uri = vscode.Uri.from(item.uri as any)
    // Workaround for strange URI authority resopnse, reported in
    // https://sourcegraph.slack.com/archives/C05AGQYD528/p1721382757890889
    const remoteURL = new URL(uri.path, endpoint).toString()
    return uri.scheme === 'file' ? uri.fsPath : remoteURL
}

function toUri(dir: string, relativeOrAbsolutePath: string): vscode.Uri {
    const absolutePath = path.isAbsolute(relativeOrAbsolutePath)
        ? relativeOrAbsolutePath
        : path.resolve(dir, relativeOrAbsolutePath)
    return vscode.Uri.file(absolutePath)
}

// Returns the message that is sent to the chat API. The message is a concatenation of
// - Explicitly provided --message option
// - Explicitly provided message arguments
// - From stdin if --stding is provided OR the message argument is exactly the
//   string '-' (conventional for cli tools)
// These parts are concatenated with a blank line between them. For example:
//     git diff || cody chat --stdin explain this diff
//     git diff || cody chat --message 'explain this diff' -
async function constructMessageText(options: ChatOptions): Promise<string> {
    const parts: string[] = []
    if (options.message) {
        parts.push(options.message)
    }
    const messageArgument = options.messageArgs?.join(' ') ?? ''
    const isMessageArgumentFromStdin = messageArgument === '-'
    if (messageArgument && !isMessageArgumentFromStdin) {
        parts.push(messageArgument)
    }
    if (options.stdin || isMessageArgumentFromStdin) {
        parts.push(await readStdin())
    }

    return parts.join('\n\n')
}

async function readStdin(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const input: string[] = []

        process.stdin.on('data', chunk => {
            input.push(chunk.toString())
        })

        process.stdin.on('end', () => {
            resolve(input.join(''))
        })
        process.stdin.on('error', reject)
    })
}

function validateContext(
    message: ExtensionTranscriptMessage,
    spinner: Ora,
    endpoint: string,
    tokenSource: vscode.CancellationTokenSource
): void {
    const tooLargeItems = message.messages.flatMap(messages =>
        (messages.contextFiles ?? []).filter(item => item.isTooLarge)
    )
    if (tooLargeItems.length > 0) {
        const t = new Table()
        for (const item of tooLargeItems) {
            t.cell('File', uriDisplayText(item, endpoint))
            t.cell('Reason', item.isTooLargeReason)
            t.newRow()
        }
        spinner.text = ''
        spinner.prefixText = ''
        spinner.fail(
            'The provided context is too large to fit into the context window. \n' +
                'To fix this problem, either remove the files from --context-file or\n' +
                'edit these files so they become small enough to fit into the context window.\n' +
                'Alternatively, set the flag --ignore-context-window-errors to skip this check.\n\n' +
                t.toString()
        )
        tokenSource.cancel()
    }
}
