import type { Command } from 'commander'

console.log = console.error

// Using require to be able to redirect console.log to console.error
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
