import { Command } from 'commander'

import { cliCommand } from '../../../cli/src/command'
import { apiCommand } from './api'
import { codyBenchCommand } from './cody-bench/cody-bench'
import { jsonrpcCommand } from './jsonrpc'
import { playgroundCommand } from './playground'
import { serverCommand } from './server'

export const rootCommand = new Command()
    .name('cody-agent')
    .version('0.1.0')
    .description(
        'Cody Agent supports running the Cody VS Code extension in headless mode and interact with it via JSON-RPC. ' +
            'The Agent is used by editor clients like JetBrains and Neovim.'
    )
    .addCommand(serverCommand)
    .addCommand(jsonrpcCommand)
    .addCommand(codyBenchCommand)
    .addCommand(cliCommand)
    .addCommand(apiCommand)
    .addCommand(playgroundCommand)
