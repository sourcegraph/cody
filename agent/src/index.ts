import type { Command } from 'commander'

console.log = console.error

// IMPORTANT: use require(...) instead of `import` so that we can redirect
// console.log to console.error before evaluating the import. When using
// `import`, we may import modules that accidentally log error messages to
// process.stdout, which breaks the `jsonrpc` command, which uses stdout/stdin
// to communicate with the agent client`jsonrpc` command, which uses
// stdout/stdin to communicate with the agent client.
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const rootCommand: Command = require('./cli/root').rootCommand

const args = process.argv.slice(2)
const { operands } = rootCommand.parseOptions(args)
if (operands.length === 0) {
    args.push('jsonrpc')
}

rootCommand.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
