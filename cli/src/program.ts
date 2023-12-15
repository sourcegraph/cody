#! /usr/bin/env node
import { Command } from 'commander'

import { ConfigurationUseContext } from '@sourcegraph/cody-shared/src/configuration'

import { commitCommand } from './commands/commit'
import { replCommand } from './commands/repl'

export interface GlobalOptions {
    codebase: string
    endpoint: string
    context: ConfigurationUseContext
    debug: boolean
}

const program = new Command()
    .name('cody')
    .version('0.0.1')
    .description('Cody CLI')
    .option('-c, --codebase <value>', 'Codebase to use for context fetching', 'github.com/sourcegraph/cody')
    .option(
        '-e, --endpoint <value>',
        'Sourcegraph instance to connect to',
        process.env.SRC_ENDPOINT ?? 'https://sourcegraph.com'
    )
    .option('--context [embeddings,keyword,none,blended]', 'How Cody fetches context', 'blended')
    .option('--debug', 'Enable debug logging', false)
    .addCommand(replCommand)
    .addCommand(commitCommand)

// Make `repl` the default subcommand.
const args = process.argv.slice(2)
const { operands } = program.parseOptions(args)
if (operands.length === 0) {
    args.push('repl')
}

program.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
