import { Command } from 'commander'

import { authCommand } from './command-auth/command-auth'
import { benchCommand } from './command-bench/command-bench'
import { chatCommand } from './command-chat'
import { jsonrpcCommand } from './command-jsonrpc-stdio'
import { serverCommand } from './command-jsonrpc-websocket'

import { version } from '../../package.json'
import { contextCommand } from './command-context/command-context'

export const rootCommand = new Command()
    .name('cody')
    .version(version, '-v, --version')
    .description(
        'The Cody cli supports running Cody in headless mode and interacting with it via JSON-RPC. Run `cody chat -m "Hello" to get started.'
    )
    .addCommand(authCommand())
    .addCommand(chatCommand())
    .addCommand(new Command('api').addCommand(serverCommand).addCommand(jsonrpcCommand))
    .addCommand(new Command('internal').addCommand(benchCommand).addCommand(contextCommand))
