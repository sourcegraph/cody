import * as commander from 'commander'
import { TestClient } from './TestClient'
import { TestWorkspace } from './TestWorkspace'
import { TESTING_TOKENS } from './testing-tokens'
import path from 'node:path'

export interface EvaluateAutocompleteOptions {

}

export const simulateAutocomplete = new commander.Command('simulate-autocomplete')
    .action(async (options: EvaluateAutocompleteOptions) => {
        // const models = [
        //     { provider: 'fireworks', model: 'starcoder-7b' },
        // ]
        const workspace = new TestWorkspace(path.join(__dirname, '__tests__', 'graph-test'))
        const client = TestClient.create({
            workspaceRootUri: workspace.rootUri,
            name: "graph-context-fireworks",
            token: TESTING_TOKENS.dotcom,
            extraConfiguration: {
                'cody.autocomplete.advanced.provider': "fireworks",
                'cody.autocomplete.advanced.model': "starcoder-7b",
            },
        })
        console.log(client)
        // const clients: TestClient[] = models.map(({ provider, model }) =>
        //     TestClient.create({
        //         workspaceRootUri: workspace.rootUri,
        //         name: `graph-context-${model}`,
        //         token: TESTING_TOKENS.dotcom,
        //         extraConfiguration: {
        //             'cody.autocomplete.advanced.provider': provider,
        //             'cody.autocomplete.advanced.model': model,
        //         },
        //     })
        // )

        console.log('hello')
    })



