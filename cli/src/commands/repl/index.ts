import { Command } from 'commander'
import prompts from 'prompts'

import { getCompletionWithContext } from '../../client/completions'
import { GlobalOptions } from '../../program'

interface ReplCommandOptions {
    prompt?: string
}

export const replCommand = new Command('repl')
    .description('Cody repl')
    .option('-p, --prompt <value>', 'Give Cody a prompt')
    .action(run)

async function run({ prompt }: ReplCommandOptions, program: Command): Promise<void> {
    const globalOptions = program.optsWithGlobals<GlobalOptions>()

    let promptToUse = prompt
    if (prompt === undefined || prompt === '') {
        const response = await prompts({
            type: 'text',
            name: 'value',
            message: 'What do you want to ask Cody?',
        })

        promptToUse = response.value as string
    }

    const completion = await getCompletionWithContext(globalOptions, promptToUse || '', undefined, globalOptions.debug)
    console.log(completion)
}
