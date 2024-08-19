import { Command } from 'commander'

import { authCommand } from './command-auth/command-auth'
import { benchCommand } from './command-bench/command-bench'
import { chatCommand } from './command-chat'
import { jsonrpcCommand } from './command-jsonrpc-stdio'
import { serverCommand } from './command-jsonrpc-websocket'
import { lintCommand } from './command-lint'

import { version } from '../../package.json'

// This is just a quick way to hide certain commands while experimental
const experimental = {
    all: isTruthyEnv(process.env.CODY_CLI_EXPERIMENTAL_ENABLED),
    lint: isTruthyEnv(process.env.CODY_CLI_EXPERIMENTAL_LINT_ENABLED),
}

export const rootCommand = new Command()
    .name('cody')
    .version(version, '-v, --version')
    .description(
        'The Cody cli supports running Cody in headless mode and interacting with it via JSON-RPC. Run `cody chat -m "Hello" to get started.'
    )
    .addCommand(authCommand())
    .addCommand(chatCommand())
    .addCommand(lintCommand(), {
        hidden: !(experimental.all || experimental.lint),
    })
    .addCommand(new Command('api').addCommand(serverCommand).addCommand(jsonrpcCommand))
    .addCommand(new Command('internal').addCommand(benchCommand))

function isTruthyEnv(value: string | undefined) {
    return ['true', '1' /*'' arguably*/].includes(value?.toLowerCase() ?? 'false')
}
