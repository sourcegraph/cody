import { Command } from 'commander'

import { cliCommand } from '../../../cli/src/command'
import { evaluateAutocompleteCommand } from './evaluate-autocomplete/evaluate-autocomplete'
import { jsonrpcCommand } from './jsonrpc'
import { serverCommand } from './server'
import { simulateAutocomplete } from '../simulate'

export const rootCommand = new Command()
    .name('cody-agent')
    .version('0.1.0')
    .description(
        'Cody Agent supports running the Cody VS Code extension in headless mode and interact with it via JSON-RPC. ' +
            'The Agent is used by editor clients like JetBrains and Neovim.'
    )
    .addCommand(serverCommand)
    .addCommand(jsonrpcCommand)
    .addCommand(evaluateAutocompleteCommand)
    .addCommand(cliCommand)
    .addCommand(simulateAutocomplete)
