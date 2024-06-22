import { PromptString, createOllamaClient, ps } from '@sourcegraph/cody-shared'
import { Command } from 'commander'
import dedent from 'dedent'
import { URI } from 'vscode-uri'
import { getModelHelpers } from '../../../vscode/src/completions/providers/ollama-models'

interface PlaygroundOptions {
    evalCommand: string
}

const model = 'deepseek-coder-v2'

class AutocompleteProvider {
    private client = createOllamaClient({ model, url: 'http://127.0.0.1:11434' })
    async completions(params: { code: string }): Promise<{ autocomplete: string }> {
        if (params.code.indexOf('<CURSOR>') < 0) {
            throw new Error(`invalid params: ${JSON.stringify(params)}`)
        }
        const [before, after] = params.code.split('<CURSOR>')
        const modelHelper = getModelHelpers('deepseek-coder')
        const prompt = modelHelper.getPrompt({
            context: ps``,
            currentFileNameComment: ps``,
            isInfill: true,
            languageId: 'typescript',
            prefix: PromptString.unsafe_fromUserQuery(before),
            suffix: PromptString.unsafe_fromUserQuery(after),
            snippets: [],
            uri: URI.file('foo.ts'),
        })
        console.log(prompt.toString())
        const abortController = new AbortController()
        for await (const part of this.client.complete(
            { model, prompt, template: '{{ .Prompt }}' },
            abortController
        )) {
            console.log({ part })
        }
        return { autocomplete: '' }
    }
}

export const playgroundCommand = new Command('playground')
    .option('--eval-command <command>', 'The command to run the evaluation with')
    .action(async (options: PlaygroundOptions) => {
        const provider = new AutocompleteProvider()
        provider.completions({
            code: dedent`
            function sum(a: number, b: number): number {
              const <CURSOR> = a + b
              return result
            }
            `,
        })
    })
const args = process.argv.slice(2)

playgroundCommand.parseAsync(args, { from: 'user' }).catch(error => {
    console.error('Error:', error)
    process.exit(1)
})
