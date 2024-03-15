import { Command } from 'commander'
import { chatCommand } from './chat'

const experimentalCommands = new Command('experimental')
    .description('Experimental Cody CLI commands')
    .addCommand(chatCommand)

export const rootCommand = new Command()
    .name('cody-cli')
    .version('0.0.1')
    .description('Cody command-line interface')
    .addCommand(experimentalCommands)

const args = process.argv.slice(2)
rootCommand.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
