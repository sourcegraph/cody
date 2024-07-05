import { Command } from 'commander'

import { authCommand } from './command-auth/command-auth'
import { benchCommand } from './command-bench/command-bench'
import { chatCommand } from './command-chat'
import { jsonrpcCommand } from './command-jsonrpc-stdio'
import { serverCommand } from './command-jsonrpc-websocket'

export const rootCommand = new Command()
    .name('cody-agent')
    .version('0.1.0')
    .description(
        'Cody Agent supports running the Cody VS Code extension in headless mode and interact with it via JSON-RPC. ' +
            'The Agent is used by editor clients like JetBrains and Neovim.'
    )
    .addCommand(new Command('api').addCommand(serverCommand).addCommand(jsonrpcCommand))
    .addCommand(benchCommand)
    .addCommand(chatCommand())
    .addCommand(authCommand())
