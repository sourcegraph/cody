import { Command } from 'commander'
import { chatCommand } from './chat'

export const cliCommand = new Command('experimental-cli')
    .description('Experimental Cody command-line interface')
    .addCommand(chatCommand)
