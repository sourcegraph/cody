import { rootCommand } from './cli/root'

console.error('Starting agent...')

const args = process.argv.slice(2)
console.error({ args })
const { operands } = rootCommand.parseOptions(args)
if (operands.length === 0) {
    args.push('jsonrpc')
}

rootCommand.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
