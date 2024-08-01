import path from 'node:path'
import type { Polly } from '@pollyjs/core'
import { ModelUsage } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import ora, { spinners } from 'ora'
import * as vscode from 'vscode'
import { activate } from '../../../vscode/src/extension.node'
import { startPollyRecording } from '../../../vscode/src/testutils/polly'
import packageJson from '../../package.json'
import { newEmbeddedAgentClient } from '../agent'
import type { ClientInfo } from '../protocol-alias'
import { Streams } from './Streams'
import { codyCliClientName } from './codyCliClientName'
import { AuthenticatedAccount } from './command-auth/AuthenticatedAccount'
import { notLoggedIn } from './command-auth/messages'

export interface LintOptions {
    accessToken: string
    model?: string
    rule: string[]
    output?: string
    outputFormat?: string
    stdin?: boolean
    file?: string[]
    filesArgs?: string[]
    debug: boolean
    endpoint: string
    isTesting?: boolean
    streams?: Streams
}

//TODO: Remove duplication from `command-chat.ts`
const loginInstruction = 'Sign in with the command: cody auth login --web'

export const lintCommand = () =>
    new Command('lint')
        .description(
            `Apply custom lint rules to your codebase.

Examples:
  cody lint ...
    `
        )
        .option('-i, --file <files...>', 'Code files to lint')
        .option('-r, --rule <rules...>', 'Codylint files listing rules')
        .option('-o, --output <output>', 'Output file')
        .option('--stdin', 'Read paths from stdin', false)
        // Intentionally leave out `.arguments('[message...]')` because it
        // changes the type of `option: ChatOptions` in the action to
        // `string[]`, which is not what we want. This means that cody chat
        // --help does not document you can pass arguments, it will just
        // silently work.
        .option(
            '--access-token <token>',
            'Sourcegraph access token. ' + loginInstruction,
            process.env.SRC_ACCESS_TOKEN ?? ''
        )
        .option(
            '--endpoint <url>',
            'Sourcegraph instance URL',
            process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com'
        )
        .option('--model <model>', 'Chat model to use')
        .option('--debug', 'Enable debug logging', false)
        .action(async (options: LintOptions, cmd) => {
            options.filesArgs = cmd.args

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
                exitCode = await lintAction(options)
            } finally {
                await polly?.stop()
            }
            process.exit(exitCode)
        })

export async function lintAction(options: LintOptions): Promise<number> {
    const streams = options.streams ?? Streams.default()
    const spinner = ora({
        spinner: spinners.point,
        isSilent: false, // will add this later
        stream: streams.stderr,
    }).start()
    const workspaceRootUri = vscode.Uri.file(path.resolve(process.cwd()))
    const clientInfo: ClientInfo = {
        name: codyCliClientName,
        version: options.isTesting ? '6.0.0-SNAPSHOT' : packageJson.version,
        workspaceRootUri: workspaceRootUri.toString(),
        capabilities: {
            completions: 'none',
        },
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
    //@ts-ignore
    const { models } = await client.request('chat/models', { modelUsage: ModelUsage.Chat })

    // console.log('models', JSON.stringify(models, undefined, 2))
    if (options.debug) {
        messageHandler.registerNotification('debug/message', message => {
            console.log(`${message.channel}: ${message.message}`)
        })
    }

    if (!serverInfo.authStatus?.isLoggedIn) {
        notLoggedIn(spinner)
        return 1
    }

    const lintFiles = options.rule
        .map(file => vscode.Uri.file(path.resolve(process.cwd(), file)))
        .map(uri => uri.toString())
    const targetFiles = (options.file ?? [])
        .concat(options.filesArgs ?? [])
        .map(file => vscode.Uri.file(path.resolve(process.cwd(), file)))
        .map(uri => uri.toString())
    spinner.text = `Linting ${targetFiles?.length} files...`
    const response = await client.request('lint/demo', {
        lintFiles,
        targetFiles,
        model: options.model,
    })

    console.log(JSON.stringify(response, null, 2))

    spinner.succeed()
    await client.request('shutdown', null)
    return 0
}
