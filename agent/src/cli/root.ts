import { Command } from 'commander'

import { evaluateAutocompleteCommand } from './evaluate-autocomplete/evaluate-autocomplete'
import { jsonrpcCommand } from './jsonrpc'

export const rootCommand = new Command()
    .name('cody-agent')
    .version('0.1.0')
    .description(
        'Cody Agent supports running the Cody VS Code extension in headless mode and interact with it via JSON-RPC. ' +
            'The Agent is used by editor clients like JetBrains and Neovim.'
    )
    .addCommand(jsonrpcCommand)
    .addCommand(evaluateAutocompleteCommand)
